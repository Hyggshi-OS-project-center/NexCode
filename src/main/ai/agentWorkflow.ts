import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AiAgentAction } from '../../shared/types';

export interface CommandRunResult {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
}

export interface CodeValidationResult {
  command: string;
  ok: boolean;
  code: number;
  output: string;
}

/**
 * Safely parse a command line string into tokens [executable, ...args]
 * handling quotes without invoking a shell.
 */
export function splitCommandArgs(command: string): { executable: string; args: string[] } | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const matches = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches || matches.length === 0) return null;

  const cleanTokens = matches.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });

  const rawExe = cleanTokens[0];
  const args = cleanTokens.slice(1);
  const executable = resolveExecutable(rawExe);
  return { executable, args };
}

function resolveExecutable(exe: string): string {
  if (process.platform === 'win32') {
    const lower = exe.toLowerCase();
    if (
      ['npm', 'npx', 'yarn', 'pnpm', 'tsc', 'node'].includes(lower) &&
      !lower.endsWith('.cmd') &&
      !lower.endsWith('.exe')
    ) {
      return `${exe}.cmd`;
    }
  }
  return exe;
}

/**
 * SECURITY: Uses execFile (not exec) so no shell is spawned.
 * Passing args as separate elements prevents shell metacharacters from causing RCE.
 */
export async function runCommandCapture(
  commandOrExe: string,
  argsOrCwd?: string[] | string,
  optionalCwd?: string,
): Promise<CommandRunResult> {
  let executable: string;
  let args: string[];
  let cwd: string;

  if (Array.isArray(argsOrCwd)) {
    executable = resolveExecutable(commandOrExe);
    args = argsOrCwd;
    cwd = optionalCwd ?? process.cwd();
  } else {
    cwd = (typeof argsOrCwd === 'string' ? argsOrCwd : optionalCwd) ?? process.cwd();
    const parsed = splitCommandArgs(commandOrExe);
    if (!parsed) {
      return {
        code: 1,
        stdout: '',
        stderr: 'Empty or invalid command.',
        output: 'Empty or invalid command.',
      };
    }
    executable = parsed.executable;
    args = parsed.args;
  }

  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 1024 * 1024 * 8,
        shell: false, // SECURITY: Never spawn a shell to prevent command injection
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? Number((error as NodeJS.ErrnoException & { code?: number }).code)
            : error
              ? 1
              : 0;
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        resolve({ code, stdout, stderr, output });
      },
    );
  });
}

export async function validateWrittenFile(
  filePath: string,
  workspacePath: string | null,
  cwd: string,
  actions: AiAgentAction[],
): Promise<CodeValidationResult | null> {
  const argv = await chooseValidationArgv(filePath, workspacePath);
  if (!argv) return null;

  const [executable, ...args] = argv;
  const displayCmd = [executable, ...args].join(' ');
  const result = await runCommandCapture(executable, args, cwd);
  const output =
    result.output ||
    (result.code === 0 ? 'Validation completed without output.' : 'Validation failed without output.');
  actions.push({
    type: 'run_command',
    command: displayCmd,
    label: `${result.code === 0 ? 'Checked' : 'Check failed'} \`${displayCmd}\``,
  });

  return {
    command: displayCmd,
    ok: result.code === 0,
    code: result.code,
    output: output.slice(0, 12000),
  };
}

/**
 * Returns [executable, ...args] tuple for the given file, or null if no
 * validation command is applicable. Passed directly to execFile without shell.
 */
async function chooseValidationArgv(
  filePath: string,
  workspacePath: string | null,
): Promise<string[] | null> {
  const ext = path.extname(filePath).toLowerCase();
  const packageRoot = await findPackageRoot(filePath, workspacePath);
  const scripts = packageRoot ? await readPackageScripts(path.join(packageRoot, 'package.json')) : {};
  const rel = packageRoot ? path.relative(packageRoot, filePath).replace(/\\/g, '/') : '';

  if ((ext === '.ts' || ext === '.tsx') && scripts) {
    if (rel.startsWith('src/main/') && scripts['build:main']) return ['npm', 'run', 'build:main'];
    if (rel.startsWith('src/renderer/') && scripts['build:renderer']) return ['npm', 'run', 'build:renderer'];
    if (scripts.typecheck) return ['npm', 'run', 'typecheck'];
    if (scripts.lint) return ['npm', 'run', 'lint'];
    if (scripts.build) return ['npm', 'run', 'build'];
  }

  if ((ext === '.js' || ext === '.mjs' || ext === '.cjs') && !filePath.endsWith('.min.js')) {
    return ['node', '--check', filePath];
  }

  if (ext === '.json') {
    return [
      'node',
      '-e',
      "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))",
      filePath,
    ];
  }

  if (ext === '.py') {
    return ['python', '-m', 'py_compile', filePath];
  }

  if (scripts?.lint) return ['npm', 'run', 'lint'];
  return null;
}

async function findPackageRoot(filePath: string, workspacePath: string | null): Promise<string | null> {
  const workspace = workspacePath ? path.resolve(workspacePath) : null;
  let dir = path.dirname(path.resolve(filePath));

  while (true) {
    const candidate = path.join(dir, 'package.json');
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return dir;
    } catch {
      /* continue */
    }

    if (workspace && path.resolve(dir) === workspace) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    if (workspace && !path.resolve(parent).startsWith(workspace)) break;
    dir = parent;
  }

  return null;
}

async function readPackageScripts(packageJsonPath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}
