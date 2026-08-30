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
import { downloadSingleFile, downloadFolderAsZip, exportWorkspaceAsZip, importZipArchive } from '../../utils/webZipExport';

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

  setExtensionHost(host: import('../plugin/PluginHost').PluginHost): void {
    this.storeView.setHost(host);
  }

  setOnInstallExtension(handler: () => void): void {
    this.storeView.setInstallHandler(handler);
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
    const entries = await this.loadChildren(folderPath);
    if (entries.length === 0) {
      // Folder may be empty or unreadable — still render so it shows as open
    }
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
              <button type="button" class="explorer-tool-btn" data-action="new-file" title="New File">
                <!-- codicon_ new file.svg -->
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M5 14C4.448 14 4 13.552 4 13V3C4 2.448 4.448 2 5 2H8V4.5C8 5.328 8.672 6 9.5 6H12V6.025C12.344 6.056 12.677 6.121 13 6.213V5.414C13 5.016 12.842 4.635 12.561 4.353L9.647 1.439C9.366 1.158 8.984 1 8.586 1H5C3.895 1 3 1.895 3 3V13C3 14.105 3.895 15 5 15H7.261C7.008 14.693 6.791 14.357 6.607 14H5ZM9 2.207L11.793 5H9.5C9.224 5 9 4.776 9 4.5V2.207ZM11.5 7C9.015 7 7 9.015 7 11.5C7 13.985 9.015 16 11.5 16C13.985 16 16 13.985 16 11.5C16 9.015 13.985 7 11.5 7ZM14 12H12V14C12 14.276 11.776 14.5 11.5 14.5C11.224 14.5 11 14.276 11 14V12H9C8.724 12 8.5 11.776 8.5 11.5C8.5 11.224 8.724 11 9 11H11V9C11 8.724 11.224 8.5 11.5 8.5C11.776 8.5 12 8.724 12 9V11H14C14.276 11 14.5 11.224 14.5 11.5C14.5 11.776 14.276 12 14 12Z" fill="currentColor"/>
                </svg>
              </button>
              <button type="button" class="explorer-tool-btn" data-action="new-folder" title="New Folder">
                <!-- codicon_ new folder.svg -->
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 4.5V6H5.58579C5.71839 6 5.84557 5.94732 5.93934 5.85355L7.29289 4.5L5.93934 3.14645C5.84557 3.05268 5.71839 3 5.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM1 4.5C1 3.11929 2.11929 2 3.5 2H5.58579C5.98361 2 6.36514 2.15804 6.64645 2.43934L8.20711 4H12.5C13.8807 4 15 5.11929 15 6.5V7.25716C14.6929 7.00353 14.3578 6.78261 14 6.59971V6.5C14 5.67157 13.3284 5 12.5 5H8.20711L6.64645 6.56066C6.36514 6.84197 5.98361 7 5.58579 7H2V11.5C2 12.3284 2.67157 13 3.5 13H6.20703C6.30564 13.3486 6.43777 13.6832 6.59971 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5ZM16 11.5C16 13.9853 13.9853 16 11.5 16C9.01472 16 7 13.9853 7 11.5C7 9.01472 9.01472 7 11.5 7C13.9853 7 16 9.01472 16 11.5ZM12 9C12 8.72386 11.7761 8.5 11.5 8.5C11.2239 8.5 11 8.72386 11 9V11H9C8.72386 11 8.5 11.2239 8.5 11.5C8.5 11.7761 8.72386 12 9 12H11V14C11 14.2761 11.2239 14.5 11.5 14.5C11.7761 14.5 12 14.2761 12 14V12H14C14.2761 12 14.5 11.7761 14.5 11.5C14.5 11.2239 14.2761 11 14 11H12V9Z" fill="currentColor"/>
                </svg>
              </button>
              <button type="button" class="explorer-tool-btn" data-action="refresh" title="Refresh">
                <!-- codicon_ refresh.svg -->
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8C3 5.23858 5.23858 3 8 3C9.63527 3 11.0878 3.78495 12.0005 5H10C9.72386 5 9.5 5.22386 9.5 5.5C9.5 5.77614 9.72386 6 10 6H12.8904C12.8973 6.00014 12.9041 6.00014 12.911 6H13C13.2761 6 13.5 5.77614 13.5 5.5V2.5C13.5 2.22386 13.2761 2 13 2C12.7239 2 12.5 2.22386 12.5 2.5V4.03138C11.4009 2.78613 9.79253 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.1301 14 13.6999 11.6035 13.9756 8.54488C14.0003 8.26985 13.7975 8.0268 13.5225 8.00202C13.2474 7.97723 13.0044 8.1801 12.9796 8.45512C12.75 11.003 10.6079 13 8 13C5.23858 13 3 10.7614 3 8Z" fill="currentColor"/>
                </svg>
              </button>
              <button type="button" class="explorer-tool-btn" data-action="collapse" title="Collapse Folders">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M9 9H4v1h5V9zM9 6H4v1h5V6zM1 1v14h14V1H1zm13 13H2V2h12v12z"/>
                </svg>
              </button>
              <button type="button" class="explorer-tool-btn" data-action="export-zip" title="Download Workspace as ZIP (.zip)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
                  <path d="M3 2.5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" fill="none"/>
                  <path d="M8 5.5v5m0 0l-2-2m2 2l2-2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button type="button" class="explorer-tool-btn" data-action="hidden" title="Toggle Hidden Files">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 3C4 3 1.5 8 1.5 8s2.5 5 6.5 5 6.5-5 6.5-5-2.5-5-6.5-5zm0 8.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm0-5.5a2 2 0 100 4 2 2 0 000-4z"/>
                </svg>
              </button>
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
    this.mountEl.querySelector('[data-action="new-file"]')?.addEventListener('click', () => void this.showCreateDialog('file'));
    this.mountEl.querySelector('[data-action="new-folder"]')?.addEventListener('click', () => void this.showCreateDialog('folder'));
    this.mountEl.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void this.refresh());
    this.mountEl.querySelector('[data-action="collapse"]')?.addEventListener('click', () => this.collapseAll());
    this.mountEl.querySelector('[data-action="export-zip"]')?.addEventListener('click', () => void exportWorkspaceAsZip(this.rootPath));
    this.mountEl.querySelector('[data-action="hidden"]')?.addEventListener('click', () => void this.toggleHidden());

    // Only show Web ZIP export in browser web mode (hidden on native Desktop)
    const isWeb = Boolean((window.electronAPI as any)?.isWeb);
    const exportZipBtn = this.mountEl.querySelector('[data-action="export-zip"]') as HTMLElement | null;
    if (exportZipBtn && !isWeb) {
      exportZipBtn.style.display = 'none';
    }

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
    try {
      const entries = await window.electronAPI.readDir(dirPath, { showHidden: this.showHidden });
      this.childrenCache.set(dirPath, entries);
      return entries;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not read folder:\n\n${message}`);
      return [];
    }
  }

  private normalizePathKey(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
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

    try {
      if (result.type === 'folder') {
        console.trace('[MKDIR - Explorer]', target);
        await window.electronAPI.mkdir(target);
      } else {
        console.trace('[WRITE FILE - Explorer]', target);
        await window.electronAPI.writeFile(target, '');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Could not create ${result.type} "${result.name}":\n\n${message}`);
      return;
    }

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

  private async revealInFileManager(filePath: string): Promise<void> {
    try {
      await window.electronAPI.openPath(filePath);
    } catch {
      window.alert(`Could not open file manager for "${filePath}".`);
    }
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

    const isWeb = Boolean((window.electronAPI as any)?.isWeb);
    if (entry) {
      items.push({ separator: true });
      if (!entry.isDirectory) {
        items.push({ label: 'Open', action: () => this.onOpenFile(entry.path) });
        if (isWeb) {
          items.push({ label: 'Download File', action: () => void downloadSingleFile(entry.path) });
        }
      } else {
        if (isWeb) {
          items.push({ label: 'Download as ZIP (.zip)', action: () => void downloadFolderAsZip(entry.path) });
        }
      }
      items.push(
        { label: 'Reveal in File Manager', action: () => void this.revealInFileManager(entry.path) },
        { label: 'Rename', action: () => void this.renameEntry(entry) },
        { label: 'Delete', action: () => void this.deleteEntry(entry) },
      );
    }

    if (this.rootPath) {
      items.push({ separator: true });
      if (isWeb) {
        items.push(
          { label: 'Export Workspace as ZIP (.zip)', action: () => void exportWorkspaceAsZip(this.rootPath) },
          { label: 'Import ZIP Archive…', action: () => this.importZipDialog() },
          { separator: true },
        );
      }
      items.push(
        {
          label: this.showHidden ? 'Hide Hidden Files' : 'Show Hidden Files',
          action: () => void this.toggleHidden(),
        },
        { label: 'Collapse All', action: () => this.collapseAll() },
      );
    }

    this.contextMenu.show(e.clientX, e.clientY, items);
  }

  private importZipDialog(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = async () => {
      if (input.files && input.files[0]) {
        await importZipArchive(input.files[0], this.rootPath || '/');
        await this.refresh();
      }
      input.remove();
    };
    input.click();
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
