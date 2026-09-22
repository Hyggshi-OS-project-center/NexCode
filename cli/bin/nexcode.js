#!/usr/bin/env node

/**
 * NexCode CLI.
 *
 *   nexcode .                     open a folder in the IDE (legacy behaviour)
 *   nexcode ask "fix the bug"     one-shot agent run, streamed to stdout
 *   nexcode chat                  interactive session
 *   nexcode models                list models for the active provider
 *   nexcode config                show or change provider settings
 *
 * Paths are still accepted as the first argument so existing muscle memory
 * (`nexcode .`) keeps working — anything that isn't a known subcommand is
 * treated as a path to open.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
  PROVIDERS,
  color,
  describeProvider,
  loadAiModule,
  loadSettings,
  readPackageVersion,
  saveSettings,
  settingsPath,
} = require('../lib/support');

const { applyFileChanges, providerBanner, runTurn } = require('../lib/agent');
const { resolveLauncher, launch } = require('../lib/launcher');

const SUBCOMMANDS = new Set(['ask', 'chat', 'models', 'config', 'open', 'help', 'version']);

const USAGE = `${color.bold('NexCode CLI')} — the NexCode agent in your terminal

${color.bold('Usage')}
  nexcode [path ...]              Open paths in NexCode IDE
  nexcode open [path ...]         Same, explicitly
  nexcode ask <prompt>            Ask the agent once; the reply streams to stdout
  nexcode chat                    Interactive session (type /exit to leave)
  nexcode models                  List models available to the active provider
  nexcode config [key value]      Show or change provider settings

${color.bold('Options')}
  -C, --cwd <dir>                 Workspace root for the agent (default: cwd)
  -y, --yes                       Apply proposed file changes without asking
  -q, --quiet                     Suppress the banner and tool progress
  -h, --help                      Show this help
  -v, --version                   Show version

${color.bold('Environment')}
  NEXCODE_PATH                    Path to the NexCode IDE executable
  NEXCODE_AI_PROVIDER             gemini | openrouter | claude | local
  ANTHROPIC_API_KEY               Overrides the stored Claude key
  GEMINI_API_KEY                  Overrides the stored Gemini key
  OPENROUTER_API_KEY              Overrides the stored OpenRouter key
  NEXCODE_LOCAL_BASE_URL          Local OpenAI-compatible server base URL

${color.bold('Examples')}
  nexcode ask "explain src/main/ai/streaming.ts"
  nexcode ask "add a --json flag to the CLI" --yes
  nexcode chat -C ~/projects/site
  nexcode config aiProvider claude
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { yes: false, quiet: false, cwd: null, help: false, version: false };
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-y' || arg === '--yes') flags.yes = true;
    else if (arg === '-q' || arg === '--quiet') flags.quiet = true;
    else if (arg === '-h' || arg === '--help') flags.help = true;
    else if (arg === '-v' || arg === '--version') flags.version = true;
    else if (arg === '-C' || arg === '--cwd') {
      i += 1;
      flags.cwd = argv[i];
    } else rest.push(arg);
  }

  return { flags, rest };
}

function resolveWorkspace(flags) {
  const target = flags.cwd ? path.resolve(process.cwd(), flags.cwd) : process.cwd();
  if (!fs.existsSync(target)) {
    throw new Error(`Workspace folder does not exist: ${target}`);
  }
  return target;
}

/** Fails early with a readable message instead of an API error mid-stream. */
function requireCredentials(settings) {
  const info = describeProvider(settings);
  if (info.hasKey) return;

  const envHint = {
    claude: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  }[info.name];

  throw new Error(
    `No API key configured for the "${info.name}" provider.\n` +
      `Set it in the IDE (Settings → AI), export ${envHint}, or run:\n\n` +
      `  nexcode config ${info.name}ApiKey <your-key>\n`,
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandAsk(args, flags) {
  const prompt = args.join(' ').trim();
  if (!prompt) throw new Error('Nothing to ask. Usage: nexcode ask "<prompt>"');

  const settings = loadSettings();
  requireCredentials(settings);
  const workspacePath = resolveWorkspace(flags);

  if (!flags.quiet) {
    process.stderr.write(`${providerBanner(settings, workspacePath)}\n`);
  }

  const history = [];
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on('SIGINT', onSigint);

  try {
    const { ok, result } = await runTurn({
      settings,
      history,
      prompt,
      workspacePath,
      quiet: flags.quiet,
      signal: controller.signal,
    });

    await applyFileChanges(result.actions, { workspacePath, autoApprove: flags.yes });
    return ok ? 0 : 1;
  } finally {
    process.off('SIGINT', onSigint);
  }
}

async function commandChat(args, flags) {
  const settings = loadSettings();
  requireCredentials(settings);
  const workspacePath = resolveWorkspace(flags);

  process.stderr.write(`${providerBanner(settings, workspacePath)}\n`);
  process.stderr.write(color.dim('Type /exit to quit, /clear to reset, /apply to re-apply.\n'));

  const history = [];
  let lastActions = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: color.cyan('› '),
  });

  // Ctrl-C stops the current reply; a second one at an empty prompt exits.
  let controller = null;
  rl.on('SIGINT', () => {
    if (controller) {
      controller.abort();
      controller = null;
      process.stderr.write(color.dim('\nStopped.\n'));
      rl.prompt();
      return;
    }
    rl.close();
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      continue;
    }
    if (input === '/exit' || input === '/quit') break;
    if (input === '/clear') {
      history.length = 0;
      lastActions = [];
      process.stderr.write(color.dim('Context cleared.\n'));
      rl.prompt();
      continue;
    }
    if (input === '/apply') {
      await applyFileChanges(lastActions, { workspacePath, autoApprove: true });
      rl.prompt();
      continue;
    }

    controller = new AbortController();
    try {
      const { result } = await runTurn({
        settings,
        history,
        prompt: input,
        workspacePath,
        quiet: flags.quiet,
        signal: controller.signal,
      });
      lastActions = result.actions || [];
      await applyFileChanges(lastActions, { workspacePath, autoApprove: flags.yes });
    } catch (err) {
      process.stderr.write(color.red(`${err instanceof Error ? err.message : String(err)}\n`));
    } finally {
      controller = null;
    }

    rl.prompt();
  }

  rl.close();
  return 0;
}

