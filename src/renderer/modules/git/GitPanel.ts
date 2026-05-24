/**
 * Source control sidebar — git status, stage, commit, refresh.
 */
import type { GitChangedFile, GitStatusResult } from '../../../shared/types';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export class GitPanel {
  private mountEl: HTMLElement;
  private workspacePath: string | null = null;
  private onRunGitInTerminal: (command: string) => void;

  constructor(mountId: string, onRunGitInTerminal: (command: string) => void) {
    this.mountEl = document.getElementById(mountId)!;
    this.onRunGitInTerminal = onRunGitInTerminal;
    this.renderEmpty();
  }

  setWorkspace(path: string | null): void {
    this.workspacePath = path;
    if (!path) {
      this.renderEmpty();
      return;
    }
    void this.refresh();
  }

  async refresh(): Promise<GitStatusResult | null> {
    if (!this.workspacePath) {
      this.renderEmpty();
      return null;
    }
    const status = await window.electronAPI.gitStatus(this.workspacePath);
    this.render(status);
    return status;
  }

  private renderEmpty(): void {
    this.mountEl.innerHTML = `
      <div class="git-panel">
        <p class="sidebar-section-empty">Open a folder to use Git.</p>
      </div>
    `;
  }

  private render(status: GitStatusResult): void {
    if (!status.isRepo) {
      this.mountEl.innerHTML = `
        <div class="git-panel">
          <p class="sidebar-section-empty">${escapeHtml(status.error ?? 'Not a git repository')}</p>
          <button type="button" class="welcome-btn git-action-btn" data-action="init">Initialize Repository</button>
        </div>
      `;
      this.bindActions();
      return;
    }

    const branch = status.branch ?? '(detached)';
    const filesHtml =
      status.files.length === 0
        ? '<p class="sidebar-section-empty">No changes</p>'
        : `<ul class="git-changes">${status.files.map((f) => this.fileRow(f)).join('')}</ul>`;

    this.mountEl.innerHTML = `
      <div class="git-panel">
        <div class="git-branch-row">
          <span class="git-branch-label">Branch</span>
          <span class="git-branch-name" title="${escapeHtml(branch)}">${escapeHtml(branch)}</span>
        </div>
        <div class="git-actions">
          <button type="button" class="welcome-btn git-action-btn" data-action="refresh">Refresh</button>
          <button type="button" class="welcome-btn git-action-btn" data-action="status">Status</button>
          <button type="button" class="welcome-btn git-action-btn" data-action="stage-all">Stage All</button>
        </div>
        <div class="git-commit-row">
          <input type="text" class="git-commit-input" placeholder="Commit message" spellcheck="false" />
          <button type="button" class="welcome-btn git-action-btn primary" data-action="commit">Commit</button>
        </div>
        <div class="git-section-title">Changes</div>
        ${filesHtml}
      </div>
    `;
    this.bindActions();
  }

  private fileRow(file: GitChangedFile): string {
    const code = `${file.index}${file.worktree}`.trim() || '?';
    const label = statusLabel(file);
    return `<li class="git-change-item" title="${escapeHtml(file.path)}">
      <span class="git-change-code">${escapeHtml(code)}</span>
      <span class="git-change-path">${escapeHtml(file.path)}</span>
      <span class="git-change-label">${escapeHtml(label)}</span>
    </li>`;
  }

  private bindActions(): void {
    this.mountEl.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.action;
        void this.handleAction(action ?? '');
      });
    });
    const commitInput = this.mountEl.querySelector('.git-commit-input');
    if (commitInput instanceof HTMLElement) {
      bindReliableTextFocus(commitInput);
    }
  }

  private async handleAction(action: string): Promise<void> {
    if (!this.workspacePath) return;

    switch (action) {
      case 'refresh':
        await this.refresh();
        break;
      case 'status':
        this.onRunGitInTerminal('git status');
        break;
      case 'stage-all':
        await window.electronAPI.gitExec(this.workspacePath, ['add', '-A']);
        await this.refresh();
        break;
      case 'commit': {
        const input = this.mountEl.querySelector('.git-commit-input') as HTMLInputElement | null;
        const message = input?.value.trim();
        if (!message) return;
        const res = await window.electronAPI.gitExec(this.workspacePath, ['commit', '-m', message]);
        if (res.code !== 0) {
          this.onRunGitInTerminal(`git commit -m "${message.replace(/"/g, '\\"')}"`);
        }
        if (input) input.value = '';
        await this.refresh();
        break;
      }
      case 'init':
        await window.electronAPI.gitExec(this.workspacePath, ['init']);
        await this.refresh();
        break;
      default:
        break;
    }
  }
}

function statusLabel(file: GitChangedFile): string {
  const { index, worktree } = file;
  if (index === '?' && worktree === '?') return 'Untracked';
  if (index === 'M' || worktree === 'M') return 'Modified';
  if (index === 'A' || worktree === 'A') return 'Added';
  if (index === 'D' || worktree === 'D') return 'Deleted';
  if (index === 'R') return 'Renamed';
  return 'Changed';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
