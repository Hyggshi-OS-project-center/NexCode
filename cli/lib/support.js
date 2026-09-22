/**
 * Shared helpers for the NexCode CLI.
 *
 * The CLI reuses the *same* agent services the IDE runs (src/main/ai/*), which
 * is possible because none of them import Electron — they only need `https`
 * and `fs`. That means streaming, tool calling and the workspace sandbox
 * behave identically in the terminal and in the app, instead of being a second
 * implementation that drifts.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PRODUCT_NAME = 'NexCode IDE';

// ---------------------------------------------------------------------------
// Repo / build resolution
// ---------------------------------------------------------------------------

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'src', 'main', 'main.ts'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function readPackageVersion() {
  const repoRoot = findRepoRoot(__dirname);
  if (!repoRoot) return 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Loads a compiled service from dist/main/ai.
 *
 * The AI code is TypeScript, so `npm run build:main` has to have run at least
 * once. Fail with that instruction rather than a raw MODULE_NOT_FOUND.
 */
function loadAiModule(name) {
  const repoRoot = findRepoRoot(__dirname);
  if (!repoRoot) {
    throw new Error('Could not locate the NexCode repository from ' + __dirname);
  }

  const modulePath = path.join(repoRoot, 'dist', 'main', 'ai', name + '.js');
  if (!fs.existsSync(modulePath)) {
    throw new Error(
      'The AI services are not built yet.\n' +
        'Run this once from the repository root:\n\n' +
        '  npm run build:main\n',
    );
  }
  return require(modulePath);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Mirrors Electron's `app.getPath('userData')`, which is
 * `<appData>/<productName>`. Electron is not loaded here, so the per-platform
 * appData location is resolved by hand.
 */
function userDataDir() {
  if (process.env.NEXCODE_USER_DATA) return process.env.NEXCODE_USER_DATA;

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, PRODUCT_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', PRODUCT_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, PRODUCT_NAME);
}

function settingsPath() {
  return path.join(userDataDir(), 'settings.json');
}

const SETTINGS_DEFAULTS = {
  aiProvider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openRouterApiKey: '',
  openRouterModel: 'openai/gpt-4o-mini',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-20250514',
  localAiBaseUrl: 'http://localhost:11434/v1',
  localAiModel: '',
};

/**
 * Reads the IDE's settings.json, then lets environment variables win — handy
 * for CI and for running against a different key without touching the app.
 */
function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    // No settings file yet — env vars or `nexcode config` can still supply keys.
  }

  const settings = Object.assign({}, SETTINGS_DEFAULTS, stored);

  const env = process.env;
  if (env.NEXCODE_AI_PROVIDER) settings.aiProvider = env.NEXCODE_AI_PROVIDER;
  if (env.GEMINI_API_KEY) settings.geminiApiKey = env.GEMINI_API_KEY;
  if (env.OPENROUTER_API_KEY) settings.openRouterApiKey = env.OPENROUTER_API_KEY;
  if (env.ANTHROPIC_API_KEY) settings.claudeApiKey = env.ANTHROPIC_API_KEY;
  if (env.NEXCODE_CLAUDE_API_KEY) settings.claudeApiKey = env.NEXCODE_CLAUDE_API_KEY;
  if (env.NEXCODE_LOCAL_BASE_URL) settings.localAiBaseUrl = env.NEXCODE_LOCAL_BASE_URL;

  return settings;
}

function saveSettings(partial) {
  const dir = userDataDir();
  fs.mkdirSync(dir, { recursive: true });

  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    stored = {};
  }

  const merged = Object.assign({}, stored, partial);
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

const PROVIDERS = ['gemini', 'openrouter', 'claude', 'local'];

/** The model id and credential in play for the active provider. */
function describeProvider(settings) {
  switch (settings.aiProvider) {
    case 'claude':
      return { name: 'claude', model: settings.claudeModel, hasKey: Boolean(settings.claudeApiKey) };
    case 'openrouter':
      return {
        name: 'openrouter',
        model: settings.openRouterModel,
        hasKey: Boolean(settings.openRouterApiKey),
      };
    case 'local':
      return {
        name: 'local',
        model: settings.localAiModel || '(auto)',
        hasKey: true,
        baseUrl: settings.localAiBaseUrl,
      };
    default:
      return { name: 'gemini', model: settings.geminiModel, hasKey: Boolean(settings.geminiApiKey) };
  }
}

// ---------------------------------------------------------------------------
// Terminal output
// ---------------------------------------------------------------------------

const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

function paint(code) {
  return (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));
}

const color = {
  dim: paint('2'),
  bold: paint('1'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  cyan: paint('36'),
};

module.exports = {
  PRODUCT_NAME,
  PROVIDERS,
  color,
  describeProvider,
  findRepoRoot,
  loadAiModule,
  loadSettings,
  readPackageVersion,
  saveSettings,
  settingsPath,
  userDataDir,
  useColor,
};
