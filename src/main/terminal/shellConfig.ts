/**
 * Shell configuration & detection for integrated terminal.
 * Cross-platform detection for Windows, macOS, and Linux.
 */
import { existsSync, statSync } from 'fs';
import path from 'path';
import type { TerminalShell, TerminalShellInfo } from '../../shared/types';

export interface ShellProfile {
  name: string;
  exe: string;
  args: string[];
  env?: Record<string, string>;
  kind: TerminalShell;
}

function isUsableExecutablePath(exe: string): boolean {
  try {
    if (!exe) return false;
    const stat = statSync(exe);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function defaultTerminalShell(): TerminalShell {
  if (process.platform === 'win32') return 'powershell';
  if (process.env.SHELL) {
    const base = path.basename(process.env.SHELL).toLowerCase();
    if (base.includes('zsh')) return 'zsh';
    if (base.includes('bash')) return 'bash';
    if (base.includes('fish')) return 'fish';
    if (base.includes('sh')) return 'sh';
  }
  return 'bash';
}

export function resolvePowerShellExe(): string {
  if (process.platform !== 'win32') {
    // Check for pwsh on Linux / macOS
    const candidates = ['/usr/bin/pwsh', '/usr/local/bin/pwsh', '/snap/bin/pwsh'];
    for (const c of candidates) {
      if (isUsableExecutablePath(c)) return c;
    }
    return 'pwsh';
  }

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
    if (isUsableExecutablePath(exe)) return exe;
  }

  return 'powershell.exe';
}

export function resolveBashExe(): string {
  if (process.platform !== 'win32') {
    const envShell = process.env.SHELL;
    if (envShell && isUsableExecutablePath(envShell)) return envShell;
    for (const c of ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh', '/bin/sh']) {
      if (isUsableExecutablePath(c)) return c;
    }
    return process.env.SHELL || '/bin/bash';
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
    if (isUsableExecutablePath(exe)) return exe;
  }

  return 'bash.exe';
}

export function getAvailableShells(): TerminalShellInfo[] {
  const list: TerminalShellInfo[] = [];

  if (process.platform === 'win32') {
    // PowerShell 7
    const pwsh7 = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
    if (isUsableExecutablePath(pwsh7)) {
      list.push({ id: 'pwsh', name: 'PowerShell 7', path: pwsh7 });
    }

    // Windows PowerShell
    const winPs = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    if (isUsableExecutablePath(winPs)) {
      list.push({ id: 'powershell', name: 'Windows PowerShell', path: winPs, isDefault: true });
    }

    // Command Prompt
    const cmd = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
    if (isUsableExecutablePath(cmd)) {
      list.push({ id: 'cmd', name: 'Command Prompt', path: cmd });
    }

    // Git Bash
    const gitBash = resolveBashExe();
    if (gitBash && isUsableExecutablePath(gitBash)) {
      list.push({ id: 'bash', name: 'Git Bash', path: gitBash });
    }

    // WSL
    const wsl = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
    if (isUsableExecutablePath(wsl)) {
      list.push({ id: 'wsl', name: 'WSL', path: wsl });
    }
  } else {
    // Unix / Linux / macOS
    const envShell = process.env.SHELL;
    if (envShell && isUsableExecutablePath(envShell)) {
      const base = path.basename(envShell);
      list.push({ id: base, name: `${base.toUpperCase()} (Default)`, path: envShell, isDefault: true });
    }

    const standardShells = [
      { id: 'bash', name: 'Bash', paths: ['/bin/bash', '/usr/bin/bash'] },
      { id: 'zsh', name: 'Zsh', paths: ['/bin/zsh', '/usr/bin/zsh'] },
      { id: 'fish', name: 'Fish', paths: ['/usr/bin/fish', '/bin/fish'] },
      { id: 'sh', name: 'Sh', paths: ['/bin/sh', '/usr/bin/sh'] },
      { id: 'pwsh', name: 'PowerShell', paths: ['/usr/bin/pwsh', '/usr/local/bin/pwsh', '/snap/bin/pwsh'] },
    ];

    for (const item of standardShells) {
      if (list.some((s) => s.id === item.id)) continue;
      for (const p of item.paths) {
        if (isUsableExecutablePath(p)) {
          list.push({ id: item.id, name: item.name, path: p });
          break;
        }
      }
    }

    if (list.length === 0) {
      list.push({ id: 'sh', name: 'Sh', path: '/bin/sh', isDefault: true });
    }
  }

  return list;
}

export function resolveShellProfile(shell?: string): ShellProfile {
  const target = (shell || defaultTerminalShell()).toLowerCase();

  if (process.platform === 'win32') {
    switch (target) {
      case 'cmd':
        return {
          name: 'Command Prompt',
          kind: 'cmd',
          exe: process.env.ComSpec || 'cmd.exe',
          args: [],
        };
      case 'bash':
      case 'git bash':
      case 'gitbash':
        return {
          name: 'Git Bash',
          kind: 'bash',
          exe: resolveBashExe(),
          args: ['--login', '-i'],
        };
      case 'pwsh':
      case 'powershell 7':
      case 'powershell':
      default:
        return {
          name: target === 'pwsh' ? 'PowerShell 7' : 'PowerShell',
          kind: 'powershell',
          exe: resolvePowerShellExe(),
          args: ['-NoLogo'],
        };
    }
  }

  // Linux / macOS
  const available = getAvailableShells();
  const matched = available.find((s) => s.id === target || s.name.toLowerCase() === target);
  const exe = matched ? matched.path : (process.env.SHELL && isUsableExecutablePath(process.env.SHELL) ? process.env.SHELL : resolveBashExe());
  const kindName = path.basename(exe).toLowerCase();

  return {
    name: matched?.name || kindName.toUpperCase(),
    kind: kindName as TerminalShell,
    exe,
    args: ['-l'],
  };
}
