/**
 * Sidebar Explorer — lazy tree, filter, create/rename/delete, toolbar, context menus.
 */
import type { FileEntry, GitChangedFile, GitStatusResult } from '../../../shared/types';
import { renderFileIconHtml } from '../../utils/fileIcons';
import { escapeHtml } from '../../utils/textAnalysis';
import { basename, joinPath, parentDir } from '../../utils/pathUtils';
import { CreateItemDialog } from './CreateItemDialog';
import { OutlineView } from './OutlineView';
import { TimelineView } from './TimelineView';
import { ConvenienceStoreView } from './ConvenienceStoreView';
import type { InstalledVsixExtension } from '../plugin/VsixExtensionStore';
import type * as monaco from 'monaco-editor';
import type { ContextMenu } from '../contextmenu/ContextMenu';
import type { MenuItem } from '../contextmenu/ContextMenu';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export type FileOpenHandler = (path: string) => void;
export type FileRenameHandler = (oldPath: string, newPath: string, isDirectory: boolean) => void;

type GitDecoration = {
  label: string;
  className: string;
  title: string;
};

export class Explorer {
  private mountEl: HTMLElement;
  private treeEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private workspaceLabel!: HTMLElement;
  private filterInput!: HTMLInputElement;
  private rootPath: string | null = null;
  private onOpenFile: FileOpenHandler;
  private contextMenu: ContextMenu;
  private onOpenFolder: () => void;
  private onRename: FileRenameHandler;

  private expanded = new Set<string>();
  private childrenCache = new Map<string, FileEntry[]>();
  private showHidden = false;
  private filterQuery = '';
  private selectedPath: string | null = null;
  private outlineView!: OutlineView;
  private timelineView!: TimelineView;
  private storeView!: ConvenienceStoreView;
  private onGoToLine: (line: number) => void;
  private gitDecorations = new Map<string, GitDecoration>();
  private gitFolderDecorations = new Map<string, GitDecoration>();

  constructor(
    mountId: string,
    onOpenFile: FileOpenHandler,
    contextMenu: ContextMenu,
    onOpenFolder: () => void,
    onGoToLine: (line: number) => void,
    onRename: FileRenameHandler,
  ) {
    this.mountEl = document.getElementById(mountId)!;
    this.onOpenFile = onOpenFile;
    this.contextMenu = contextMenu;
    this.onOpenFolder = onOpenFolder;
    this.onGoToLine = onGoToLine;
    this.onRename = onRename;
    this.buildUi();
  }

  getTimeline(): TimelineView {
    return this.timelineView;
  }

  async updateOutline(model: monaco.editor.ITextModel | null): Promise<void> {
    await this.outlineView.updateFromModel(model);
  }

  updateConvenienceStore(extensions: InstalledVsixExtension[]): void {
    this.storeView.render(extensions);
  }

  getRootPath(): string | null {
    return this.rootPath;
  }

  /** Show explorer panel (called when switching sidebar tab). */
  show(): void {
    this.mountEl.classList.remove('hidden');
    if (this.rootPath) void this.render();
    else this.showEmpty(true);
  }

  hide(): void {
    this.mountEl.classList.add('hidden');
  }

  async loadFolder(folderPath: string): Promise<void> {
    this.rootPath = folderPath;
    this.expanded.clear();
    this.childrenCache.clear();
    this.gitDecorations.clear();
    this.gitFolderDecorations.clear();
    this.expanded.add(folderPath);
    this.workspaceLabel.textContent = basename(folderPath);
    this.showEmpty(false);
    await this.loadChildren(folderPath);
    await this.loadGitStatus();
    await this.render();
  }

  async refresh(): Promise<void> {
    if (!this.rootPath) {
      this.showEmpty(true);
      return;
    }
    this.childrenCache.clear();
    await this.loadChildren(this.rootPath);
    await this.loadGitStatus();
    await this.render();
  }

  async refreshGitDecorations(): Promise<void> {
    await this.loadGitStatus();
    await this.render();
  }

