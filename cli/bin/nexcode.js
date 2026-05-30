#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const USAGE = `NexCode CLI

Usage:
  nexcode [path ...]
  nex .
  .clipse .

Options:
  -h, --help       Show help
  -v, --version    Show version

Environment:
  NEXCODE_PATH     Path to NexCode IDE executable`;

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src', 'main', 'main.ts'))) {
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

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  const result = spawnSync(probe, args, { stdio: 'ignore', shell: process.platform !== 'win32' });
  return result.status === 0;
}

function existingFile(filePath) {
  return filePath && fs.existsSync(filePath) ? filePath : null;
}

function getWindowsInstallCandidates() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];

  for (const root of [localAppData, programFiles, programFilesX86]) {
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

  const repoRoot = findRepoRoot(__dirname);
  if (repoRoot && fs.existsSync(path.join(repoRoot, 'node_modules', 'electron'))) {
    const electronPath = require(path.join(repoRoot, 'node_modules', 'electron'));
    return {
      command: electronPath,
      args: [repoRoot],
    };
  }

  if (process.platform === 'win32') {
    for (const candidate of getWindowsInstallCandidates()) {
      const exe = existingFile(candidate);
      if (exe) return { command: exe, args: [] };
    }
  }

  if (commandExists('nexcode-ide')) {
    return { command: 'nexcode-ide', args: [] };
  }

  throw new Error(
    'Could not find NexCode IDE. Set NEXCODE_PATH to the NexCode executable or run from the repository after npm install.',
  );
}

function normalizePathArg(arg) {
  if (!arg || arg.startsWith('-')) return arg;
  return path.resolve(process.cwd(), arg);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(readPackageVersion());
    return;
  }

  const launcher = resolveLauncher();
  const appArgs = args.map(normalizePathArg);
  const child = spawn(launcher.command, [...launcher.args, ...appArgs], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
