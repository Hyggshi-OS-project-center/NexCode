import { exec } from 'child_process';
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

export async function runCommandCapture(command: string, cwd: string): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 1024 * 1024 * 8,
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
  const command = await chooseValidationCommand(filePath, workspacePath);
  if (!command) return null;

  const result = await runCommandCapture(command, cwd);
  const output = result.output || (result.code === 0 ? 'Validation completed without output.' : 'Validation failed without output.');
  actions.push({
    type: 'run_command',
    command,
    label: `${result.code === 0 ? 'Checked' : 'Check failed'} \`${command}\``,
  });

  return {
    command,
    ok: result.code === 0,
    code: result.code,
    output: output.slice(0, 12000),
  };
}

async function chooseValidationCommand(filePath: string, workspacePath: string | null): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  const packageRoot = await findPackageRoot(filePath, workspacePath);
  const scripts = packageRoot ? await readPackageScripts(path.join(packageRoot, 'package.json')) : {};
  const rel = packageRoot ? path.relative(packageRoot, filePath).replace(/\\/g, '/') : '';
  const commandFilePath = commandPathForFile(filePath, workspacePath);

  if ((ext === '.ts' || ext === '.tsx') && scripts) {
    if (rel.startsWith('src/main/') && scripts['build:main']) return 'npm run build:main';
    if (rel.startsWith('src/renderer/') && scripts['build:renderer']) return 'npm run build:renderer';
    if (scripts.typecheck) return 'npm run typecheck';
    if (scripts.lint) return 'npm run lint';
    if (scripts.build) return 'npm run build';
  }

  if ((ext === '.js' || ext === '.mjs' || ext === '.cjs') && !filePath.endsWith('.min.js')) {
    return `node --check ${quotePath(commandFilePath)}`;
  }

  if (ext === '.json') {
    return `node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" ${quotePath(commandFilePath)}`;
  }

  if (ext === '.py') {
    return `python -m py_compile ${quotePath(commandFilePath)}`;
  }

  if (scripts?.lint) return 'npm run lint';
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

function quotePath(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function commandPathForFile(filePath: string, workspacePath: string | null): string {
  if (!workspacePath) return filePath;

  const rel = path.relative(workspacePath, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return filePath;
  return rel;
}