  private buildUi(): void {
    this.mountEl.className = 'explorer-panel';
    this.mountEl.innerHTML = `
      <div class="explorer-scroll">
        <details class="explorer-section" open data-section="files">
          <summary class="explorer-section-title">FILES</summary>
          <div class="explorer-section-body">
            <div class="explorer-toolbar">
        <button type="button" class="explorer-tool-btn" data-action="refresh" title="Refresh">↻</button>
        <button type="button" class="explorer-tool-btn" data-action="collapse" title="Collapse all">⊟</button>
        <button type="button" class="explorer-tool-btn" data-action="new" title="New file or folder">+</button>
        <button type="button" class="explorer-tool-btn" data-action="hidden" title="Toggle hidden files">◉</button>
      </div>
      <input type="text" class="explorer-filter" placeholder="Filter files..." spellcheck="false" />
      <div class="explorer-workspace-label"></div>
      <div class="explorer-empty hidden">
        <p>No folder opened</p>
        <button type="button" class="welcome-btn primary" data-action="open-folder">Open Folder</button>
      </div>
            <div class="explorer-tree"></div>
          </div>
        </details>
        <details class="explorer-section" open data-section="outline">
          <summary class="explorer-section-title">OUTLINE</summary>
          <div class="explorer-section-body outline-list" id="explorer-outline"></div>
        </details>
        <details class="explorer-section" open data-section="timeline">
          <summary class="explorer-section-title">TIMELINE</summary>
          <div class="explorer-section-body timeline-list" id="explorer-timeline"></div>
        </details>
        <details class="explorer-section" open data-section="store">
          <summary class="explorer-section-title">CONVENIENCE STORE</summary>
          <div class="explorer-section-body store-list" id="explorer-store"></div>
        </details>
      </div>
    `;

    this.treeEl = this.mountEl.querySelector('.explorer-tree')!;
    this.emptyEl = this.mountEl.querySelector('.explorer-empty')!;
    this.workspaceLabel = this.mountEl.querySelector('.explorer-workspace-label')!;
    this.filterInput = this.mountEl.querySelector('.explorer-filter')!;
    this.outlineView = new OutlineView(
      this.mountEl.querySelector('#explorer-outline')!,
      (line) => this.onGoToLine(line),
    );
    this.timelineView = new TimelineView(
      this.mountEl.querySelector('#explorer-timeline')!,
      (path) => this.onOpenFile(path),
    );
    this.storeView = new ConvenienceStoreView(this.mountEl.querySelector('#explorer-store')!);

    this.mountEl.querySelector('[data-action="open-folder"]')?.addEventListener('click', () => this.onOpenFolder());
    this.mountEl.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void this.refresh());
    this.mountEl.querySelector('[data-action="collapse"]')?.addEventListener('click', () => this.collapseAll());
    this.mountEl.querySelector('[data-action="new"]')?.addEventListener('click', () => void this.showCreateDialog());
    this.mountEl.querySelector('[data-action="hidden"]')?.addEventListener('click', () => void this.toggleHidden());

    this.filterInput.addEventListener('input', () => {
      this.filterQuery = this.filterInput.value.trim().toLowerCase();
      void this.render();
    });
    bindReliableTextFocus(this.filterInput);

