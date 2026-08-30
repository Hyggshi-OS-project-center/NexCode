/**
 * Source Control (Git Panel) — Modern Industrial-Standard (Bản Tiêu Chuẩn)
 * Supports Staged Changes, Unstaged/Untracked Changes, Individual/Batch Stage/Unstage/Discard,
 * Smart AI Commit Generation, Split Commit Button, Visual Commit Graph/History, and Diff View.
 */
import type { GitChangedFile, GitCommitItem, GitStatusResult } from '../../../shared/types';
import { renderFileIconHtml } from '../../utils/fileIcons';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export class GitPanel {
  private mountEl: HTMLElement;
  private workspacePath: string | null = null;
  private onRunGitInTerminal: (command: string) => void;
  private onOpenFile?: (filePath: string) => void;
  private onOpenDiff?: (filePath: string, staged: boolean) => void;

  private status: GitStatusResult | null = null;
  private commits: GitCommitItem[] = [];
  private isGeneratingCommit = false;
  private isStagedCollapsed = false;
  private isChangesCollapsed = false;
  private isGraphCollapsed = false;
  private commitMessage = '';

  constructor(
    mountId: string,
    onRunGitInTerminal: (command: string) => void,
    onOpenFile?: (filePath: string) => void,
    onOpenDiff?: (filePath: string, staged: boolean) => void,
  ) {
    this.mountEl = document.getElementById(mountId)!;
    this.onRunGitInTerminal = onRunGitInTerminal;
    this.onOpenFile = onOpenFile;
    this.onOpenDiff = onOpenDiff;
    this.renderEmpty();
  }

  setWorkspace(path: string | null): void {
    this.workspacePath = path;
    if (!path) {
      this.status = null;
      this.commits = [];
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

    try {
      const status = await window.electronAPI.gitStatus(this.workspacePath);
      this.status = status;

      if (status.isRepo) {
        try {
          this.commits = await window.electronAPI.gitLog(this.workspacePath, 25);
        } catch {
          this.commits = [];
        }
      } else {
        this.commits = [];
      }

      this.render();
      return status;
    } catch (err) {
      console.error('[GitPanel] Refresh error:', err);
      this.renderError(String(err));
      return null;
    }
  }

  private renderEmpty(): void {
    this.mountEl.innerHTML = `
      <div class="git-panel git-panel-empty">
        <div class="git-empty-icon">
          <svg viewBox="0 0 1024 1024" width="40" height="40" aria-hidden="true">
            <path d="M258.5 58C338.857 58 404 123.143 404 203.5C404 283.857 338.857 349 258.5 349C178.143 349 113 283.857 113 203.5C113 123.143 178.143 58 258.5 58ZM258.5 107C205.205 107 162 150.205 162 203.5C162 256.795 205.205 300 258.5 300C311.795 300 355 256.795 355 203.5C355 150.205 311.795 107 258.5 107Z" fill="currentColor"/>
            <path d="M268.5 733C348.857 733 414 798.143 414 878.5C414 958.857 348.857 1024 268.5 1024C188.143 1024 123 958.857 123 878.5C123 798.143 188.143 733 268.5 733ZM268.5 782C215.205 782 172 825.205 172 878.5C172 931.795 215.205 975 268.5 975C321.795 975 365 931.795 365 878.5C365 825.205 321.795 782 268.5 782Z" fill="currentColor"/>
            <path d="M719 232C783.617 232 836 284.383 836 349C836 413.617 783.617 466 719 466C654.383 466 602 413.617 602 349C602 284.383 654.383 232 719 232ZM718.5 277C679.012 277 647 309.012 647 348.5C647 387.988 679.012 420 718.5 420C757.988 420 790 387.988 790 348.5C790 309.012 757.988 277 718.5 277Z" fill="currentColor"/>
            <line x1="258" y1="318" x2="258" y2="758" stroke="currentColor" stroke-width="50"/>
            <path d="M259 677.5C353 509 711.5 660.5 711.5 446" stroke="currentColor" stroke-width="50"/>
          </svg>
        </div>
        <p class="git-empty-title">No Folder Open</p>
        <p class="git-empty-desc">Open a repository or workspace folder to manage source control and track changes.</p>
      </div>
    `;
  }

  private renderError(message: string): void {
    this.mountEl.innerHTML = `
      <div class="git-panel git-panel-empty">
        <p class="sidebar-section-empty" style="color:var(--accent-error, #f44336)">${escapeHtml(message)}</p>
        <button type="button" class="welcome-btn git-action-btn" data-action="refresh">Retry</button>
      </div>
    `;
    this.bindActions();
  }

  private render(): void {
    if (!this.status || !this.status.isRepo) {
      this.mountEl.innerHTML = `
        <div class="git-panel git-panel-not-repo">
          <div class="git-empty-icon">
            <svg viewBox="0 0 1024 1024" width="40" height="40" aria-hidden="true">
              <path d="M258.5 58C338.857 58 404 123.143 404 203.5C404 283.857 338.857 349 258.5 349C178.143 349 113 283.857 113 203.5C113 123.143 178.143 58 258.5 58ZM258.5 107C205.205 107 162 150.205 162 203.5C162 256.795 205.205 300 258.5 300C311.795 300 355 256.795 355 203.5C355 150.205 311.795 107 258.5 107Z" fill="currentColor"/>
              <path d="M268.5 733C348.857 733 414 798.143 414 878.5C414 958.857 348.857 1024 268.5 1024C188.143 1024 123 958.857 123 878.5C123 798.143 188.143 733 268.5 733ZM268.5 782C215.205 782 172 825.205 172 878.5C172 931.795 215.205 975 268.5 975C321.795 975 365 931.795 365 878.5C365 825.205 321.795 782 268.5 782Z" fill="currentColor"/>
              <path d="M719 232C783.617 232 836 284.383 836 349C836 413.617 783.617 466 719 466C654.383 466 602 413.617 602 349C602 284.383 654.383 232 719 232ZM718.5 277C679.012 277 647 309.012 647 348.5C647 387.988 679.012 420 718.5 420C757.988 420 790 387.988 790 348.5C790 309.012 757.988 277 718.5 277Z" fill="currentColor"/>
              <line x1="258" y1="318" x2="258" y2="758" stroke="currentColor" stroke-width="50"/>
              <path d="M259 677.5C353 509 711.5 660.5 711.5 446" stroke="currentColor" stroke-width="50"/>
            </svg>
          </div>
          <p class="git-empty-title">Not a Git Repository</p>
          <p class="git-empty-desc">${escapeHtml(this.status?.error || 'Initialize a git repository in this folder to enable version control.')}</p>
          <button type="button" class="welcome-btn git-action-btn primary" data-action="init">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>
            Initialize Repository
          </button>
        </div>
      `;
      this.bindActions();
      return;
    }

    const branch = this.status.branch ?? 'main';
    const staged = this.status.stagedFiles ?? [];
    const unstaged = this.status.unstagedFiles ?? [];
    const totalChanges = staged.length + unstaged.length;

    const ahead = this.status.ahead ?? 0;
    const behind = this.status.behind ?? 0;
    const syncBadge = ahead > 0 || behind > 0 ? ` ↑${ahead} ↓${behind}` : '';

    this.mountEl.innerHTML = `
      <div class="git-panel">
        <!-- Top Toolbar Header -->
        <div class="git-header-row">
          <div class="git-header-title">
            <span>SOURCE CONTROL</span>
            ${totalChanges > 0 ? `<span class="git-badge-count">${totalChanges}</span>` : ''}
          </div>
          <div class="git-header-actions">
            <button type="button" class="icon-btn" id="btn-git-refresh" title="Refresh (⟳)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4.85 6.15C4.755 6.05 4.627 6 4.5 6C4.372 6 4.245 6.05 4.15 6.15C4.05 6.245 4 6.373 4 6.5C4 6.627 4.05 6.755 4.15 6.85L7.15 9.85C7.245 9.95 7.372 10 7.5 10C7.628 10 7.755 9.95 7.85 9.85L10.85 6.85C10.95 6.755 11 6.628 11 6.5C11 6.372 10.95 6.245 10.85 6.15C10.755 6.05 10.627 6 10.5 6C10.373 6 10.245 6.05 10.15 6.15L8 8.29V1.5C8 1.22 7.78 1 7.5 1C7.22 1 7 1.22 7 1.5V8.29L4.85 6.15Z"/></svg>
            </button>
            <div class="git-more-dropdown-wrap">
              <button type="button" class="icon-btn" id="btn-git-more" title="More Actions...">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
              </button>
              <div id="git-more-menu" class="git-more-menu hidden">
                <button type="button" class="git-menu-item" data-action="stage-all">Stage All Changes</button>
                <button type="button" class="git-menu-item" data-action="unstage-all">Unstage All Changes</button>
                <button type="button" class="git-menu-item" data-action="discard-all">Discard All Changes</button>
                <hr class="git-menu-divider" />
                <button type="button" class="git-menu-item" data-action="pull">Pull (Origin)</button>
                <button type="button" class="git-menu-item" data-action="push">Push (Origin)</button>
                <button type="button" class="git-menu-item" data-action="fetch">Fetch All</button>
                <hr class="git-menu-divider" />
                <button type="button" class="git-menu-item" data-action="terminal-status">Open 'git status' in Terminal</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Branch / Status Info -->
        <div class="git-branch-info-bar" title="Current Branch: ${escapeHtml(branch)}${syncBadge}">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M11.75 2.5a2.25 2.25 0 10-3 2.122V6A2.5 2.5 0 016.25 8.5H5.5a1 1 0 00-1 1v1.128a2.25 2.25 0 101.5 0V9.5A2.5 2.5 0 018.5 7h.25a1 1 0 001-1v-.628A2.25 2.25 0 0011.75 2.5z"/></svg>
          <span class="git-branch-name">${escapeHtml(branch)}</span>
          ${syncBadge ? `<span class="git-sync-badge">${syncBadge}</span>` : ''}
        </div>

        <!-- Commit Box Section -->
        <div class="git-commit-box">
          <div class="git-commit-input-wrapper">
            <textarea
              id="git-commit-msg"
              class="git-commit-textarea"
              placeholder="Message (Ctrl+Enter to commit)"
              rows="2"
              spellcheck="false"
            >${escapeHtml(this.commitMessage)}</textarea>
            <button
              type="button"
              id="btn-git-ai-generate"
              class="git-ai-generate-btn ${this.isGeneratingCommit ? 'loading' : ''}"
              title="Generate commit message with AI"
              ${this.isGeneratingCommit ? 'disabled' : ''}
            >
              <span>Generate</span>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M7.5 1.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2 1.2-2.8zm5 7l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z"/></svg>
            </button>
          </div>
          <div class="git-commit-btn-group">
            <button type="button" class="git-commit-main-btn" id="btn-git-commit" title="Commit (Ctrl+Enter)">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
              <span>Commit</span>
            </button>
            <button type="button" class="git-commit-split-dropdown-btn" id="btn-git-commit-dropdown" title="More Commit Options">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/></svg>
            </button>
            <div id="git-commit-dropdown-menu" class="git-commit-dropdown-menu hidden">
              <button type="button" class="git-menu-item" data-commit-action="commit">Commit</button>
              <button type="button" class="git-menu-item" data-commit-action="commit-push">Commit & Push</button>
              <button type="button" class="git-menu-item" data-commit-action="commit-amend">Commit (Amend)</button>
            </div>
          </div>
        </div>

        <!-- Changes Scroll Container -->
        <div class="git-changes-scroll-container">
          <!-- Staged Changes Section -->
          ${
            staged.length > 0
              ? `
            <div class="git-section ${this.isStagedCollapsed ? 'collapsed' : ''}">
              <div class="git-section-header" data-toggle="staged">
                <span class="git-section-chevron">⌵</span>
                <span class="git-section-title">Staged Changes</span>
                <span class="git-section-badge">${staged.length}</span>
                <div class="git-section-actions">
                  <button type="button" class="git-section-action-btn" data-action="unstage-all" title="Unstage All (-)">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M3.75 7.25h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 010-1.5z"/></svg>
                  </button>
                </div>
              </div>
              <ul class="git-file-list">
                ${staged.map((f) => this.renderFileRow(f, true)).join('')}
              </ul>
            </div>
          `
              : ''
          }

          <!-- Changes (Unstaged) Section -->
          <div class="git-section ${this.isChangesCollapsed ? 'collapsed' : ''}">
            <div class="git-section-header" data-toggle="changes">
              <span class="git-section-chevron">⌵</span>
              <span class="git-section-title">Changes</span>
              <span class="git-section-badge">${unstaged.length}</span>
              <div class="git-section-actions">
                <button type="button" class="git-section-action-btn" data-action="stage-all" title="Stage All (+)">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>
                </button>
                <button type="button" class="git-section-action-btn" data-action="discard-all" title="Discard All Changes (⎌)">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1.5 8a6.5 6.5 0 1111.45 4.27.75.75 0 01-1.1-1.02A5 5 0 103 8h2.25a.75.75 0 01.53 1.28l-3 3a.75.75 0 01-1.06 0l-3-3A.75.75 0 01-.75 8H1.5z"/></svg>
                </button>
              </div>
            </div>
            ${
              unstaged.length === 0
                ? '<div class="git-section-empty-msg">No unstaged changes</div>'
                : `<ul class="git-file-list">${unstaged.map((f) => this.renderFileRow(f, false)).join('')}</ul>`
            }
          </div>

          <!-- Graph / Commits Section -->
          <div class="git-section ${this.isGraphCollapsed ? 'collapsed' : ''}">
            <div class="git-section-header" data-toggle="graph">
              <span class="git-section-chevron">⌵</span>
              <span class="git-section-title">Graph</span>
              ${this.commits.length > 0 ? `<span class="git-section-badge">${this.commits.length}</span>` : ''}
              <div class="git-section-actions">
                <button type="button" class="git-section-action-btn" data-action="refresh-graph" title="Refresh Graph">
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M4.85 6.15C4.755 6.05 4.627 6 4.5 6C4.372 6 4.245 6.05 4.15 6.15C4.05 6.245 4 6.373 4 6.5C4 6.627 4.05 6.755 4.15 6.85L7.15 9.85C7.245 9.95 7.372 10 7.5 10C7.628 10 7.755 9.95 7.85 9.85L10.85 6.85C10.95 6.755 11 6.628 11 6.5C11 6.372 10.95 6.245 10.85 6.15C10.755 6.05 10.627 6 10.5 6C10.373 6 10.245 6.05 10.15 6.15L8 8.29V1.5C8 1.22 7.78 1 7.5 1C7.22 1 7 1.22 7 1.5V8.29L4.85 6.15Z"/></svg>
                </button>
              </div>
            </div>
            ${
              this.commits.length === 0
                ? '<div class="git-section-empty-msg">No recent commit history</div>'
                : `<div class="git-graph-list">${this.commits.map((c) => this.renderCommitRow(c)).join('')}</div>`
            }
          </div>
        </div>
      </div>
    `;

    this.bindActions();
  }

  private renderFileRow(file: GitChangedFile, isStaged: boolean): string {
    const splitIndex = file.path.lastIndexOf('/');
    const basename = splitIndex >= 0 ? file.path.slice(splitIndex + 1) : file.path;
    const dirname = splitIndex >= 0 ? file.path.slice(0, splitIndex) : '';

    const statusLetter = this.getStatusLetter(file, isStaged);
    const statusTone = file.status ?? 'modified';
    const iconHtml = renderFileIconHtml(basename, false);

    return `
      <li class="git-file-item git-status-${statusTone}" data-filepath="${escapeHtml(file.path)}" data-staged="${isStaged}">
        <span class="git-file-icon">${iconHtml}</span>
        <div class="git-file-name-wrap">
          <span class="git-file-basename" title="${escapeHtml(file.path)}">${escapeHtml(basename)}</span>
          ${dirname ? `<span class="git-file-dirname" title="${escapeHtml(dirname)}">${escapeHtml(dirname)}</span>` : ''}
        </div>
        <span class="git-status-letter" title="${statusTone}">${statusLetter}</span>
        <div class="git-file-actions">
          ${
            isStaged
              ? `<button type="button" class="git-file-btn" data-file-action="unstage" title="Unstage Changes (-)"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M3.75 7.25h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 010-1.5z"/></svg></button>`
              : `<button type="button" class="git-file-btn" data-file-action="stage" title="Stage Changes (+)"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg></button>
                 <button type="button" class="git-file-btn" data-file-action="discard" title="Discard Changes (⎌)"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1.5 8a6.5 6.5 0 1111.45 4.27.75.75 0 01-1.1-1.02A5 5 0 103 8h2.25a.75.75 0 01.53 1.28l-3 3a.75.75 0 01-1.06 0l-3-3A.75.75 0 01-.75 8H1.5z"/></svg></button>`
          }
          <button type="button" class="git-file-btn" data-file-action="diff" title="Open Changes (Diff)"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8.75 1.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5zM2 13.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"/></svg></button>
          <button type="button" class="git-file-btn" data-file-action="open" title="Open File"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM9.75 4.81L2.871 11.69a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064L11.19 6.25 9.75 4.81z"/></svg></button>
        </div>
      </li>
    `;
  }

  private renderCommitRow(commit: GitCommitItem): string {
    const isHead = commit.isHead;
    const branchesHtml = commit.branches
      .map((b) => `<span class="git-commit-branch-tag ${b === 'main' || b === 'master' ? 'main' : ''}">${escapeHtml(b)}</span>`)
      .join('');

    return `
      <div class="git-commit-item ${isHead ? 'is-head' : ''}" title="${escapeHtml(commit.subject)} - ${escapeHtml(commit.author)} (${escapeHtml(commit.shortHash)})">
        <div class="git-commit-graph-node">
          <span class="git-node-dot ${isHead ? 'head-dot' : ''}"></span>
        </div>
        <div class="git-commit-content">
          <div class="git-commit-subject-row">
            ${branchesHtml}
            <span class="git-commit-subject">${escapeHtml(commit.subject)}</span>
          </div>
          <div class="git-commit-meta">
            <span class="git-commit-author">${escapeHtml(commit.author)}</span>
            <span class="git-commit-time">${escapeHtml(commit.relativeDate)}</span>
          </div>
        </div>
      </div>
    `;
  }

  private getStatusLetter(file: GitChangedFile, isStaged: boolean): string {
    const char = isStaged ? file.index : (file.worktree === ' ' ? file.index : file.worktree);
    if (char === '?') return 'U';
    if (char === 'M') return 'M';
    if (char === 'A') return 'A';
    if (char === 'D') return 'D';
    if (char === 'R') return 'R';
    if (char === 'U') return 'C';
    return char.trim() || 'M';
  }

  private bindActions(): void {
    // Textarea commit message synchronization
    const textarea = this.mountEl.querySelector<HTMLTextAreaElement>('#git-commit-msg');
    if (textarea) {
      bindReliableTextFocus(textarea);
      textarea.addEventListener('input', () => {
        this.commitMessage = textarea.value;
      });
      textarea.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void this.performCommit(false);
        }
      });
    }

    // Refresh button
    this.mountEl.querySelector('#btn-git-refresh')?.addEventListener('click', () => void this.refresh());

    // More actions button and menu
    const moreBtn = this.mountEl.querySelector('#btn-git-more');
    const moreMenu = this.mountEl.querySelector('#git-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('hidden');
      });
      window.addEventListener('click', () => moreMenu.classList.add('hidden'), { once: true });
    }

    // Commit button & dropdown
    this.mountEl.querySelector('#btn-git-commit')?.addEventListener('click', () => void this.performCommit(false));
    const commitDropdownBtn = this.mountEl.querySelector('#btn-git-commit-dropdown');
    const commitDropdownMenu = this.mountEl.querySelector('#git-commit-dropdown-menu');
    if (commitDropdownBtn && commitDropdownMenu) {
      commitDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        commitDropdownMenu.classList.toggle('hidden');
      });
      window.addEventListener('click', () => commitDropdownMenu.classList.add('hidden'), { once: true });
    }

    // Commit dropdown actions
    this.mountEl.querySelectorAll('[data-commit-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.commitAction;
        commitDropdownMenu?.classList.add('hidden');
        if (action === 'commit') void this.performCommit(false);
        else if (action === 'commit-push') void this.performCommit(true);
        else if (action === 'commit-amend') void this.performCommit(false, true);
      });
    });

    // AI Generate Commit button
    this.mountEl.querySelector('#btn-git-ai-generate')?.addEventListener('click', () => void this.generateAiCommitMessage());

    // Accordion headers toggle
    this.mountEl.querySelectorAll('[data-toggle]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Prevent toggle if clicking on sub-action buttons inside header
        if ((e.target as HTMLElement).closest('.git-section-action-btn')) return;
        const target = (el as HTMLElement).dataset.toggle;
        if (target === 'staged') this.isStagedCollapsed = !this.isStagedCollapsed;
        if (target === 'changes') this.isChangesCollapsed = !this.isChangesCollapsed;
        if (target === 'graph') this.isGraphCollapsed = !this.isGraphCollapsed;
        el.parentElement?.classList.toggle('collapsed');
      });
    });

    // Batch & Top Menu Actions
    this.mountEl.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).dataset.action;
        void this.handleGeneralAction(action ?? '');
      });
    });

    // File Row Actions
    this.mountEl.querySelectorAll<HTMLElement>('.git-file-item').forEach((row) => {
      const filePath = row.dataset.filepath ?? '';
      const isStaged = row.dataset.staged === 'true';

      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.git-file-btn')) return;
        this.openFileOrDiff(filePath, isStaged);
      });

      row.querySelectorAll<HTMLElement>('[data-file-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.fileAction;
          if (action === 'stage') void this.stageFile(filePath);
          else if (action === 'unstage') void this.unstageFile(filePath);
          else if (action === 'discard') void this.discardFile(filePath);
          else if (action === 'diff') this.openDiff(filePath, isStaged);
          else if (action === 'open') this.openFile(filePath);
        });
      });
    });
  }

  private async stageFile(filePath: string): Promise<void> {
    if (!this.workspacePath) return;
    await window.electronAPI.gitStage(this.workspacePath, [filePath]);
    await this.refresh();
  }

  private async unstageFile(filePath: string): Promise<void> {
    if (!this.workspacePath) return;
    await window.electronAPI.gitUnstage(this.workspacePath, [filePath]);
    await this.refresh();
  }

  private async discardFile(filePath: string): Promise<void> {
    if (!this.workspacePath) return;
    const confirmed = confirm(`Are you sure you want to discard all changes in '${filePath}'? This cannot be undone.`);
    if (!confirmed) return;
    await window.electronAPI.gitDiscard(this.workspacePath, [filePath]);
    await this.refresh();
  }

  private async handleGeneralAction(action: string): Promise<void> {
    if (!this.workspacePath) return;

    switch (action) {
      case 'stage-all':
        await window.electronAPI.gitStage(this.workspacePath);
        await this.refresh();
        break;
      case 'unstage-all':
        await window.electronAPI.gitUnstage(this.workspacePath);
        await this.refresh();
        break;
      case 'discard-all': {
        const confirmed = confirm('Are you sure you want to discard ALL unstaged changes in the workspace?');
        if (!confirmed) return;
        await window.electronAPI.gitDiscard(this.workspacePath, []);
        await this.refresh();
        break;
      }
      case 'pull':
        this.onRunGitInTerminal('git pull');
        break;
      case 'push':
        this.onRunGitInTerminal('git push');
        break;
      case 'fetch':
        this.onRunGitInTerminal('git fetch --all --prune');
        break;
      case 'terminal-status':
        this.onRunGitInTerminal('git status');
        break;
      case 'refresh-graph':
      case 'refresh':
        await this.refresh();
        break;
      case 'init':
        await window.electronAPI.gitExec(this.workspacePath, ['init']);
        await this.refresh();
        break;
      default:
        break;
    }
  }

  private async performCommit(andPush = false, amend = false): Promise<void> {
    if (!this.workspacePath) return;

    const textarea = this.mountEl.querySelector<HTMLTextAreaElement>('#git-commit-msg');
    const msg = (textarea?.value || this.commitMessage).trim();

    if (!msg) {
      textarea?.focus();
      textarea?.classList.add('shake-error');
      setTimeout(() => textarea?.classList.remove('shake-error'), 400);
      return;
    }

    // If no staged changes exist, stage all tracked changes first
    const stagedCount = this.status?.stagedFiles?.length ?? 0;
    if (stagedCount === 0) {
      await window.electronAPI.gitStage(this.workspacePath);
    }

    const res = await window.electronAPI.gitCommit(this.workspacePath, msg, { amend });
    if (res.code !== 0) {
      this.onRunGitInTerminal(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
    } else {
      this.commitMessage = '';
      if (textarea) textarea.value = '';
    }

    if (andPush && res.code === 0) {
      this.onRunGitInTerminal('git push');
    }

    await this.refresh();
  }

  private async generateAiCommitMessage(): Promise<void> {
    if (!this.workspacePath || this.isGeneratingCommit) return;
    this.isGeneratingCommit = true;
    this.render();

    try {
      // Get staged diff, or general diff if none staged
      let diff = await window.electronAPI.gitDiff(this.workspacePath, undefined, true);
      if (!diff || !diff.trim()) {
        diff = await window.electronAPI.gitDiff(this.workspacePath, undefined, false);
      }

      if (!diff || !diff.trim()) {
        this.commitMessage = 'chore: update files';
      } else {
        const prompt = `Analyze this git diff and write a concise conventional commit message (e.g. feat(auth): add login, fix(core): resolve null pointer, refactor: modernize terminal). Output ONLY the commit message with no extra explanations or markdown:\n\n${diff.slice(0, 4000)}`;
        const res = await window.electronAPI.aiChat([
          { role: 'user', text: prompt }
        ], this.workspacePath);

        let generated = (res.text ?? '').trim().replace(/^["'`]|["'`]$/g, '').split('\n')[0]?.trim();
        if (!generated || generated.length < 5) {
          generated = 'chore: update codebase changes';
        }
        this.commitMessage = generated;
      }
    } catch (e) {
      console.warn('[GitPanel] AI commit message error:', e);
      this.commitMessage = 'feat: implement latest changes';
    } finally {
      this.isGeneratingCommit = false;
      this.render();
      const textarea = this.mountEl.querySelector<HTMLTextAreaElement>('#git-commit-msg');
      textarea?.focus();
    }
  }

  private openFile(filePath: string): void {
    if (this.onOpenFile) {
      const fullPath = this.workspacePath && !filePath.startsWith('/')
        ? `${this.workspacePath}/${filePath}`
        : filePath;
      this.onOpenFile(fullPath);
    }
  }

  private openDiff(filePath: string, staged: boolean): void {
    if (this.onOpenDiff) {
      this.onOpenDiff(filePath, staged);
    } else {
      this.openFile(filePath);
    }
  }

  private openFileOrDiff(filePath: string, staged: boolean): void {
    if (this.onOpenDiff) {
      this.onOpenDiff(filePath, staged);
    } else {
      this.openFile(filePath);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