async function commandModels() {
  const settings = loadSettings();
  const info = describeProvider(settings);

  let models = [];
  if (info.name === 'claude') {
    models = await loadAiModule('claudeService').listClaudeModels(settings.claudeApiKey);
  } else if (info.name === 'openrouter') {
    models = await loadAiModule('openRouterService').listOpenRouterModels(settings.openRouterApiKey);
  } else if (info.name === 'local') {
    models = await loadAiModule('localService').listLocalModels(settings.localAiBaseUrl);
  } else {
    models = await loadAiModule('geminiService').listGeminiModels(settings.geminiApiKey);
  }

  if (models.length === 0) {
    process.stderr.write(color.yellow(`No models returned for "${info.name}".\n`));
    return 1;
  }

  for (const model of models) {
    const active = model.value === info.model ? color.green('*') : ' ';
    const vision = model.supportsImages ? color.dim(' [vision]') : '';
    process.stdout.write(`${active} ${model.value}${vision}\n`);
  }
  return 0;
}

/** Keys a user may set from the CLI. API keys are never printed back. */
const CONFIG_KEYS = new Set([
  'aiProvider',
  'geminiApiKey',
  'geminiModel',
  'openRouterApiKey',
  'openRouterModel',
  'claudeApiKey',
  'claudeModel',
  'localAiBaseUrl',
  'localAiModel',
]);

function commandConfig(args) {
  const settings = loadSettings();

  if (args.length === 0) {
    const info = describeProvider(settings);
    process.stdout.write(`${color.bold('Settings')} ${color.dim(settingsPath())}\n`);
    process.stdout.write(`  aiProvider      ${info.name}\n`);
    process.stdout.write(`  model           ${info.model || '(default)'}\n`);
    if (info.baseUrl) process.stdout.write(`  localAiBaseUrl  ${info.baseUrl}\n`);
    // Presence only — never echo a secret to the terminal or a log.
    process.stdout.write(`  apiKey          ${info.hasKey ? color.green('set') : color.red('missing')}\n`);
    return 0;
  }

  const [key, ...valueParts] = args;
  if (!CONFIG_KEYS.has(key)) {
    throw new Error(`Unknown setting "${key}". Known keys: ${[...CONFIG_KEYS].join(', ')}`);
  }

  const value = valueParts.join(' ');
  if (!value) throw new Error(`Usage: nexcode config ${key} <value>`);

  if (key === 'aiProvider' && !PROVIDERS.includes(value)) {
    throw new Error(`aiProvider must be one of: ${PROVIDERS.join(', ')}`);
  }

  saveSettings({ [key]: value });
  const shown = /apikey/i.test(key) ? '(hidden)' : value;
  process.stdout.write(`${color.green('Saved')} ${key} = ${shown}\n`);
  return 0;
}

function commandOpen(args) {
  const launcher = resolveLauncher();
  launch(launcher, args.map((arg) => path.resolve(process.cwd(), arg)));
  return 0;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));

  if (flags.version) {
    process.stdout.write(`${readPackageVersion()}\n`);
    return 0;
  }

  const command = rest[0];
  const isSubcommand = command && SUBCOMMANDS.has(command);

  if (flags.help || command === 'help' || (!command && rest.length === 0 && flags.help)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  // No subcommand → treat everything as paths, matching the original launcher.
  if (!isSubcommand) {
    if (rest.length === 0) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    return commandOpen(rest);
  }

  const args = rest.slice(1);

  switch (command) {
    case 'ask':
      return commandAsk(args, flags);
    case 'chat':
      return commandChat(args, flags);
    case 'models':
      return commandModels();
    case 'config':
      return commandConfig(args);
    case 'open':
      return commandOpen(args);
    case 'version':
      process.stdout.write(`${readPackageVersion()}\n`);
      return 0;
    default:
      process.stdout.write(`${USAGE}\n`);
      return 0;
  }
}

main()
  .then((code) => {
    process.exitCode = code || 0;
  })
  .catch((error) => {
    process.stderr.write(color.red(`${error instanceof Error ? error.message : String(error)}\n`));
    process.exitCode = 1;
  });
