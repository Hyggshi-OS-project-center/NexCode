/**
 * PowerShell-style path navigation — prompts, Set-Location helpers, tab completion.
 */
import type { TerminalShell } from '../../../shared/types';
import { joinPath, parentDir } from '../../utils/pathUtils';

const NAV_COMMAND_RE =
  /^(?:cd|chdir|sl|set-location|pushd|popd|dir|ls|Get-ChildItem|gci|pwd|Get-Location|gl)\b/i;

/** Format the command-row prompt (mirrors in-shell PS C:\path>). */
export function formatPromptLabel(shell: TerminalShell, cwd: string | null): string {
  if (!cwd) {
    return shell === 'cmd' ? 'C:\\>' : shell === 'powershell' ? 'PS>' : '$';
  }
  switch (shell) {
    case 'powershell':
      return `PS ${cwd}>`;
    case 'cmd':
      return `${cwd}>`;
    default:
      return `${cwd}$`;
  }
}

export function quotePathForShell(shell: TerminalShell, dirPath: string): string {
  const needsQuotes = /[\s'"]/.test(dirPath);
  if (shell === 'powershell') {
    if (!needsQuotes) return dirPath;
    return `'${dirPath.replace(/'/g, "''")}'`;
  }
  if (!needsQuotes) return dirPath;
  return `"${dirPath.replace(/"/g, '""')}"`;
}

export function buildNavigateCommand(shell: TerminalShell, target: string): string {
  const quoted = quotePathForShell(shell, target);
  if (shell === 'powershell') return `Set-Location ${quoted}`;
  if (shell === 'cmd') return `cd /d ${quoted}`;
  return `cd ${quoted}`;
}

function normalizeSlashes(p: string): string {
  return p.replace(/\//g, '\\');
}

function resolvePathSegments(parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  if (stack.length === 0) return '';
  if (/^[A-Za-z]:$/.test(stack[0]!)) {
    const drive = stack[0]!;
    const rest = stack.slice(1);
    return rest.length ? `${drive}\\${rest.join('\\')}` : `${drive}\\`;
  }
  return stack.join('\\');
}

/** Resolve ~, relative segments, and drive paths against cwd/home. */
export function resolvePathInput(input: string, cwd: string | null, home: string): string {
  let p = normalizeSlashes(input.trim());
  if (!p) return cwd ?? home;

  if (p.startsWith('~')) {
    const rest = p.slice(1).replace(/^\\/, '');
    p = rest ? joinPath(home, rest) : home;
  } else if (/^[A-Za-z]:/.test(p) || p.startsWith('\\\\')) {
    // absolute — keep
  } else {
    p = joinPath(cwd ?? home, p);
  }

  return resolvePathSegments(p.split('\\'));
}

function looksLikeBarePath(line: string): boolean {
  const t = line.trim();
  if (!t || NAV_COMMAND_RE.test(t)) return false;
  if (/\s/.test(t) && !/^["']/.test(t)) return false;
  return (
    /^~(?:[/\\]|$)/.test(t) ||
    /^\.{1,2}(?:[/\\]|$)/.test(t) ||
    /^[A-Za-z]:[\\/]/.test(t) ||
    /^[A-Za-z]:$/.test(t) ||
    t.startsWith('\\\\') ||
    /^\.{1,2}$/.test(t)
  );
}

/** Turn command-row input into a shell command (path-only → Set-Location / cd). */
export function normalizeTerminalCommand(
  line: string,
  shell: TerminalShell,
  cwd: string | null,
  home: string,
): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;

  if (/^(?:cd|chdir|sl|set-location)\s*$/i.test(trimmed)) {
    if (shell === 'powershell') return 'Set-Location $HOME';
    if (shell === 'cmd') return 'cd /d %USERPROFILE%';
    return 'cd ~';
  }

  if (/^(?:cd|sl|set-location)\s+-\s*$/i.test(trimmed) && shell === 'powershell') {
    return 'Set-Location -';
  }

  if (looksLikeBarePath(trimmed)) {
    const unquoted = trimmed.replace(/^["']|["']$/g, '');
    const target = resolvePathInput(unquoted, cwd, home);
    return buildNavigateCommand(shell, target);
  }

  const navMatch = trimmed.match(/^(?:cd|chdir|sl|set-location)\s+(.+)$/i);
  if (navMatch) {
    let arg = navMatch[1]!.trim();
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      arg = arg.slice(1, -1);
    }
    if (arg === '-' && shell === 'powershell') return 'Set-Location -';
    const target = resolvePathInput(arg, cwd, home);
    return buildNavigateCommand(shell, target);
  }

  return trimmed;
}

/** Token being completed for Tab (path segment). */
export function getPathCompletionContext(
  input: string,
  cwd: string | null,
  home: string,
): { dir: string; prefix: string; replaceStart: number } | null {
  const nav = input.match(/^(?:cd|chdir|sl|set-location)\s+(.*)$/i);
  const pathPart = nav ? nav[1]! : input;
  const replaceStart = nav ? input.length - pathPart.length : 0;

  if (!nav && NAV_COMMAND_RE.test(input.trim())) return null;
  if (!nav && /\s/.test(input) && !looksLikeBarePath(input)) return null;

  const normalized = normalizeSlashes(pathPart);
  const endsWithSep = normalized.endsWith('\\');
  const lastSep = normalized.lastIndexOf('\\');

  let dir: string;
  let prefix: string;

  if (lastSep >= 0) {
    const dirPart = normalized.slice(0, lastSep);
    prefix = endsWithSep ? '' : normalized.slice(lastSep + 1);
    dir = dirPart ? resolvePathInput(dirPart, cwd, home) : cwd ?? home;
  } else {
    dir = cwd ?? home;
    prefix = endsWithSep ? '' : normalized;
  }

  return { dir, prefix, replaceStart };
}

/** List directory names matching prefix (directories append \\ for PS-style drill-down). */
export async function listPathCompletions(
  input: string,
  cwd: string | null,
  home: string,
): Promise<{ completions: string[]; dir: string; prefix: string; replaceStart: number } | null> {
  const ctx = getPathCompletionContext(input, cwd, home);
  if (!ctx) return null;

  const { dir, prefix, replaceStart } = ctx;
  let entries: { name: string; isDirectory: boolean }[];
  try {
    entries = await window.electronAPI.readDir(dir);
  } catch {
    return null;
  }

  const lower = prefix.toLowerCase();
  const completions = entries
    .filter((e) => e.name.toLowerCase().startsWith(lower))
    .map((e) => (e.isDirectory ? `${e.name}\\` : e.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return { completions, dir, prefix, replaceStart };
}

export function applyPathCompletion(
  input: string,
  dir: string,
  match: string,
  replaceStart: number,
  shell: TerminalShell,
): string {
  const name = match.replace(/\\$/, '');
  const full = joinPath(dir, name);
  const suffix = match.endsWith('\\') ? '\\' : '';
  const completed = full + suffix;
  const nav = input.match(/^(cd|chdir|sl|set-location)\s+/i);
  if (nav) {
    return `${nav[0]}${quotePathForShell(shell, full)}${suffix}`;
  }
  return completed;
}

export function parentPathHint(cwd: string | null): string | null {
  if (!cwd) return null;
  const parent = parentDir(cwd);
  return parent !== cwd ? parent : null;
}
