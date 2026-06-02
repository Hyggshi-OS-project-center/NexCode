/**
 * NexCode IDE — renderer entry point orchestrating all UI modules.
 */
import './monaco-setup';
import type {
  AiAgentAction,
  AiChatAttachment,
  AiChatMessage,
  AiChatResult,
  AiEditorContext,
  AppSettings,
  CodeValidationResult,
  FileStatResult,
  MediaKind,
  OpenPathsPayload,
  ReadFileForEditorResult,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { EditorManager } from './modules/editor/EditorManager';
import { EditorIdleEasterEgg } from './modules/editor/EditorIdleEasterEgg';
import { BinaryFileView } from './modules/editor/BinaryFileView';
import { MarkdownPreview } from './modules/editor/MarkdownPreview';
import { EditorBanner } from './modules/editor/EditorBanner';
import { hasManyInvisibleCharacters } from './utils/textAnalysis';
import { Explorer } from './modules/explorer/Explorer';
import { TabManager } from './modules/tabs/TabManager';
import { TerminalModule } from './modules/terminal/TerminalModule';
import { SearchReplace } from './modules/search/SearchReplace';
import { SettingsPanel } from './modules/settings/SettingsPanel';
import { WELCOME_TAB_PATH, WelcomeScreen } from './modules/welcome/WelcomeScreen';
import { StatusBar } from './modules/statusbar/StatusBar';
import { ContextMenu, type MenuItem } from './modules/contextmenu/ContextMenu';
import { RenameService } from './modules/Rename/Rename';
import { PluginHost } from './modules/plugin/PluginHost';
import { VsixExtensionStore } from './modules/plugin/VsixExtensionStore';
import { KeyboardShortcuts } from './modules/keyboard/KeyboardShortcuts';
import type { ShortcutAction } from '../shared/shortcuts';
import { getRunSpec } from './utils/runCommand';
import { parentDir, pathsEqual } from './utils/pathUtils';
import { startMemoryMonitor } from './utils/memoryMonitor';
import { GitPanel } from './modules/git/GitPanel';
import { ChatPanel } from './modules/chat/ChatPanel';
import { DiffEditor } from './modules/editor/DiffEditor';
import type { DiffEditorPendingWrite } from './modules/editor/DiffEditor';
import { SplashScreen } from './modules/ui/SplashScreen';
import { NexCodeMoments } from './modules/ui/NexCodeMoments';
import { UpdateController } from './modules/update/UpdateController';
import {
  RELEASE_NOTES_STORAGE_KEY,
  RELEASE_NOTES_TAB_PATH,
  ReleaseNotesView,
} from './modules/releaseNotes/ReleaseNotesView';
import splashImageRandom1Url from '@icons/loading/my-splash-Random1.png?url';
import splashImageRandom2Url from '@icons/loading/my-splash-Random2.png?url';
import splashImageRandom3Url from '@icons/loading/my-splash-Random3.png?url';

const splashImageUrls = [splashImageRandom1Url, splashImageRandom2Url, splashImageRandom3Url] as const;

function getRandomSplashImageUrl(): string {
  return splashImageUrls[Math.floor(Math.random() * splashImageUrls.length)];
}

interface WatchedFileSnapshot {
  size: number;
  mtimeMs: number;
}

class NexusApp {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private workspacePath: string | null = null;
  private dirtyFiles = new Set<string>();
  private pluginHost = new PluginHost();
  private vsixStore = new VsixExtensionStore();
  private binaryMeta = new Map<string, ReadFileForEditorResult>();
  private forceTextOpen = new Set<string>();
  private fileSnapshots = new Map<string, WatchedFileSnapshot>();
  private fileWatchTimer: number | null = null;
  private checkingFileChanges = false;
  private unicodeHighlightDisabled = false;
  /** Temporarily prevents auto-save while the unsaved changes dialog is showing */
  private autoSaveSuspended = false;
  /** Original file content at last save — used to restore when user clicks "Don't Save" */
  private originalContent = new Map<string, string>();

  private editor!: EditorManager;
  private binaryView!: BinaryFileView;
  private editorBanner!: EditorBanner;
  private explorer!: Explorer;
  private tabs!: TabManager;
  private terminal!: TerminalModule;
  private search!: SearchReplace;
  private settingsPanel!: SettingsPanel;
  private welcome!: WelcomeScreen;
  private statusBar!: StatusBar;
  private contextMenu!: ContextMenu;
  private shortcuts!: KeyboardShortcuts;
  private gitPanel!: GitPanel;
  private chatPanel!: ChatPanel;
  private idleEasterEgg!: EditorIdleEasterEgg;
  private moments!: NexCodeMoments;
  private updates!: UpdateController;
  private mdPreview!: MarkdownPreview;
  private releaseNotes!: ReleaseNotesView;
  private renameService!: RenameService;
  private diffEditor!: DiffEditor;
  /** Set while the diff editor is reviewing AI changes — suppresses file watcher reloads */
  private diffEditorActive = false;
  /** Trimmed terminal output sample for moment detection — capped to reduce memory */
  private terminalOutputSample = '';
  private settingsApplyQueue: Promise<void> = Promise.resolve();

  private async syncWindowControlState(): Promise<void> {
    const maximizeBtn = document.getElementById('btn-maximize');
    if (!maximizeBtn) return;
    try {
      const isMaximized = await window.electronAPI.isMaximized();
      maximizeBtn.innerHTML = isMaximized ? '&#xE923;' : '&#xE922;';
      maximizeBtn.setAttribute('title', isMaximized ? 'Restore' : 'Maximize');
    } catch {
      maximizeBtn.innerHTML = '&#xE922;';
      maximizeBtn.setAttribute('title', 'Maximize');
    }
  }

  private isLegacySplash2025Enabled(): boolean {
    try {
      return localStorage.getItem('nexcode.legacySplash2025') === '1';
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    const legacySplash2025 = this.isLegacySplash2025Enabled();
    const splash = new SplashScreen({
      minDisplayMs: 1999,
      imageSrc: getRandomSplashImageUrl(),
      imageWidth: 480,
      imageHeight: 270,
    });
    document.getElementById('app-splash')?.classList.toggle('app-splash--legacy-2025', legacySplash2025);
    splash.setStatus(legacySplash2025 ? 'Starting NexCode 2025…' : 'Starting…');

    window.electronAPI.onOpenPaths((payload) => void this.handleOpenPaths(payload));

    splash.setStatus('Loading settings…');
    this.settings = await window.electronAPI.getSettings();
    document.body.dataset.theme = this.settings.theme;
    this.applyGlobalFont();
    // Sync the saved update channel to main process on startup
    void window.electronAPI.setUpdateChannel(this.settings.updateChannel ?? 'stable');

    splash.setStatus('Preparing editor…');
    EditorManager.registerSnippets();

    this.statusBar = new StatusBar();
    this.moments = new NexCodeMoments();
    this.updates = new UpdateController();
    this.statusBar.applySettings(this.settings);

    this.editor = new EditorManager('monaco-host', this.settings);
    this.idleEasterEgg = new EditorIdleEasterEgg('editor-container');
    this.binaryView = new BinaryFileView('editor-container');
    this.editorBanner = new EditorBanner('editor-container');
    this.diffEditor = new DiffEditor('editor-container');
    this.mdPreview = new MarkdownPreview('editor-container');
    this.releaseNotes = new ReleaseNotesView('editor-container');
    this.mdPreview.onHide(() => {
      // Restore editor layout after closing preview
      this.editor.show();
      requestAnimationFrame(() => this.editor.layout());
    });
    this.contextMenu = new ContextMenu('context-menu');
    this.renameService = new RenameService({
      isSpecialTab: (path) => this.releaseNotes.isReleaseNotesPath(path) || path === WELCOME_TAB_PATH,
      getParentPath: (path) => {
        const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
      },
      pathExists: (path) => window.electronAPI.exists(path),
      renamePath: (oldPath, newPath) => window.electronAPI.rename(oldPath, newPath),
      showAlert: (message) => window.alert(message),
      refreshExplorer: () => this.explorer.refresh(),
      getWorkspacePath: () => this.workspacePath,
      closeTab: (path) => this.tabs.closeTab(path),
    });
    // Wire up the rename service to call the tab manager's inline rename
    this.renameService.setStartInlineRenameCallback((path) => this.tabs.startInlineRename(path));
    this.explorer = new Explorer(
      'panel-explorer',
      (path) => void this.openFile(path),
      this.contextMenu,
      () => void this.openFolder(),
      (line) => this.editor.revealLine(line),
      (oldPath, newPath, isDirectory) => this.handleRenamedPath(oldPath, newPath, isDirectory),
    );
    this.tabs = new TabManager(
      'tab-bar',
      (path, x, y) => this.onTabContextMenu(path, x, y),
      (path, newName) => void this.onTabRename(path, newName),
      (path) => this.onBeforeTabClose(path),
    );
    this.shortcuts = new KeyboardShortcuts(this.createShortcutActions());
    this.shortcuts.bind();
    window.electronAPI.onShortcut((action) => this.executeShortcut(action));
    this.terminal = new TerminalModule(
      'terminal-panel',
      'terminal-container',
      this.settings,
      (e) => this.shortcuts.handleEvent(e),
      (cwd) => void this.syncWorkspaceFromTerminal(cwd),
      (cwd) => this.statusBar.setTerminalCwd(cwd),
      (data) => this.handleTerminalOutput(data),
      (moment) => {
        if (moment === 'legacySplash2025') this.moments.showLegacySplashEnabled();
      },
    );
    this.search = new SearchReplace(this.editor);

    this.settingsPanel = new SettingsPanel('panel-settings', this.settings, (partial) =>
      void this.applySettings(partial),
    );

    this.gitPanel = new GitPanel('panel-git', (command) => {
      void this.terminal.show();
      void this.terminal.sendCommand(command, true);
    });

    this.chatPanel = new ChatPanel(
      'panel-chat',
      () => void this.showSidebarPanel('settings'),
      (actions) => this.handleAgentActions(actions),
      () => this.workspacePath,
      () => this.editor.getAiContext(),
      () => this.settings,
      (partial) => void this.applySettings(partial),
    );

    this.welcome = new WelcomeScreen('welcome-screen', {
      onOpenFolder: () => void this.openFolder(),
      onOpenFile: () => void this.pickFile(),
      onNewFile: () => void this.newUntitledFile(),
      onAIAgent: () => void this.showSidebarPanel('chat'),
      onToggleTerminal: () => this.terminal.toggle(),
    });

    this.editor.setHandlers(
      (path) => this.onEditorChange(path),
      (path, value) => void this.onAutoSave(path, value),
      (line, col, lang) => {
        this.statusBar.setPosition(line, col);
        this.statusBar.setLanguage(lang);
      },
    );

    this.tabs.on('select', (path) => void this.switchToFile(path));
    this.tabs.on('close', (path) => this.onTabClose(path));

    this.startFileChangeWatcher();
    this.bindCrashMoments();
    this.bindUI();
    this.bindTitlebarMenus();
    this.bindContextMenus();
    this.updates.init();
    void this.showSidebarPanel('explorer');
    this.updateViewState();
    splash.hide();
    void this.openReleaseNotesAfterUpdate();
  }

  private bindUI(): void {
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('btn-maximize')?.addEventListener('click', () => {
      window.electronAPI.maximizeWindow();
      window.setTimeout(() => void this.syncWindowControlState(), 60);
    });
    document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI.closeWindow());
    window.addEventListener('resize', () => void this.syncWindowControlState());
    void this.syncWindowControlState();

    document.getElementById('btn-open-folder')?.addEventListener('click', () => void this.openFolder());
    document.getElementById('btn-run')?.addEventListener('click', () => void this.runActiveFile());
    document.getElementById('btn-terminal-quick')?.addEventListener('click', () => this.terminal.toggle());
    document.getElementById('status-terminal')?.addEventListener('click', () => this.terminal.toggle());
    document.getElementById('btn-new-terminal')?.addEventListener('click', () => void this.terminal.createTerminal());
    document.getElementById('btn-toggle-terminal')?.addEventListener('click', () => this.terminal.toggle());
    document.getElementById('btn-split-down')?.addEventListener('click', () => this.editor.splitDown());
    document.getElementById('status-branch')?.addEventListener('click', () => void this.showSidebarPanel('git'));
    document.getElementById('btn-md-preview')?.addEventListener('click', () => {
      const path = this.tabs.getActivePath();
      const content = path ? (this.editor.getContent(path) ?? '') : '';
      const filename = path ? (path.split(/[\/\\]/).pop() ?? '') : '';
      this.mdPreview.toggle(content, filename);
      requestAnimationFrame(() => this.editor.layout());
    });
    document.getElementById('btn-extensions')?.addEventListener('click', () => void this.openExtensionMarketplace());
    document.getElementById('titlebar-btn-agent')?.addEventListener('click', () => window.electronAPI.openAgent());

    document.querySelectorAll('.activity-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = (btn as HTMLElement).dataset.panel;
        void this.showSidebarPanel(panel ?? 'explorer');
      });
    });

    document.getElementById('titlebar-btn-sidebar')?.addEventListener('click', () => {
      document.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed');
      requestAnimationFrame(() => this.editor.layout());
    });

    window.addEventListener('beforeunload', () => {
      if (this.fileWatchTimer !== null) window.clearInterval(this.fileWatchTimer);
      this.idleEasterEgg.dispose();
      this.updates.dispose();
      this.terminal.dispose();
    });
  }

  private bindCrashMoments(): void {
    window.addEventListener('error', () => this.moments.showCrash());
    window.addEventListener('unhandledrejection', () => this.moments.showCrash());
  }

  private handleTerminalOutput(data: string): void {
    const clean = data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    this.terminalOutputSample = (this.terminalOutputSample + clean).slice(-8000);
    const lower = this.terminalOutputSample.toLowerCase();

    const explicitErrorCount = [...lower.matchAll(/(?:found\s+)?(\d+)\s+(?:errors?|diagnostics?)/g)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);
    const errorMentions = (lower.match(/\berror\b/g) ?? []).length;
    if (explicitErrorCount.some((count) => count >= 50) || errorMentions >= 50) {
      this.moments.showTooManyErrors();
      this.terminalOutputSample = '';
    }

    if (
      /(?:compiled successfully|build success|build succeeded|built in|✓ built|0 errors)/i.test(clean) &&
      !/(?:failed|error)/i.test(clean)
    ) {
      this.moments.showBuildSuccess();
    }

    if ((new Date().getHours() === 3 || new Date().getHours() === 15) && /\b(?:bug|fix|error|failed)\b/i.test(clean)) {
      this.moments.showBugHunter();
    }
  }

  private openNexCatMode(): void {
    this.moments.showNexCatMode();
    window.electronAPI.showEasterEggWindow();
  }

  private syncActivityPanel(panel: string): void {
    const known = new Set(['explorer', 'search', 'git', 'chat', 'settings']);
    if (!known.has(panel)) return;
    document.querySelectorAll('.activity-item').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.panel === panel);
    });
  }

  private bindTitlebarMenus(): void {
    document.querySelectorAll<HTMLElement>('[data-titlebar-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const menu = btn.dataset.titlebarMenu;
        if (!menu) return;
        const rect = btn.getBoundingClientRect();
        this.contextMenu.show(rect.left, rect.bottom + 2, this.buildTitlebarMenu(menu));
      });
    });
  }

  private buildTitlebarMenu(menu: string): MenuItem[] {
    const ed = (id: string) => (): void => {
      void this.editor.runEditorAction(id);
    };
    switch (menu) {
      case 'file':
        return [
          { label: 'Open Folder…', shortcut: 'Ctrl+Shift+O', action: () => void this.openFolder() },
          { label: 'Open File…', shortcut: 'Ctrl+O', action: () => void this.pickFile() },
          { label: 'New File', action: () => void this.newUntitledFile() },
          { separator: true },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => void this.saveActiveFile() },
        ];
      case 'edit':
        return [
          { label: 'Undo', shortcut: 'Ctrl+Z', action: () => ed('editor.action.undo')() },
          { label: 'Redo', shortcut: 'Ctrl+Y', action: () => ed('editor.action.redo')() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', action: () => ed('editor.action.clipboardCutAction')() },
          { label: 'Copy', shortcut: 'Ctrl+C', action: () => ed('editor.action.clipboardCopyAction')() },
          { label: 'Paste', shortcut: 'Ctrl+V', action: () => ed('editor.action.clipboardPasteAction')() },
          { separator: true },
          { label: 'Insert Font', action: () => this.insertConfiguredFont() },
          { separator: true },
          { label: 'Find', shortcut: 'Ctrl+F', action: () => this.search.show(false) },
          { label: 'Replace', shortcut: 'Ctrl+H', action: () => this.search.show(true) },
        ];
      case 'selection':
        return [
          { label: 'Select All', shortcut: 'Ctrl+A', action: () => ed('editor.action.selectAll')() },
          { label: 'Expand Selection', shortcut: 'Shift+Alt+→', action: () => ed('editor.action.smartSelect.expand')() },
          { label: 'Shrink Selection', shortcut: 'Shift+Alt+←', action: () => ed('editor.action.smartSelect.shrink')() },
          { separator: true },
          { label: 'Toggle Line Comment', shortcut: 'Ctrl+/', action: () => ed('editor.action.commentLine')() },
        ];
      case 'view':
        return [
          { label: 'Explorer', action: () => void this.showSidebarPanel('explorer') },
          { label: 'Search', action: () => void this.showSidebarPanel('search') },
          { label: 'Source Control', action: () => void this.showSidebarPanel('git') },
          { label: 'Chat AI', action: () => void this.showSidebarPanel('chat') },
          { label: 'Settings', action: () => void this.showSidebarPanel('settings') },
          { separator: true },
          { label: 'Terminal', shortcut: 'Ctrl+`', action: () => this.terminal.toggle() },
          {
            label: 'Toggle Primary Side Bar', action: () => {
              document.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed');
              requestAnimationFrame(() => this.editor.layout());
            }
          },
          { separator: true },
          { label: 'Zoom In', action: () => ed('editor.action.fontZoomIn')() },
          { label: 'Zoom Out', action: () => ed('editor.action.fontZoomOut')() },
          { label: 'Reset Zoom', action: () => ed('editor.action.fontZoomReset')() },
        ];
      case 'go':
        return [
          { label: 'Go to Line…', shortcut: 'Ctrl+G', action: () => ed('editor.action.gotoLine')() },
          { label: 'Go to Symbol…', shortcut: 'Ctrl+Shift+O', action: () => ed('editor.action.quickOutline')() },
          { separator: true },
          { label: 'Go to Bracket', action: () => ed('editor.action.jumpToBracket')() },
        ];
      case 'run':
        return [{ label: 'Run Active File', shortcut: 'F5', action: () => void this.runActiveFile() }];
      case 'terminal':
        return [
          { label: 'New Terminal', action: () => void this.terminal.createTerminal() },
          { label: 'Toggle Terminal', action: () => this.terminal.toggle() },
          { label: 'Focus Terminal', action: () => void this.terminal.show() },
        ];
      case 'help':
        return [
          {
            label: 'Welcome',
            action: () => this.openWelcome(),
          },
          { separator: true },
          {
            label: 'Extension Marketplace',
            action: () => void this.openExtensionMarketplace(),
          },
          {
            label: "What's New",
            action: () => void this.openReleaseNotes(),
          },
          { separator: true },
          {
            label: 'Open AI IDE Agent',
            action: () => window.electronAPI.openAgent(),
          },
          { separator: true },
          {
            label: 'View License',
            action: () => void this.showLicense(),
          },
          {
            label: 'About NexCode IDE',
            action: () => window.electronAPI.showAboutWindow(),
          },
        ];
      default:
        return [];
    }
  }

  private async showSidebarPanel(panel: string): Promise<void> {
    const shell = document.querySelector('.app-shell');
    shell?.classList.remove('sidebar-collapsed');
    shell?.classList.toggle('settings-expanded', panel === 'settings');
    this.syncActivityPanel(panel);

    const title = document.getElementById('sidebar-title')!;
    (['explorer', 'search', 'git', 'chat', 'settings'] as const).forEach((id) => {
      document.getElementById(`panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });

    const openFolderBtn = document.getElementById('btn-open-folder');
    openFolderBtn?.classList.toggle('hidden', panel === 'git');

    if (panel === 'explorer') {
      title.textContent = 'EXPLORER';
      this.explorer.show();
      if (this.workspacePath) await this.explorer.loadFolder(this.workspacePath);
      else await this.explorer.refresh();
    } else if (panel === 'search') {
      title.textContent = 'SEARCH';
      this.explorer.hide();
      const searchPanel = document.getElementById('panel-search')!;
      if (!searchPanel.querySelector('.search-sidebar')) {
        searchPanel.innerHTML = `
          <div class="search-sidebar">
            <p>Use <kbd>Ctrl</kbd>+<kbd>F</kbd> (find) or <kbd>Ctrl</kbd>+<kbd>H</kbd> (replace) in the editor toolbar.</p>
            <input type="text" placeholder="Search in files (coming soon)" disabled />
          </div>
        `;
      }
    } else if (panel === 'git') {
      title.textContent = 'SOURCE CONTROL';
      this.explorer.hide();
      this.gitPanel.setWorkspace(this.workspacePath);
      void this.gitPanel.refresh().then((s) => this.statusBar.setBranch(s?.branch ?? null, s?.isRepo));
    } else if (panel === 'chat') {
      title.textContent = 'CHAT AI';
      this.explorer.hide();
      this.chatPanel.show();
    } else if (panel === 'settings') {
      title.textContent = 'SETTINGS';
      this.explorer.hide();
      this.settingsPanel.update(this.settings);
    }
  }

  /** Apply agent tool results — show diff review for writes, open reads, run commands. */
  private async handleAgentActions(actions: AiAgentAction[]): Promise<void> {
    const hour = new Date().getHours();
    if ((hour === 3 || hour === 15) && actions.some((action) => action.type === 'write_file' || action.type === 'run_command')) {
      this.moments.showBugHunter();
    }

    // Collect write_file actions - these need diff review before writing
    const writeActions = actions.filter((action) => action.type === 'write_file' && action.path);

    // Build pending diffs
    const pendingWrites: DiffEditorPendingWrite[] = [];
    for (const action of writeActions) {
      const path = action.path!;
      const originalContent = action.originalContent ?? '';
      const modifiedContent = action.content ?? '';

      // Skip if there's actually no diff
      if (originalContent === modifiedContent) continue;

      pendingWrites.push({
        path,
        originalContent,
        modifiedContent,
        label: action.label,
      });
    }

    // Suppress the file watcher while the diff editor is reviewing changes,
    // so it doesn't try to reload files from disk mid-review and trigger
    // Monaco "Canceled: Canceled" errors on updateFileContent.
    this.diffEditorActive = true;
    const cleanup = () => { this.diffEditorActive = false; };

    // Show diff editor review if there are pending writes
    if (pendingWrites.length > 0) {
      console.log('[DiffEditor] Showing diff for', pendingWrites.length, 'file(s)');

      this.diffEditor.show(pendingWrites, {
        onApprove: async (path: string, content: string) => {
          // Write approved content to disk
          await window.electronAPI.writeFile(path, content);
          // Run validation after approval
          const validation = await window.electronAPI.aiValidate(path, this.workspacePath);
          if (validation && !validation.ok) {
            document.getElementById('status-file')!.textContent = `Validation failed for ${path.split(/[/\\]/).pop()}`;
          } else if (validation) {
            document.getElementById('status-file')!.textContent = `Validated ${path.split(/[/\\]/).pop()}`;
          }
          // Open the file in the editor to show the approved result
          await this.openFile(path);
          if (this.workspacePath) await this.explorer.refresh();
          await this.updateFileSnapshot(path);
        },
        onReject: async (_path: string, _originalContent: string) => {
          // File was never written to disk, so no action needed on reject
        },
        onAcceptAll: () => {
          // All writes approved via onApprove
        },
        onDismiss: () => {
          // Remaining writes were not written to disk, no action needed
        },
        onHide: cleanup,
      });
    } else {
      cleanup();
    }

    // Handle non-write actions (reads, commands)
    for (const action of actions) {
      if (action.type === 'read_file' && action.path) {
        await this.openFile(action.path);
      } else if (action.type === 'run_command' && action.command) {
        await this.terminal.show();
        await this.terminal.sendCommand(action.command, true);
      }
    }
  }


  private createShortcutActions() {
    return {
      save: () => void this.saveActiveFile(),
      find: () => this.search.show(false),
      replace: () => this.search.show(true),
      toggleTerminal: () => this.terminal.toggle(),
      openFile: () => void this.pickFile(),
      openFolder: () => void this.openFolder(),
      run: () => void this.runActiveFile(),
      openNexCat: () => this.openNexCatMode(),
      toggleBreakpoint: () => this.editor.toggleBreakpointAtCursor(),
      closeSearch: () => {
        if (this.search.isVisible()) this.search.hide();
      },
    };
  }

  private executeShortcut(action: ShortcutAction): void {
    const actions = this.createShortcutActions();
    switch (action) {
      case 'save':
        actions.save();
        break;
      case 'find':
        actions.find();
        break;
      case 'replace':
        actions.replace();
        break;
      case 'toggleTerminal':
        actions.toggleTerminal();
        break;
      case 'openFile':
        actions.openFile();
        break;
      case 'openFolder':
        actions.openFolder();
        break;
      case 'run':
        actions.run();
        break;
      case 'openNexCat':
        actions.openNexCat();
        break;
    }
  }

  /** Run the active file in the integrated terminal (F5 / Run button) */
  private async runActiveFile(): Promise<void> {
    const path = this.tabs.getActivePath();
    if (!path) return;
    if (this.releaseNotes.isReleaseNotesPath(path)) return;
    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) return;

    if (this.dirtyFiles.has(path)) await this.saveFile(path, false);

    const spec = getRunSpec(path, this.settings.terminalShell, {
      cwd: this.terminal.getTerminalCwd(),
    });
    await this.terminal.show();

    if (!spec) {
      const ext = path.split('.').pop() ?? 'unknown';
      await this.terminal.sendCommand(
        this.formatTerminalMessage(`No run configuration for .${ext} files`),
        true,
      );
      return;
    }

    await this.terminal.sendCommand(spec.command, true);
    document.getElementById('status-file')!.textContent = `Ran (${spec.label})`;
  }

  private bindContextMenus(): void {
    const editorContainer = document.getElementById('editor-container')!;
    editorContainer.addEventListener('contextmenu', (e) => {
      if (!this.tabs.hasTabs()) return;
      e.preventDefault();
      this.contextMenu.show(e.clientX, e.clientY, [
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { separator: true },
        { label: 'Insert Font', action: () => this.insertConfiguredFont() },
        { separator: true },
        { label: 'Find', shortcut: 'Ctrl+F', action: () => this.search.show(false) },
        { label: 'Replace', shortcut: 'Ctrl+H', action: () => this.search.show(true) },
        { separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => void this.saveActiveFile() },
        { separator: true },
        { label: 'Run', shortcut: 'F5', action: () => void this.runActiveFile() },
        {
          label: 'Toggle Breakpoint',
          shortcut: 'F9',
          action: () => this.editor.toggleBreakpointAtCursor(),
        },
      ]);
    });

    document.getElementById('terminal-panel')?.addEventListener('contextmenu', (e) => {
      if (!(e.target as HTMLElement).closest('.terminal-container, .terminal-command-row, .xterm')) return;
      e.preventDefault();
      this.contextMenu.show(e.clientX, e.clientY, [
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => void this.terminal.paste() },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => void this.terminal.copySelection() },
        { label: 'Clear', action: () => this.terminal.clear() },
        { separator: true },
        { label: 'New Terminal', action: () => void this.terminal.createTerminal() },
      ]);
    });

  }

  private insertConfiguredFont(): void {
    const inserted = this.editor.insertFontFamily(this.settings.insertFontFamily);
    if (inserted) {
      document.getElementById('status-file')!.textContent = 'Inserted font';
    }
  }

  /** Shell-safe user message (Write-Host breaks in CMD). */
  private formatTerminalMessage(message: string): string {
    const text = message.replace(/"/g, '""');
    if (this.settings.terminalShell === 'powershell') {
      return `Write-Host "${text}" -ForegroundColor Yellow`;
    }
    return `echo "${text}"`;
  }

  private async applySettings(partial: Partial<AppSettings>): Promise<void> {
    const apply = async () => {
      this.settings = await window.electronAPI.setSettings(partial);
      document.body.dataset.theme = this.settings.theme;
      this.applyGlobalFont();
      this.editor.applySettings(this.settings);
      this.terminal.applySettings(this.settings);
      this.chatPanel.updateSettings();
      if (partial.terminalShell !== undefined && this.terminal.isVisible()) {
        await this.terminal.recreateForShellChange();
      }
      this.statusBar.applySettings(this.settings);
    };

    this.settingsApplyQueue = this.settingsApplyQueue.then(apply, apply);
    return this.settingsApplyQueue;
  }

  private applyGlobalFont(): void {
    document.documentElement.style.setProperty('--font-ui', this.settings.fontFamily);
    document.body.style.fontFamily = this.settings.fontFamily;
  }

  private async openFolder(): Promise<void> {
    const folder = await window.electronAPI.openFolder();
    if (!folder) return;
    await this.setWorkspaceFolder(folder, true);
  }

  /** Files/folders from Windows file association, argv, or second-instance. */
  private async handleOpenPaths(payload: OpenPathsPayload): Promise<void> {
    for (const folder of payload.folders) {
      await this.setWorkspaceFolder(folder, true);
    }

    for (const filePath of payload.files) {
      if (!this.workspacePath) {
        await this.setWorkspaceFolder(parentDir(filePath), false);
      }
      await this.openFile(filePath);
    }
  }

  /** When terminal `cd`s to a folder, update the file explorer to match */
  private async syncWorkspaceFromTerminal(cwd: string): Promise<void> {
    if (this.workspacePath && pathsEqual(this.workspacePath, cwd)) return;
    try {
      const stat = await window.electronAPI.stat(cwd);
      if (!stat?.isDirectory) return;
    } catch {
      return;
    }
    await this.setWorkspaceFolder(cwd, false);
  }

  private async setWorkspaceFolder(folder: string, updateTerminalShell: boolean): Promise<void> {
    this.workspacePath = folder;
    try {
      await window.electronAPI.setWorkspacePath(folder);
    } catch {
      /* Older running main processes may not have this handler until restart. */
    }
    this.terminal.setCwd(folder);
    this.statusBar.setTerminalCwd(folder);
    document.getElementById('titlebar-path')!.textContent = folder;
    await this.explorer.loadFolder(folder);
    if (updateTerminalShell) await this.terminal.changeDirectory(folder, false);
    await this.vsixStore.scanWorkspace(folder, this.pluginHost);
    this.explorer.updateConvenienceStore(this.vsixStore.getExtensions());
    this.explorer.getTimeline().clear();
    this.pluginHost.emit('folderOpened', folder);
    this.gitPanel.setWorkspace(folder);
    void this.refreshGitBranch();
    this.updateViewState();
  }

  private async refreshGitBranch(): Promise<void> {
    if (!this.workspacePath) {
      this.statusBar.setBranch(null, false);
      return;
    }
    const status = await window.electronAPI.gitStatus(this.workspacePath);
    this.statusBar.setBranch(status.branch, status.isRepo);
  }

  private async pickFile(): Promise<void> {
    const file = await window.electronAPI.openFile();
    if (file) await this.openFile(file);
  }

  private async newUntitledFile(): Promise<void> {
    const base = this.workspacePath ?? 'C:\\untitled';
    let i = 1;
    let path = `${base}\\untitled-${i}.txt`;
    while (await window.electronAPI.exists(path)) {
      i++;
      path = `${base}\\untitled-${i}.txt`;
    }
    console.trace('[WRITE FILE - newUntitledFile]', path);
    await window.electronAPI.writeFile(path, '');
    await this.openFile(path);
  }

  private async openFile(path: string, forceText = false): Promise<void> {
    if (this.releaseNotes.isReleaseNotesPath(path)) {
      await this.openReleaseNotes();
      return;
    }

    this.tabs.openTab(path);
    this.statusBar.setFile(path);
    this.welcome.hide();
    this.updateViewState();

    if (!forceText && !this.forceTextOpen.has(path)) {
      const result = await window.electronAPI.readFileForEditor(path);
      if (result.isBinary) {
        this.binaryMeta.set(path, result);
        this.showBinaryTab(path);
        this.pluginHost.emit('fileOpened', path);
        return;
      }
      this.binaryMeta.delete(path);
      await this.showTextTab(path, result.content ?? '');
    } else {
      const content = await window.electronAPI.readFile(path);
      this.binaryMeta.delete(path);
      await this.showTextTab(path, content, true);
    }

    await this.updateFileSnapshot(path);
    // Store original content so we can restore it if user clicks "Don't Save"
    if (!this.originalContent.has(path)) {
      this.originalContent.set(path, this.editor.getContent(path));
    }
    this.explorer.getTimeline().push(path, 'Opened');
    void this.refreshOutline();
    this.pluginHost.emit('fileOpened', path);
  }

  private async refreshOutline(): Promise<void> {
    await this.explorer.updateOutline(this.editor.getActiveModel());
  }

  private showBinaryTab(path: string): void {
    const meta = this.binaryMeta.get(path);
    if (!meta) return;

    this.releaseNotes.hide();
    this.editor.hide();
    this.editorBanner.hide();
    this.binaryView.show({
      path,
      size: meta.size,
      mediaKind: meta.mediaKind,
      mediaUrl: meta.mediaUrl,
      onOpenAnyway: () => {
        this.forceTextOpen.add(path);
        void this.openFile(path, true);
      },
    });
    this.statusBar.setBinaryPreview(this.binaryStatusLabel(path, meta.mediaKind));
    this.updateRunButtonForActiveTab();
  }

  private binaryStatusLabel(path: string, mediaKind: MediaKind): string {
    if (mediaKind === 'image') return 'Image';
    if (mediaKind === 'video') return 'Video';
    if (mediaKind === 'audio') return 'Audio';
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    if (ext) return ext.toUpperCase();
    return 'Binary';
  }

  private updateRunButtonForActiveTab(): void {
    const path = this.tabs.getActivePath();
    const btn = document.getElementById('btn-run') as HTMLButtonElement | null;
    if (!btn) return;
    const isInternal = this.releaseNotes.isReleaseNotesPath(path);
    const isBinary = Boolean(path && this.binaryMeta.has(path) && !this.forceTextOpen.has(path));
    btn.disabled = isInternal || isBinary;
    btn.classList.toggle('is-disabled', isInternal || isBinary);
    btn.title = isInternal ? 'Cannot run internal pages' : isBinary ? 'Cannot run binary files' : 'Run file (F5)';
  }

  private async showTextTab(path: string, content: string, checkUnicode = false): Promise<void> {
    this.releaseNotes.hide();
    this.binaryView.hide();
    this.statusBar.restoreTextEditor(this.settings);
    this.updateRunButtonForActiveTab();
    this.editor.show();
    await this.editor.openFile(path, content);
    this.statusBar.setFile(path);
    void this.refreshOutline();

    // Auto-update Markdown preview if it is open
    const isMarkdown = /\.md$/i.test(path);
    const previewBtn = document.getElementById('btn-md-preview') as HTMLButtonElement | null;
    if (previewBtn) previewBtn.style.display = isMarkdown ? '' : 'none';
    if (isMarkdown && this.mdPreview.isVisible()) {
      const filename = path.split(/[\/\\]/).pop() ?? '';
      this.mdPreview.update(content);
      this.mdPreview.setTitle(filename);
    } else if (!isMarkdown) {
      this.mdPreview.hide();
    }

    if (checkUnicode && hasManyInvisibleCharacters(content) && !this.unicodeHighlightDisabled) {
      this.editor.setUnicodeHighlight(true);
      this.editorBanner.showInvisibleUnicodeWarning(() => {
        this.unicodeHighlightDisabled = true;
        this.editor.setUnicodeHighlight(false);
      });
    } else if (!checkUnicode || this.unicodeHighlightDisabled) {
      this.editorBanner.hide();
    }
  }

  /** Open the Extension Marketplace (browser-based Open VSX). */
  private async openExtensionMarketplace(): Promise<void> {
    try {
      await window.electronAPI.openExternal('https://open-vsx.org');
    } catch {
      await this.terminal.show();
      await this.terminal.sendCommand(
        this.formatTerminalMessage('Extension Marketplace: open https://open-vsx.org in your browser'),
        true,
      );
    }
  }

  private async openReleaseNotes(markShown = false): Promise<void> {
    this.tabs.openTab(RELEASE_NOTES_TAB_PATH);
    this.welcome.hide();
    this.editor.hide();
    this.binaryView.hide();
    this.editorBanner.hide();
    this.mdPreview.hide();
    await this.releaseNotes.show();
    this.statusBar.setFile("What's New");
    this.statusBar.setInternalPage('Release Notes');
    const previewBtn = document.getElementById('btn-md-preview') as HTMLButtonElement | null;
    if (previewBtn) previewBtn.style.display = 'none';
    this.updateRunButtonForActiveTab();
    if (markShown) {
      try {
        localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, await this.releaseNotes.getCurrentVersion());
      } catch {
        /* ignore localStorage failures */
      }
    }
  }

  private openWelcome(): void {
    this.tabs.openTab(WELCOME_TAB_PATH);
    this.welcome.show();
    this.editor.hide();
    this.binaryView.hide();
    this.editorBanner.hide();
    this.mdPreview.hide();
    this.releaseNotes.hide();
    this.statusBar.setFile('Welcome');
    this.statusBar.setInternalPage('Welcome');
    this.updateRunButtonForActiveTab();
  }

  /**
   * Called before a tab is closed. If the file has unsaved changes, shows a
   * confirmation dialog with Save / Discard / Cancel options.
   * @returns true if the tab should close, false to cancel.
   */
  private async onBeforeTabClose(path: string): Promise<boolean> {
    // Special tabs (release notes, welcome) and non-dirty files can close immediately
    if (this.releaseNotes.isReleaseNotesPath(path) || path === WELCOME_TAB_PATH) return true;
    if (!this.dirtyFiles.has(path)) return true;

    // Cancel any pending auto-save and suspend further auto-saves while dialog is open
    this.editor.cancelAutoSave();
    this.autoSaveSuspended = true;

    // Show a custom modal dialog asking what to do
    return new Promise<boolean>((resolve) => {
      const filename = path.split(/[/\\]/).pop() ?? path;
      const existing = document.getElementById('unsaved-changes-dialog');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'unsaved-changes-dialog';
      overlay.className = 'unsaved-changes-overlay';
      overlay.innerHTML = `
        <div class="unsaved-changes-dialog">
          <div class="unsaved-changes-header">
            <span>Unsaved Changes</span>
          </div>
          <div class="unsaved-changes-body">
            <p>Do you want to save the changes you made to <strong>${filename}</strong>?</p>
            <p class="unsaved-changes-hint">Your changes will be lost if you don't save them.</p>
          </div>
          <div class="unsaved-changes-actions">
            <button class="btn btn-save" data-action="save">Save</button>
            <button class="btn btn-discard" data-action="discard">Don't Save</button>
            <button class="btn btn-cancel" data-action="cancel">Cancel</button>
          </div>
        </div>
      `;

      // FIX: reset autoSaveSuspended in cleanup so all dismiss paths unblock
      // auto-save and manual saves. Previously resetAutoSave() was defined
      // but never called, leaving autoSaveSuspended = true permanently and
      // causing saveFile() to silently no-op for the rest of the session.
      const cleanup = () => {
        overlay.remove();
        this.autoSaveSuspended = false;
      };

      overlay.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
        cleanup();
        await this.saveFile(path, false);
        resolve(true);
      });

      overlay.querySelector('[data-action="discard"]')?.addEventListener('click', () => {
        console.log('[DISCARD]', path);

        // Restore file to its last-saved content (undo auto-save)
        const saved = this.originalContent.get(path);
        if (saved !== undefined) {
          // Write back original content to disk
          void window.electronAPI.writeFile(path, saved).then(() => {
            console.log('[RESTORE FILE]', path);
          });
          // Restore editor model content so the tab shows original
          this.editor.updateFileContent(path, saved);
          // Update snapshot to match restored content
          void this.updateFileSnapshot(path);
        }

        this.dirtyFiles.delete(path);
        this.tabs.setDirty(path, false);
        this.originalContent.delete(path);

        cleanup();
        resolve(true);
      });

      overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      document.body.appendChild(overlay);
    });
  }

  private onTabContextMenu(path: string, x: number, y: number): void {
    const menuItems = this.renameService.getTabContextMenuItems(path, x, y);
    this.contextMenu.show(x, y, menuItems);
  }

  /** Called by TabManager when inline rename is confirmed with a new name */
  private async onTabRename(path: string, newName: string): Promise<void> {
    if (this.dirtyFiles.has(path)) {
      window.alert('Please save the file before renaming.');
      return;
    }
    const result = await this.renameService.handleTabRenameConfirmed(path, newName);
    if (result) {
      this.handleRenamedPath(result.oldPath, result.newPath, false);
    }
  }

  private handleRenamedPath(oldPath: string, newPath: string, isDirectory: boolean): void {
    const normalize = (path: string) => path.replace(/\//g, '\\');
    const oldNormalized = normalize(oldPath);
    const newNormalized = normalize(newPath);
    const isUnderOld = (path: string) =>
      path === oldPath ||
      path === oldNormalized ||
      path.startsWith(`${oldPath}\\`) ||
      path.startsWith(`${oldNormalized}\\`) ||
      path.startsWith(`${oldPath}/`) ||
      path.startsWith(`${oldNormalized}/`);
    const getRenamed = (path: string): string => {
      if (path === oldPath || path === oldNormalized) return newPath;
      if (path.startsWith(oldPath)) return newPath + path.slice(oldPath.length);
      if (path.startsWith(oldNormalized)) return newPath + path.slice(oldNormalized.length);
      return path;
    };

    const renameMap = <T>(map: Map<string, T>): void => {
      for (const key of [...map.keys()]) {
        if (isUnderOld(key)) {
          const value = map.get(key)!;
          map.delete(key);
          map.set(getRenamed(key), value);
        }
      }
    };

    const renameSet = (set: Set<string>): void => {
      for (const key of [...set]) {
        if (isUnderOld(key)) {
          set.delete(key);
          set.add(getRenamed(key));
        }
      }
    };

    const renameStringArray = (items: string[]): void => {
      for (const item of items) {
        if (isUnderOld(item)) {
          this.tabs.renameTab(item, getRenamed(item));
        }
      }
    };

    if (isDirectory) {
      renameStringArray(this.tabs.getTabs().map((tab) => tab.path));
      this.tabs.getTabs().forEach((tab) => {
        if (isUnderOld(tab.path)) {
          this.editor.renamePath(tab.path, getRenamed(tab.path));
        }
      });
      renameMap(this.fileSnapshots);
      renameMap(this.binaryMeta);
      renameSet(this.forceTextOpen);
      renameSet(this.dirtyFiles);
    } else {
      this.tabs.renameTab(oldPath, newPath);
      this.editor.renamePath(oldPath, newPath);
      if (this.fileSnapshots.has(oldPath)) {
        const snapshot = this.fileSnapshots.get(oldPath)!;
        this.fileSnapshots.delete(oldPath);
        this.fileSnapshots.set(newPath, snapshot);
      }
      if (this.binaryMeta.has(oldPath)) {
        const meta = this.binaryMeta.get(oldPath)!;
        this.binaryMeta.delete(oldPath);
        this.binaryMeta.set(newPath, meta);
      }
      if (this.forceTextOpen.has(oldPath)) {
        this.forceTextOpen.delete(oldPath);
        this.forceTextOpen.add(newPath);
      }
      if (this.dirtyFiles.has(oldPath)) {
        this.dirtyFiles.delete(oldPath);
        this.dirtyFiles.add(newPath);
      }
    }

    const active = this.tabs.getActivePath();
    if (active && (active === oldPath || isUnderOld(active))) {
      this.statusBar.setFile(getRenamed(active));
    }
  }

  private async openReleaseNotesAfterUpdate(): Promise<void> {
    try {
      const version = await this.releaseNotes.getCurrentVersion();
      const lastShownVersion = localStorage.getItem(RELEASE_NOTES_STORAGE_KEY);
      if (lastShownVersion && lastShownVersion !== version) {
        await this.openReleaseNotes(true);
        return;
      }
      if (!lastShownVersion) {
        localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, version);
      }
    } catch {
      /* Release notes are optional; startup should continue if version lookup fails. */
    }
  }

  /** Show the NexCode license in a terminal message. */
  private async showLicense(): Promise<void> {
    const licenseText = [
      '─'.repeat(60),
      'NexCode IDE — License',
      '─'.repeat(60),
      'MIT License',
      '',
      'Copyright (c) 2026 Hyggshi OS major project center',
      '',
      'Permission is hereby granted, free of charge, to any person',
      'obtaining a copy of this software and associated documentation',
      'files (the "Software"), to deal in the Software without',
      'restriction, including without limitation the rights to use,',
      'copy, modify, merge, publish, distribute, sublicense, and/or',
      'sell copies of the Software, and to permit persons to whom the',
      'Software is furnished to do so, subject to the following',
      'conditions:',
      '',
      'The above copyright notice and this permission notice shall be',
      'included in all copies or substantial portions of the Software.',
      '',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,',
      'EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES',
      'OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND',
      'NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT',
      'HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,',
      'WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING',
      'FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR',
      'OTHER DEALINGS IN THE SOFTWARE.',
      '─'.repeat(60),
    ].join('\n');

    // Show in a modal overlay
    const existing = document.getElementById('license-modal');
    if (existing) { existing.remove(); return; }
    const modal = document.createElement('div');
    modal.id = 'license-modal';
    modal.className = 'license-modal';
    modal.innerHTML = `
      <div class="license-modal-box">
        <div class="license-modal-header">
          <span>NexCode IDE — License</span>
          <button id="btn-license-close" class="icon-btn" title="Close">×</button>
        </div>
        <pre class="license-modal-body">${licenseText}</pre>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btn-license-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  private async switchToFile(path: string): Promise<void> {
    if (this.releaseNotes.isReleaseNotesPath(path)) {
      await this.openReleaseNotes();
      return;
    }

    if (path === WELCOME_TAB_PATH) {
      this.welcome.show();
      this.editor.hide();
      this.binaryView.hide();
      this.editorBanner.hide();
      this.mdPreview.hide();
      this.releaseNotes.hide();
      this.statusBar.setFile('Welcome');
      this.statusBar.setInternalPage('Welcome');
      this.updateRunButtonForActiveTab();
      return;
    }

    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) {
      this.showBinaryTab(path);
      this.statusBar.setFile(path);
      return;
    }

    let content = this.editor.getContent(path);
    if (!content) {
      if (this.forceTextOpen.has(path)) {
        content = await window.electronAPI.readFile(path);
      } else {
        const result = await window.electronAPI.readFileForEditor(path);
        if (result.isBinary) {
          this.binaryMeta.set(path, result);
          this.showBinaryTab(path);
          this.statusBar.setFile(path);
          return;
        }
        content = result.content ?? '';
      }
    }
    await this.showTextTab(path, content);
    await this.updateFileSnapshot(path);
  }

  private onEditorChange(path: string): void {
    this.dirtyFiles.add(path);
    this.tabs.setDirty(path, true);
    void this.refreshOutline();
  }

  private onAutoSave(path: string, _value: string): void {
    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) return;
    if (this.settings.autoSave && !this.autoSaveSuspended) void this.saveFile(path, false);
  }

  private async saveActiveFile(): Promise<void> {
    const path = this.tabs.getActivePath();
    if (!path || this.releaseNotes.isReleaseNotesPath(path) || path === WELCOME_TAB_PATH) return;
    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) return;
    await this.saveFile(path, true);
  }

  private async saveFile(path: string, showFeedback: boolean): Promise<void> {
    // Respect autoSave suspension — don't save if user has been asked about unsaved changes
    if (this.autoSaveSuspended) return;
    if (!this.dirtyFiles.has(path)) return;
    const content = this.editor.getContent(path);
    console.trace('[WRITE FILE - saveFile]', path);
    await window.electronAPI.writeFile(path, content);
    await this.updateFileSnapshot(path);
    // Update original content baseline ONLY on manual saves (showFeedback=true)
    // so "Don't Save" after auto-save restores to the pre-edit state.
    if (showFeedback) {
      this.originalContent.set(path, content);
    }
    this.dirtyFiles.delete(path);
    this.tabs.setDirty(path, false);
    if (showFeedback) {
      document.getElementById('status-file')!.textContent = `Saved ${path.split(/[/\\]/).pop()}`;
    }
    this.explorer.getTimeline().push(path, 'Saved');
    void this.explorer.refreshGitDecorations();
    this.pluginHost.emit('fileSaved', path);
    console.log('[SAVE FILE]', path);

    if (this.autoSaveSuspended) {
      console.log('[BLOCKED] autoSaveSuspended');
      return;
    }
  }

  private onTabClose(path: string): void {
    this.binaryMeta.delete(path);
    this.forceTextOpen.delete(path);
    this.fileSnapshots.delete(path);
    // FIX: clear stale dirty state so re-opening this file later does not
    // trigger a phantom "unsaved changes" dialog.
    this.dirtyFiles.delete(path);
    if (!this.tabs.hasTabs()) {
      this.editor.hide();
      this.binaryView.hide();
      this.editorBanner.hide();
      this.welcome.show();
    }
    this.updateViewState();
  }

  private startFileChangeWatcher(): void {
    if (this.fileWatchTimer !== null) return;
    this.fileWatchTimer = window.setInterval(() => {
      void this.pollOpenFileChanges();
    }, 1200);
  }

  private async pollOpenFileChanges(): Promise<void> {
    if (this.checkingFileChanges) return;
    this.checkingFileChanges = true;
    try {
      for (const tab of this.tabs.getTabs()) {
        await this.checkOpenFileChange(tab.path);
      }
    } finally {
      this.checkingFileChanges = false;
    }
  }

  private async checkOpenFileChange(path: string): Promise<void> {
    if (this.releaseNotes.isReleaseNotesPath(path)) return;
    // Don't reload files while the diff editor is actively reviewing AI changes
    if (this.diffEditorActive) return;
    const previous = this.fileSnapshots.get(path);
    if (!previous) {
      await this.updateFileSnapshot(path);
      return;
    }

    const stat = await this.safeStat(path);
    if (!stat || stat.isDirectory) return;
    if (stat.size === previous.size && stat.mtimeMs === previous.mtimeMs) return;

    if (this.dirtyFiles.has(path)) {
      document.getElementById('status-file')!.textContent = `${path.split(/[/\\]/).pop()} changed on disk`;
      this.fileSnapshots.set(path, { size: stat.size, mtimeMs: stat.mtimeMs });
      return;
    }

    await this.reloadOpenFileFromDisk(path, stat);
  }

  private async reloadOpenFileFromDisk(path: string, stat?: FileStatResult): Promise<void> {
    try {
      if (this.forceTextOpen.has(path)) {
        const content = await window.electronAPI.readFile(path);
        this.editor.updateFileContent(path, content);
        this.tabs.setDirty(path, false);
      } else {
        const result = await window.electronAPI.readFileForEditor(path);
        if (result.isBinary) {
          this.binaryMeta.set(path, result);
          if (this.tabs.getActivePath() === path) this.showBinaryTab(path);
        } else {
          this.binaryMeta.delete(path);
          this.editor.updateFileContent(path, result.content ?? '');
          this.tabs.setDirty(path, false);
          if (this.tabs.getActivePath() === path) {
            this.editor.show();
            this.binaryView.hide();
            void this.refreshOutline();
          }
        }
      }

      this.dirtyFiles.delete(path);
      const latest = stat ?? (await this.safeStat(path));
      if (latest && !latest.isDirectory) {
        this.fileSnapshots.set(path, { size: latest.size, mtimeMs: latest.mtimeMs });
      }
      document.getElementById('status-file')!.textContent = `Updated ${path.split(/[/\\]/).pop()} from disk`;
      this.explorer.getTimeline().push(path, 'Updated');
    } catch {
      // Monaco can throw "Canceled: Canceled" if updateFileContent conflicts
      // with an in-progress view state restore or suggestion widget operation.
      // This is non-fatal — the editor will pick up the file content on the
      // next poll cycle or when the user focuses the tab.
    }
  }

  private async updateFileSnapshot(path: string): Promise<void> {
    if (this.releaseNotes.isReleaseNotesPath(path)) return;
    const stat = await this.safeStat(path);
    if (!stat || stat.isDirectory) return;
    this.fileSnapshots.set(path, { size: stat.size, mtimeMs: stat.mtimeMs });
  }

  private async safeStat(path: string): Promise<FileStatResult | null> {
    try {
      return await window.electronAPI.stat(path);
    } catch {
      return null;
    }
  }

  private updateViewState(): void {
    if (this.tabs.hasTabs()) {
      const active = this.tabs.getActivePath();
      const isMarkdown = active ? /\.md$/i.test(active) : false;
      const previewBtn = document.getElementById('btn-md-preview') as HTMLButtonElement | null;
      if (previewBtn) previewBtn.style.display = isMarkdown ? '' : 'none';

      if (active === WELCOME_TAB_PATH) {
        this.welcome.show();
        this.editor.hide();
        this.binaryView.hide();
        this.editorBanner.hide();
        this.mdPreview.hide();
        this.releaseNotes.hide();
        this.statusBar.setFile('Welcome');
        this.statusBar.setInternalPage('Welcome');
        this.updateRunButtonForActiveTab();
      } else {
        this.welcome.hide();

        if (active && this.binaryMeta.has(active) && !this.forceTextOpen.has(active)) {
          this.showBinaryTab(active);
          this.mdPreview.hide();
        } else if (this.releaseNotes.isReleaseNotesPath(active)) {
          this.editor.hide();
          this.binaryView.hide();
          this.editorBanner.hide();
          this.mdPreview.hide();
          void this.releaseNotes.show();
        } else {
          this.releaseNotes.hide();
          this.binaryView.hide();
          this.editor.show();
          this.updateRunButtonForActiveTab();
          if (!isMarkdown) {
            this.mdPreview.hide();
          }
        }
      }
    } else {
      this.welcome.show();
      this.editor.hide();
      this.binaryView.hide();
      this.releaseNotes.hide();
      this.mdPreview.hide();
      const previewBtn = document.getElementById('btn-md-preview') as HTMLButtonElement | null;
      if (previewBtn) previewBtn.style.display = 'none';
      this.updateRunButtonForActiveTab();
    }
    requestAnimationFrame(() => {
      this.editor.layout();
      void this.refreshOutline();
    });
  }
}

void new NexusApp().init();