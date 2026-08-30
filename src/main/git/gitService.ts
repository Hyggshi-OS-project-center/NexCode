/**
 * Git service — runs Git CLI operations in the workspace directory.
 * Provides rich status parsing (staged vs unstaged), staging/unstaging,
 * discard, commit, commit log history, diffs, and remote sync.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitChangedFile, GitCommitItem, GitExecResult, GitStatusResult } from '../../shared/types';

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<GitExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
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

function resolveFileStatusKind(index: string, worktree: string): 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict' {
  if (index === '?' || worktree === '?') return 'untracked';
  if (index === 'U' || worktree === 'U' || (index === 'A' && worktree === 'A') || (index === 'D' && worktree === 'D')) return 'conflict';
  if (index === 'D' || worktree === 'D') return 'deleted';
  if (index === 'A') return 'added';
  if (index === 'R' || worktree === 'R') return 'renamed';
  return 'modified';
}

function parsePorcelainStatus(output: string): { staged: GitChangedFile[]; unstaged: GitChangedFile[]; all: GitChangedFile[] } {
  const staged: GitChangedFile[] = [];
  const unstaged: GitChangedFile[] = [];
  const all: GitChangedFile[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line || line.length < 3) continue;
    const index = line[0] ?? ' ';
    const worktree = line[1] ?? ' ';
    let filePath = line.slice(3).trim();

    // Handle renamed files (e.g. "R  old.ts -> new.ts")
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop()!.trim();
    }
    if (!filePath) continue;

    const kind = resolveFileStatusKind(index, worktree);
    const item: GitChangedFile = { path: filePath, index, worktree, status: kind };
    all.push(item);

    // Staged: index is not empty and not untracked
    if (index !== ' ' && index !== '?') {
      staged.push({ ...item, status: resolveFileStatusKind(index, ' ') });
    }

    // Unstaged: worktree has changes or is untracked
    if (worktree !== ' ' || index === '?') {
      unstaged.push({ ...item, status: resolveFileStatusKind(' ', worktree === ' ' ? index : worktree) });
    }
  }

  return { staged, unstaged, all };
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || !inside.stdout.trim().startsWith('true')) {
    return {
      isRepo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      stagedFiles: [],
      unstagedFiles: [],
      files: [],
      error: inside.stderr.trim() || 'Not a git repository',
    };
  }

  const branchRes = await runGit(cwd, ['branch', '--show-current']);
  let branch = branchRes.stdout.trim() || null;
  if (!branch) {
    // Detached HEAD or initial commit
    const headRes = await runGit(cwd, ['rev-parse', '--short', 'HEAD']);
    branch = headRes.code === 0 ? `(detached: ${headRes.stdout.trim()})` : 'main';
  }

  // Check ahead / behind status with upstream
  let ahead = 0;
  let behind = 0;
  const countRes = await runGit(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  if (countRes.code === 0 && countRes.stdout.trim()) {
    const parts = countRes.stdout.trim().split(/\s+/);
    behind = parseInt(parts[0] ?? '0', 10) || 0;
    ahead = parseInt(parts[1] ?? '0', 10) || 0;
  }

  const statusRes = await runGit(cwd, ['status', '--porcelain=v1', '-uall']);
  if (statusRes.code !== 0) {
    return {
      isRepo: true,
      branch,
      ahead,
      behind,
      stagedFiles: [],
      unstagedFiles: [],
      files: [],
      error: statusRes.stderr.trim() || 'git status failed',
    };
  }

  const { staged, unstaged, all } = parsePorcelainStatus(statusRes.stdout);

  return {
    isRepo: true,
    branch,
    ahead,
    behind,
    stagedFiles: staged,
    unstagedFiles: unstaged,
    files: all,
  };
}

export async function gitStage(cwd: string, filePaths?: string[]): Promise<GitExecResult> {
  if (!filePaths || filePaths.length === 0) {
    return runGit(cwd, ['add', '-A']);
  }
  return runGit(cwd, ['add', '--', ...filePaths]);
}

export async function gitUnstage(cwd: string, filePaths?: string[]): Promise<GitExecResult> {
  if (!filePaths || filePaths.length === 0) {
    return runGit(cwd, ['restore', '--staged', '.']);
  }
  return runGit(cwd, ['restore', '--staged', '--', ...filePaths]);
}

export async function gitDiscard(cwd: string, filePaths: string[]): Promise<GitExecResult> {
  if (!filePaths || filePaths.length === 0) {
    const res1 = await runGit(cwd, ['restore', '.']);
    const res2 = await runGit(cwd, ['clean', '-fd']);
    return res2.code !== 0 ? res2 : res1;
  }

  // Restore tracked files
  const res1 = await runGit(cwd, ['restore', '--', ...filePaths]);
  // Clean untracked files
  const res2 = await runGit(cwd, ['clean', '-f', '--', ...filePaths]);
  return res1.code !== 0 ? res1 : res2;
}

export async function gitCommit(
  cwd: string,
  message: string,
  options?: { amend?: boolean; stageAll?: boolean },
): Promise<GitExecResult> {
  const args = ['commit', '-m', message];
  if (options?.amend) args.push('--amend');
  if (options?.stageAll) args.unshift('-a');
  return runGit(cwd, args);
}

export async function gitLog(cwd: string, maxCount = 30): Promise<GitCommitItem[]> {
  // Format: hash%x1fshortHash%x1fauthor%x1frelativeDate%x1frefNames%x1fsubject%x1e
  const format = '%H%x1f%h%x1f%an%x1f%cr%x1f%D%x1f%s%x1e';
  const res = await runGit(cwd, ['log', `-${maxCount}`, `--format=${format}`, '--all']);
  if (res.code !== 0 || !res.stdout.trim()) return [];

  const entries = res.stdout.split('\x1e');
  const items: GitCommitItem[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\x1f');
    if (parts.length < 6) continue;

    const hash = parts[0]!;
    const shortHash = parts[1]!;
    const author = parts[2]!;
    const relativeDate = parts[3]!;
    const refNames = parts[4]!;
    const subject = parts[5]!;

    const branches: string[] = [];
    let isHead = false;

    if (refNames) {
      refNames.split(',').forEach((ref) => {
        const r = ref.trim();
        if (r.startsWith('HEAD ->')) {
          isHead = true;
          branches.push(r.replace('HEAD ->', '').trim());
        } else if (r === 'HEAD') {
          isHead = true;
        } else if (r) {
          branches.push(r);
        }
      });
    }

    items.push({
      hash,
      shortHash,
      subject,
      author,
      relativeDate,
      branches,
      isHead,
    });
  }

  return items;
}

export async function gitDiff(cwd: string, filePath?: string, staged = false): Promise<string> {
  const args = ['diff'];
  if (staged) args.push('--staged');
  if (filePath) args.push('--', filePath);
  const res = await runGit(cwd, args);
  return res.stdout;
}

export async function gitFileAtHead(cwd: string, filePath: string): Promise<string | null> {
  const res = await runGit(cwd, ['show', `HEAD:${filePath}`]);
  if (res.code !== 0) return null;
  return res.stdout;
}

export async function gitExec(cwd: string, args: string[]): Promise<GitExecResult> {
  return runGit(cwd, args);
}

export async function gitPull(cwd: string): Promise<GitExecResult> {
  return runGit(cwd, ['pull']);
}

export async function gitPush(cwd: string): Promise<GitExecResult> {
  return runGit(cwd, ['push']);
}

export async function gitFetch(cwd: string): Promise<GitExecResult> {
  return runGit(cwd, ['fetch', '--all', '--prune']);
}
