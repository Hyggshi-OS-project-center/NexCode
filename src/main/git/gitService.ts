/**
 * Run git CLI in the workspace directory.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitChangedFile {
  path: string;
  index: string;
  worktree: string;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string | null;
  files: GitChangedFile[];
  error?: string;
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string; code?: number };
    return {
      stdout: e.stdout ? String(e.stdout) : '',
      stderr: e.stderr ? String(e.stderr) : e.message ?? 'git failed',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

function parsePorcelain(output: string): GitChangedFile[] {
  const files: GitChangedFile[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line || line.length < 4) continue;
    const index = line[0] ?? ' ';
    const worktree = line[1] ?? ' ';
    const path = line.slice(3).trim();
    if (!path) continue;
    files.push({ path, index, worktree });
  }
  return files;
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || !inside.stdout.trim().startsWith('true')) {
    return {
      isRepo: false,
      branch: null,
      files: [],
      error: inside.stderr.trim() || 'Not a git repository',
    };
  }

  const branchRes = await runGit(cwd, ['branch', '--show-current']);
  const branch = branchRes.stdout.trim() || null;

  const statusRes = await runGit(cwd, ['status', '--porcelain']);
  if (statusRes.code !== 0) {
    return {
      isRepo: true,
      branch,
      files: [],
      error: statusRes.stderr.trim() || 'git status failed',
    };
  }

  return {
    isRepo: true,
    branch,
    files: parsePorcelain(statusRes.stdout),
  };
}

export async function gitExec(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return runGit(cwd, args);
}
