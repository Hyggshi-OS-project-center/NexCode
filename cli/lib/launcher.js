/**
 * Locates an installed (or development) NexCode IDE and opens paths in it.
 *
 * Carried over from the original launcher so `nexcode .` keeps behaving the
 * same way: if the app is already running, Electron's second-instance flow
 * focuses the existing window instead of starting a new one.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { findRepoRoot } = require('./support');

function existingFile(filePath) {
  return filePath && fs.existsSync(filePath) ? filePath : null;
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  const result = spawnSync(probe, args, {
    stdio: 'ignore',
    shell: process.platform !== 'win32',
  });
  return result.status === 0;
}

function windowsInstallCandidates() {
  const candidates = [];
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ];

  for (const root of roots) {
    if (!root) continue;
    candidates.push(path.join(root, 'NexCode IDE', 'NexCode IDE.exe'));
    candidates.push(path.join(root, 'NexCode', 'NexCode IDE.exe'));
  }
  return candidates;
}

function resolveLauncher() {
  if (process.env.NEXCODE_PATH) {
    const configured = existingFile(process.env.NEXCODE_PATH);
    if (!configured) {
      throw new Error(`NEXCODE_PATH does not exist: ${process.env.NEXCODE_PATH}`);
    }
    return { command: configured, args: [] };
  }

  // Running from a checkout: use the local Electron with the repo as the app.
  const repoRoot = findRepoRoot(__dirname);
  if (repoRoot && fs.existsSync(path.join(repoRoot, 'node_modules', 'electron'))) {
    const electronPath = require(path.join(repoRoot, 'node_modules', 'electron'));
    return { command: electronPath, args: [repoRoot] };
  }

  if (process.platform === 'win32') {
    for (const candidate of windowsInstallCandidates()) {
      const exe = existingFile(candidate);
      if (exe) return { command: exe, args: [] };
    }
  }

  if (commandExists('nexcode-ide')) {
    return { command: 'nexcode-ide', args: [] };
  }

  throw new Error(
    'Could not find NexCode IDE. Set NEXCODE_PATH to the NexCode executable, ' +
      'or run from the repository after npm install.',
  );
}

/** Starts the IDE detached so the terminal returns immediately. */
function launch(launcher, paths) {
  const child = spawn(launcher.command, [...launcher.args, ...paths], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

module.exports = { launch, resolveLauncher };