    this.treeEl.addEventListener('contextmenu', (e) => this.onTreeContextMenu(e));
    this.showEmpty(true);
  }

  private showEmpty(show: boolean): void {
    this.emptyEl.classList.toggle('hidden', !show);
    this.treeEl.classList.toggle('hidden', show);
    this.workspaceLabel.classList.toggle('hidden', show);
    this.filterInput.classList.toggle('hidden', show);
  }

  private async loadChildren(dirPath: string): Promise<FileEntry[]> {
    const entries = await window.electronAPI.readDir(dirPath, { showHidden: this.showHidden });
    this.childrenCache.set(dirPath, entries);
    return entries;
  }

  private normalizePathKey(filePath: string): string {
    return filePath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  }

  private gitPathToAbsolute(filePath: string): string {
    const renamedPath = filePath.includes(' -> ') ? filePath.split(' -> ').pop() ?? filePath : filePath;
    return renamedPath.split('/').reduce((acc, part) => joinPath(acc, part), this.rootPath ?? '');
  }

  private decorationForGitFile(file: GitChangedFile): GitDecoration {
    const index = file.index.trim();
    const worktree = file.worktree.trim();
    const code = `${file.index}${file.worktree}`;
    if (code === '??') return { label: 'U', className: 'untracked', title: 'Untracked' };
    if (index === 'A') return { label: 'A', className: 'added', title: 'Added' };
    if (index === 'D' || worktree === 'D') return { label: 'D', className: 'deleted', title: 'Deleted' };
    if (index === 'R') return { label: 'R', className: 'renamed', title: 'Renamed' };
    if (index === 'C') return { label: 'C', className: 'copied', title: 'Copied' };
    if (index === 'U' || worktree === 'U') return { label: '!', className: 'conflict', title: 'Conflict' };
    return { label: 'M', className: 'modified', title: 'Modified' };
  }

  private mergeFolderDecoration(current: GitDecoration | undefined, next: GitDecoration): GitDecoration {
    const rank: Record<string, number> = {
      conflict: 5,
      deleted: 4,
      modified: 3,
      added: 2,
      renamed: 2,
      copied: 2,
      untracked: 1,
    };
    if (!current) return next;
    return (rank[next.className] ?? 0) > (rank[current.className] ?? 0) ? next : current;
  }

  private async loadGitStatus(): Promise<void> {
    this.gitDecorations.clear();
    this.gitFolderDecorations.clear();
    if (!this.rootPath) return;

    let status: GitStatusResult;
    try {
      status = await window.electronAPI.gitStatus(this.rootPath);
    } catch {
      return;
    }
    if (!status.isRepo || status.files.length === 0) return;

    const rootKey = this.normalizePathKey(this.rootPath);
    for (const file of status.files) {
      const absolutePath = this.gitPathToAbsolute(file.path);
      const decoration = this.decorationForGitFile(file);
      this.gitDecorations.set(this.normalizePathKey(absolutePath), decoration);

      let dir = parentDir(absolutePath);
      while (dir && this.normalizePathKey(dir).startsWith(rootKey)) {
        const key = this.normalizePathKey(dir);
        this.gitFolderDecorations.set(key, this.mergeFolderDecoration(this.gitFolderDecorations.get(key), decoration));
        if (key === rootKey) break;
        dir = parentDir(dir);
      }
    }
  }

  private async ensureChildren(dirPath: string): Promise<FileEntry[]> {
    if (this.childrenCache.has(dirPath)) {
      return this.childrenCache.get(dirPath)!;
    }
    return this.loadChildren(dirPath);
  }

  private collapseAll(): void {
    if (!this.rootPath) return;
    this.expanded.clear();
    this.expanded.add(this.rootPath);
    void this.render();
  }

  private async toggleHidden(): Promise<void> {
    this.showHidden = !this.showHidden;
    this.mountEl.querySelector('[data-action="hidden"]')?.classList.toggle('active', this.showHidden);
    this.childrenCache.clear();
    if (this.rootPath) await this.loadChildren(this.rootPath);
    await this.render();
  }

  private getCreateBaseDir(): string {
    if (this.selectedPath) {
      const row = this.treeEl.querySelector(`.tree-item[data-path="${CSS.escape(this.selectedPath)}"]`);
      if (row?.getAttribute('data-isdir') === 'true') return this.selectedPath;
      return parentDir(this.selectedPath);
    }
    return this.rootPath ?? '';
  }

  private async showCreateDialog(defaultType?: 'file' | 'folder'): Promise<void> {
    const base = this.getCreateBaseDir();
    if (!base) return;

    const result = await CreateItemDialog.show({ parentPath: base, defaultType });
    if (!result) return;

    const target = joinPath(base, result.name);
    if (await window.electronAPI.exists(target)) {
      window.alert(`"${result.name}" already exists in this folder.`);
      return;
    }

    if (result.type === 'folder') await window.electronAPI.mkdir(target);
    else { console.trace('[WRITE FILE - Explorer]', target); await window.electronAPI.writeFile(target, ''); }

    this.expanded.add(base);
    this.childrenCache.delete(base);
    await this.ensureChildren(base);
    await this.render();

    if (result.type === 'file') this.onOpenFile(target);
  }

  private async renameEntry(entry: FileEntry): Promise<void> {
    // Use inline rename input instead of window.prompt (blocked in Electron context-isolation)
    const newName = await this.showInlineRenameDialog(entry.name);
    if (!newName || newName === entry.name) return;
    const dest = joinPath(parentDir(entry.path), newName.trim());
    if (await window.electronAPI.exists(dest)) {
      window.alert(`"${newName.trim()}" already exists in this folder.`);
      return;
    }
    try {
      await window.electronAPI.rename(entry.path, dest);
    } catch {
      window.alert(`Could not rename "${entry.name}". The item may be in use or you may not have permission.`);
      return;
    }
    if (this.selectedPath === entry.path) this.selectedPath = dest;
    if (entry.isDirectory) {
      if (this.expanded.delete(entry.path)) this.expanded.add(dest);
      this.childrenCache.delete(entry.path);
    }
    this.childrenCache.delete(parentDir(entry.path));
    this.onRename(entry.path, dest, entry.isDirectory);
    await this.refresh();
  }

  /**
   * Show an inline rename dialog using a custom modal (replaces window.prompt).
   * Resolves with the new name or null if cancelled.
   */
  private showInlineRenameDialog(currentName: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const existing = document.getElementById('explorer-rename-dialog');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'explorer-rename-dialog';
      overlay.className = 'unsaved-changes-overlay';
      overlay.innerHTML = `
        <div class="unsaved-changes-dialog">
          <div class="unsaved-changes-header">
            <span>Rename</span>
          </div>
          <div class="unsaved-changes-body">
            <p>Enter new name:</p>
            <input type="text" id="explorer-rename-input" class="tab-rename-input" value="${currentName}" spellcheck="false" style="width:100%;margin-top:8px;padding:4px 6px;font-size:13px;" />
          </div>
          <div class="unsaved-changes-actions">
            <button class="btn btn-save" data-action="confirm">OK</button>
            <button class="btn btn-cancel" data-action="cancel">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = () => overlay.remove();

      const input = overlay.querySelector('#explorer-rename-input') as HTMLInputElement;
      // Select filename only (not extension)
      const dotIndex = currentName.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }

      overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
        const val = input.value.trim();
        cleanup();
        resolve(val || null);
      });

      overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = input.value.trim();
          cleanup();
          resolve(val || null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
          resolve(null);
        }
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      document.body.appendChild(overlay);
      // Focus after append so the input is interactive
      requestAnimationFrame(() => input.focus());
    });
  }

  private async deleteEntry(entry: FileEntry): Promise<void> {
    const kind = entry.isDirectory ? 'folder' : 'file';
    if (!window.confirm(`Delete ${kind} "${entry.name}"?`)) return;
    try {
      await window.electronAPI.unlink(entry.path);
    } catch {
      window.alert(`Could not delete "${entry.name}". The ${kind} may be in use or you may not have permission.`);
      return;
    }
    if (entry.isDirectory) {
      this.expanded.delete(entry.path);
      this.childrenCache.delete(entry.path);
    }
    this.childrenCache.delete(parentDir(entry.path));
    await this.refresh();
  }

  private matchesFilter(entry: FileEntry): boolean {
    if (!this.filterQuery) return true;
    if (entry.name.toLowerCase().includes(this.filterQuery)) return true;
    if (!entry.isDirectory) return false;
    const children = this.childrenCache.get(entry.path);
    return children?.some((c) => this.matchesFilter(c)) ?? false;
  }

  private async render(): Promise<void> {
    if (!this.rootPath) return;
    this.treeEl.innerHTML = '';
    const entries = await this.ensureChildren(this.rootPath);
    const filtered = entries.filter((e) => this.matchesFilter(e));
    this.renderLevel(filtered, this.treeEl, 0);
  }

  private renderLevel(entries: FileEntry[], parent: HTMLElement, depth: number): void {
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'tree-item';
      row.dataset.path = entry.path;
      row.dataset.isdir = String(entry.isDirectory);
      row.setAttribute('data-isdir', String(entry.isDirectory));
      row.style.paddingLeft = `${8 + depth * 14}px`;

      const isExpanded = this.expanded.has(entry.path);
      const label = escapeHtml(entry.name);
      const iconHtml = renderFileIconHtml(entry.name, entry.isDirectory, isExpanded);
      const hasChevron = entry.isDirectory;
      const gitDecoration = entry.isDirectory
        ? this.gitFolderDecorations.get(this.normalizePathKey(entry.path))
        : this.gitDecorations.get(this.normalizePathKey(entry.path));
      const gitDecorationHtml = gitDecoration
        ? entry.isDirectory
          ? `<span class="tree-git-folder-dot tree-git-${gitDecoration.className}" title="${gitDecoration.title}" aria-label="${gitDecoration.title}"></span>`
          : `<span class="tree-git-status tree-git-${gitDecoration.className}" title="${gitDecoration.title}" aria-label="${gitDecoration.title}">${gitDecoration.label}</span>`
        : '';

      row.innerHTML = `
        <span class="chevron">${hasChevron ? (isExpanded ? '▼' : '▶') : ' '}</span>
        ${iconHtml}
        <span class="tree-label">${label}</span>
        ${gitDecorationHtml}
      `;

      if (entry.path === this.selectedPath) row.classList.add('active');

      if (entry.isDirectory) {
        row.classList.toggle('expanded', isExpanded);
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedPath = entry.path;
          void this.toggleFolder(entry.path);
        });

        const childWrap = document.createElement('div');
        childWrap.className = `tree-children${isExpanded ? '' : ' collapsed'}`;
        parent.appendChild(row);
        parent.appendChild(childWrap);

        if (isExpanded) {
          const children = this.childrenCache.get(entry.path) ?? [];
          const visible = children.filter((c) => this.matchesFilter(c));
          this.renderLevel(visible, childWrap, depth + 1);
        }
      } else {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedPath = entry.path;
          document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'));
          row.classList.add('active');
          this.onOpenFile(entry.path);
        });
        parent.appendChild(row);
      }
    });
  }

  private async toggleFolder(dirPath: string): Promise<void> {
    if (this.expanded.has(dirPath)) {
      this.expanded.delete(dirPath);
    } else {
      this.expanded.add(dirPath);
      await this.ensureChildren(dirPath);
    }
    await this.render();
  }

  private onTreeContextMenu(e: MouseEvent): void {
    const row = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
    e.preventDefault();

    const path = row?.dataset.path;
    const entry = path ? this.findEntry(path) : null;

    const items: MenuItem[] = [
      { label: 'Open Folder…', action: () => this.onOpenFolder() },
      { label: 'Refresh', action: () => void this.refresh() },
      { separator: true },
      { label: 'New…', action: () => void this.showCreateDialog() },
    ];

    if (entry) {
      items.push({ separator: true });
      if (!entry.isDirectory) {
        items.push({ label: 'Open', action: () => this.onOpenFile(entry.path) });
      }
      items.push(
        { label: 'Rename', action: () => void this.renameEntry(entry) },
        { label: 'Delete', action: () => void this.deleteEntry(entry) },
      );
    }

    if (this.rootPath) {
      items.push(
        { separator: true },
        {
          label: this.showHidden ? 'Hide Hidden Files' : 'Show Hidden Files',
          action: () => void this.toggleHidden(),
        },
        { label: 'Collapse All', action: () => this.collapseAll() },
      );
    }

    this.contextMenu.show(e.clientX, e.clientY, items);
  }

  private findEntry(targetPath: string): FileEntry | null {
    for (const children of this.childrenCache.values()) {
      const hit = children.find((c) => c.path === targetPath);
      if (hit) return hit;
    }
    if (targetPath === this.rootPath) {
      return { name: basename(targetPath), path: targetPath, isDirectory: true };
    }
    return null;
  }
}
