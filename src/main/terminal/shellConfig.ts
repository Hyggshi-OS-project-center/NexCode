/**
 * Shell profiles for the integrated terminal (CMD, PowerShell, Bash).
 */
import { statSync } from 'fs';
import path from 'path';
import type { TerminalShell } from '../../shared/types';
import { BASH_CWD_PS1 } from './cwdProtocol';
import {
  buildPowerShellEncodedStartup,
  CMD_STARTUP_ARGS,
  stdioEncodingForShell,
  type TerminalStdioEncoding,
} from './terminalEncoding';

export interface ShellProfile {
  exe: string;
  args: string[];
  env?: Record<string, string>;
  /** Bytes written to stdin right after spawn (bash prompt hook, etc.) */
  init?: string;
  kind: TerminalShell;
  /** How stdout/stderr from the child process are decoded */
  stdioEncoding: TerminalStdioEncoding;
}

let cachedPowerShellExe: string | null = null;
let cachedBashExe: string | null = null;

function isUsableExecutablePath(exe: string): boolean {
  try {
    const stat = statSync(exe);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/** Prefer PowerShell 7 (pwsh) when installed on disk, else Windows PowerShell 5.1. */
export function resolvePowerShellExe(): string {
  if (cachedPowerShellExe) return cachedPowerShellExe;

  const candidates: string[] = [];

  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'PowerShell', '7', 'pwsh.exe'));
  }

  const winRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  candidates.push(
    path.join(winRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  );

  for (const exe of candidates) {
    if (isUsableExecutablePath(exe)) {
      cachedPowerShellExe = exe;
      return exe;
    }
  }

  // Windows PowerShell is usually on PATH; only used if explicit paths were missing.
  cachedPowerShellExe = 'powershell.exe';
  return cachedPowerShellExe;
}

export function resolveBashExe(): string {
  if (cachedBashExe) return cachedBashExe;
  if (process.platform !== 'win32') {
    cachedBashExe = process.env.SHELL || 'bash';
    return cachedBashExe;
  }

  const candidates: string[] = [];
  const envShell = process.env.SHELL;
  if (envShell && /(?:^|[\\/])bash(?:\.exe)?$/i.test(envShell)) {
    candidates.push(envShell);
  }
  if (process.env.ProgramFiles) {
    candidates.push(
      path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
      path.join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'bash.exe'),
    );
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(
      path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
      path.join(process.env['ProgramFiles(x86)'], 'Git', 'usr', 'bin', 'bash.exe'),
    );
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'));
  }

  const winRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  candidates.push(path.join(winRoot, 'System32', 'bash.exe'));

  for (const exe of candidates) {
    if (isUsableExecutablePath(exe)) {
      cachedBashExe = exe;
      return exe;
    }
  }

  cachedBashExe = 'bash.exe';
  return cachedBashExe;
}

export function defaultTerminalShell(): TerminalShell {
  if (process.platform === 'win32') return 'powershell';
  return 'bash';
}

export function resolveShellProfile(shell: TerminalShell): ShellProfile {
  switch (shell) {
    case 'cmd': {
      const exe = process.env.ComSpec || 'cmd.exe';
      return {
        kind: 'cmd',
        exe,
        args: [...CMD_STARTUP_ARGS],
        stdioEncoding: stdioEncodingForShell('cmd', exe),
      };
    }
    case 'powershell': {
      const exe = resolvePowerShellExe();
      return {
        kind: 'powershell',
        exe,
        args: ['-NoLogo', '-NoExit', '-EncodedCommand', buildPowerShellEncodedStartup(exe)],
        stdioEncoding: stdioEncodingForShell('powershell', exe),
      };
    }
    case 'bash':
    default: {
      const exe = resolveBashExe();
      return {
        kind: 'bash',
        exe,
        args: ['--noprofile', '--norc', '-i'],
        env: { PS1: BASH_CWD_PS1 },
        stdioEncoding: stdioEncodingForShell('bash', exe),
      };
    }
  }
}
