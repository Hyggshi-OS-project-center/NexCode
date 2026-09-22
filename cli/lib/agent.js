/**
 * Runs the NexCode agent from the terminal and streams the reply to stdout.
 *
 * The important bit is `onDelta`: every fragment the model produces is written
 * to stdout the moment it arrives, so the answer appears token by token in the
 * terminal exactly as it does in the IDE sidebar — same transport, same code.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { color, describeProvider, loadAiModule } = require('./support');

/** Dispatches to the provider configured in settings, mirroring the IPC handler. */
function callProvider(settings, messages, workspacePath, callbacks) {
  switch (settings.aiProvider) {
    case 'claude': {
      const { chatWithClaude } = loadAiModule('claudeService');
      return chatWithClaude(
        settings.claudeApiKey,
        settings.claudeModel,
        messages,
        workspacePath,
        null,
        callbacks,
      );
    }
    case 'openrouter': {
      const { chatWithOpenRouter } = loadAiModule('openRouterService');
      return chatWithOpenRouter(
        settings.openRouterApiKey,
        settings.openRouterModel,
        messages,
        workspacePath,
        null,
        undefined,
        callbacks,
      );
    }
    case 'local': {
      const { chatWithLocal } = loadAiModule('localService');
      return chatWithLocal(
        settings.localAiBaseUrl,
        settings.localAiModel,
        messages,
        workspacePath,
        null,
        callbacks,
      );
    }
    default: {
      const { chatWithGemini } = loadAiModule('geminiService');
      return chatWithGemini(
        settings.geminiApiKey,
        settings.geminiModel,
        messages,
        workspacePath,
        null,
        callbacks,
      );
    }
  }
}

/**
 * Streams one agent turn.
 *
 * `history` is mutated with the user turn and, on success, the model turn, so
 * the interactive REPL keeps context across questions.
 */
async function runTurn(options) {
  const { settings, history, prompt, workspacePath, quiet, signal } = options;

  history.push({ role: 'user', text: prompt });

  let wroteAnything = false;
  let lastStatus = '';

  const callbacks = {
    signal,
    onDelta(text) {
      // This is the streaming effect: straight to the terminal, no buffering.
      if (!wroteAnything && !quiet) process.stdout.write('\n');
      wroteAnything = true;
      process.stdout.write(text);
    },
    onStatus(status) {
      if (quiet) return;
      // Tool progress goes to stderr so `nexcode ask ... > out.md` stays clean.
      if (status.label === lastStatus) return;
      lastStatus = status.label;
      const mark = status.status === 'failed' ? color.red('✗') : color.dim('·');
      process.stderr.write(`${mark} ${color.dim(status.label)}\n`);
    },
  };

  const result = await callProvider(settings, history, workspacePath, callbacks);

  if (wroteAnything) process.stdout.write('\n');

  if (result.error && !result.text) {
    process.stderr.write(color.red(`\n${result.error}\n`));
    return { ok: false, result };
  }

  // Non-streaming fallback: some error paths return text without deltas.
  if (!wroteAnything && result.text) {
    process.stdout.write(`\n${result.text}\n`);
  }

  if (result.text) history.push({ role: 'model', text: result.text });

  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Staged file changes
// ---------------------------------------------------------------------------

/**
 * `write_file` and `delete_file` only *stage* changes — the IDE applies them
 * after the user accepts a diff. The CLI has to do the same job, so nothing
 * touches the disk until it is confirmed (or `--yes` is passed).
 */
function collectFileChanges(actions) {
  return (actions || []).filter(
    (action) => action.type === 'write_file' || action.type === 'delete_file',
  );
}

function summarizeChange(change, workspacePath) {
  const shown = workspacePath ? path.relative(workspacePath, change.path) : change.path;
  const label = shown && !shown.startsWith('..') ? shown : change.path;

  if (change.type === 'delete_file') return `${color.red('delete')}  ${label}`;

  const existed = typeof change.originalContent === 'string' && change.originalContent.length > 0;
  const verb = existed ? color.yellow('update') : color.green('create');
  const lines = String(change.content || '').split('\n').length;
  return `${verb}  ${label} ${color.dim(`(${lines} line${lines === 1 ? '' : 's'})`)}`;
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function applyFileChanges(actions, options) {
  const changes = collectFileChanges(actions);
  if (changes.length === 0) return { applied: 0, skipped: 0 };

  const { workspacePath, autoApprove } = options;

  process.stderr.write(`\n${color.bold('Proposed changes:')}\n`);
  for (const change of changes) {
    process.stderr.write(`  ${summarizeChange(change, workspacePath)}\n`);
  }

  let approved = autoApprove;
  if (!approved) {
    if (!process.stdin.isTTY) {
      // Piped input can't answer a prompt; refusing is the safe default.
      process.stderr.write(
        color.yellow('\nNot a terminal — changes were not applied. Re-run with --yes to apply.\n'),
      );
      return { applied: 0, skipped: changes.length };
    }
    approved = await askYesNo(`\nApply ${changes.length} change(s)? [y/N] `);
  }

  if (!approved) {
    process.stderr.write(color.dim('Skipped.\n'));
    return { applied: 0, skipped: changes.length };
  }

  let applied = 0;
  for (const change of changes) {
    try {
      if (change.type === 'delete_file') {
        fs.rmSync(change.path, { force: true });
      } else {
        fs.mkdirSync(path.dirname(change.path), { recursive: true });
        fs.writeFileSync(change.path, String(change.content ?? ''), 'utf8');
      }
      applied += 1;
    } catch (err) {
      process.stderr.write(
        color.red(`Failed on ${change.path}: ${err instanceof Error ? err.message : String(err)}\n`),
      );
    }
  }

  process.stderr.write(color.green(`Applied ${applied} change(s).\n`));
  return { applied, skipped: changes.length - applied };
}

/** One-line banner describing what the run will use. */
function providerBanner(settings, workspacePath) {
  const info = describeProvider(settings);
  const bits = [`${color.cyan(info.name)}`, color.dim(info.model || '(default)')];
  if (info.baseUrl) bits.push(color.dim(info.baseUrl));
  bits.push(color.dim(workspacePath));
  return bits.join(color.dim(' · '));
}

module.exports = {
  applyFileChanges,
  collectFileChanges,
  providerBanner,
  runTurn,
};
