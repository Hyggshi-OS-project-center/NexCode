/**
 * Build shell commands to run the active file by extension.
 */
import type { TerminalShell } from '../../shared/types';
import { basename, parentDir, pathsEqual } from './pathUtils';

export interface RunSpec {
  command: string;
  label: string;
}

export interface RunSpecOptions {
  cwd?: string | null;
}

export function getRunSpec(
  filePath: string,
  shell: TerminalShell = 'cmd',
  options: RunSpecOptions = {},
): RunSpec | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const fileDir = parentDir(filePath);
  const useRelativePath = options.cwd ? pathsEqual(options.cwd, fileDir) : false;
  const commandPath = useRelativePath ? basename(filePath) : filePath;
  const commandDir = useRelativePath ? '.' : fileDir;
  const outputBasePath = useRelativePath ? stripExtension(basename(filePath)) : stripExtension(filePath);
  const q = quotePath(commandPath);
  const dir = quotePath(commandDir);
  const outBase = quotePath(outputBasePath);

  const browser = browserCommand(q, shell);

  const map: Record<string, RunSpec> = {
    html: { command: browser, label: 'Browser' },
    htm: { command: browser, label: 'Browser' },
    js: { command: `node ${q}`, label: 'Node.js' },
    mjs: { command: `node ${q}`, label: 'Node.js' },
    cjs: { command: `node ${q}`, label: 'Node.js' },
    jsx: { command: `node ${q}`, label: 'Node.js' },
    ts: { command: `npx --yes tsx ${q}`, label: 'tsx' },
    tsx: { command: `npx --yes tsx ${q}`, label: 'tsx' },
    py: { command: `python ${q}`, label: 'Python' },
    pyw: { command: `python ${q}`, label: 'Python' },
    lua: { command: `lua ${q}`, label: 'Lua' },
    rb: { command: `ruby ${q}`, label: 'Ruby' },
    php: { command: `php ${q}`, label: 'PHP' },
    ps1: { command: `powershell -File ${q}`, label: 'PowerShell' },
    bat: { command: `cmd /c ${q}`, label: 'Batch' },
    cmd: { command: `cmd /c ${q}`, label: 'Batch' },
    sh: { command: `bash ${q}`, label: 'Shell' },
    go: { command: `go run ${q}`, label: 'Go' },
    rs: { command: rustRunCommand(q, outBase, shell), label: 'Rust' },
    java: { command: javaCommand(filePath, q, dir, shell), label: 'Java' },
    c: { command: cCompileRun(q, outBase, shell), label: 'GCC' },
    cpp: { command: cppCompileRun(q, outBase, shell), label: 'G++' },
    cc: { command: cppCompileRun(q, outBase, shell), label: 'G++' },
    cxx: { command: cppCompileRun(q, outBase, shell), label: 'G++' },
  };

  return map[ext] ?? null;
}

function stripExtension(filePath: string): string {
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  const baseName = dot > 0 ? name.slice(0, dot) : name;
  const parent = parentDir(filePath);
  const sep = filePath.includes('\\') ? '\\' : '/';
  return `${parent}${sep}${baseName}`;
}

function browserCommand(quotedPath: string, shell: TerminalShell): string {
  if (shell === 'powershell') return `Start-Process ${quotedPath}`;
  if (shell === 'bash') return `xdg-open ${quotedPath} 2>/dev/null || open ${quotedPath}`;
  return `start "" ${quotedPath}`;
}

function javaCommand(filePath: string, q: string, dir: string, shell: TerminalShell): string {
  const className = basename(filePath).replace(/\.java$/i, '');
  if (shell === 'powershell') {
    return `javac ${q}; if ($?) { Set-Location ${dir}; java ${className} }`;
  }
  return `javac ${q} && cd /d ${dir} && java ${className}`;
}

function cCompileRun(q: string, outBase: string, shell: TerminalShell): string {
  const out = `${outBase}_nexrun.exe`;
  if (shell === 'powershell') return `gcc ${q} -o ${out}; if ($?) { & ${out} }`;
  return `gcc ${q} -o ${out} && ${out}`;
}

function cppCompileRun(q: string, outBase: string, shell: TerminalShell): string {
  const out = `${outBase}_nexrun.exe`;
  if (shell === 'powershell') return `g++ ${q} -o ${out}; if ($?) { & ${out} }`;
  return `g++ ${q} -o ${out} && ${out}`;
}

function rustRunCommand(q: string, outBase: string, shell: TerminalShell): string {
  const isWin = outBase.includes('\\');
  const out = isWin ? `${outBase}_nexrun.exe` : `${outBase}_nexrun`;
  if (shell === 'powershell') return `rustc ${q} -o ${out}; if ($?) { & ${out} }`;
  return `rustc ${q} -o ${out} && ${out}`;
}

function quotePath(filePath: string): string {
  return `"${filePath.replace(/"/g, '""')}"`;
}
