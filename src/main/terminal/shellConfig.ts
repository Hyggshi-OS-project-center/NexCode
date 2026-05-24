/**
 * Shell profiles for the integrated terminal (CMD, PowerShell, Bash).
 */
import { existsSync } from 'fs';
import path from 'path';
import type { TerminalShell } from '../../shared/types';
import { BASH_CWD_PROMPT_INIT } from './cwdProtocol';
import {
  buildPowerShellEncodedStartup,
  CMD_STARTUP_ARGS,
  stdioEncodingForShell,
  type TerminalStdioEncoding,
} from './terminalEncoding';

export interface ShellProfile {
  exe: string;
  args: string[];
  /** Bytes written to stdin right after spawn (bash prompt hook, etc.) */
  init?: string;
  kind: TerminalShell;
  /** How stdout/stderr from the child process are decoded */
  stdioEncoding: TerminalStdioEncoding;
}

let cachedPowerShellExe: string | null = null;

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
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    );
  }

  const winRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  candidates.push(
    path.join(winRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  );

  for (const exe of candidates) {
    if (existsSync(exe)) {
      cachedPowerShellExe = exe;
      return exe;
    }
  }

  // Windows PowerShell is usually on PATH; only used if explicit paths were missing.
  cachedPowerShellExe = 'powershell.exe';
  return cachedPowerShellExe;
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
      const exe = process.env.SHELL || 'bash';
      return {
        kind: 'bash',
        exe,
        args: [],
        init: BASH_CWD_PROMPT_INIT,
        stdioEncoding: stdioEncodingForShell('bash', exe),
      };
    }
  }
}
