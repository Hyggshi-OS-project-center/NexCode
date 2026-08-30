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
  AppTheme,
  CodeValidationResult,
  ElectronAPI,
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
import { TabBrowser } from './modules/tabs/TabBrowser';
import { TerminalModule } from './modules/terminal/TerminalModule';
import { joinPath, basename } from './utils/pathUtils';
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
import { BrowserView } from './modules/editor/BrowserView';
import { SplashScreen } from './modules/ui/SplashScreen';
import { WorkspaceTrustManager } from './modules/trust/WorkspaceTrustManager';
import { NexCodeMoments } from './modules/ui/NexCodeMoments';
import { UpdateController } from './modules/update/UpdateController';
import { Debugger as NexDebugger } from './modules/debug/Debugger';
import {
  RELEASE_NOTES_STORAGE_KEY,
  RELEASE_NOTES_TAB_PATH,
  ReleaseNotesView,
} from './modules/releaseNotes/ReleaseNotesView';
import splashImageRandom1Url from '@icons/loading/my-splash-Random1.png?url';
import splashImageRandom2Url from '@icons/loading/my-splash-Random2.png?url';
import splashImageRandom3Url from '@icons/loading/my-splash-Random3.png?url';
import { captureDirectoryFiles, captureSingleFile, readDir as bReadDir, readFileContentAsync as bReadFile, exists as bExists, stat as bStat, writeFile as bWriteFile, mkdir as bMkdir, unlink as bUnlink, rename as bRename, reset as bReset, createFileBlobUrl as bCreateBlobUrl, BrowserFileEntry } from './browserFs';
import { downloadSingleFile, downloadFolderAsZip, exportWorkspaceAsZip, importZipArchive } from './utils/webZipExport';
import { SessionManager } from './modules/session/SessionManager';

const splashImageUrls = [splashImageRandom1Url, splashImageRandom2Url, splashImageRandom3Url] as const;

function getRandomSplashImageUrl(): string {
  return splashImageUrls[Math.floor(Math.random() * splashImageUrls.length)];
}

const browserElectronAPI: ElectronAPI = (() => {
  if ((window as any).electronAPI) return (window as any).electronAPI as ElectronAPI;

  const noop = () => undefined;
  const noopPromise = async () => undefined;
  const promiseUndefined = async () => undefined;
  const noOpUnsubscribe = () => undefined;

  const api = new Proxy(
    {},
    {
      get(_target, prop: string) {
        switch (prop) {
          case 'isDesktop':
            return false;
          case 'isWeb':
            return true;
          case 'onOpenPaths':
          case 'onShortcut':
          case 'onTerminalData':
          case 'onTerminalCwd':
          case 'onUpdateAvailable':
          case 'onUpdateProgress':
            return (_callback: any) => noOpUnsubscribe;
          case 'minimizeWindow':
          case 'maximizeWindow':
          case 'closeWindow':
          case 'showAboutWindow':
          case 'showEasterEggWindow':
          case 'closeEasterEggWindow':
          case 'openAgent':
            return noop;
          case 'toggleDevtools':
            return () => {
              // In browser mode, just use the browser's built-in DevTools (F12)
            };
          case 'getCrashAudio':
            return async () => null;
          case 'openExternal':
          case 'setUpdateChannel':
          case 'writeTerminal':
          case 'resizeTerminal':
          case 'killTerminal':
          case 'isMaximized':
            return promiseUndefined;
          case 'getHomePath':
          case 'getWorkspacePath':
          case 'createTerminal':
            return async () => null;
          case 'saveFile':
            return async () => null;
          case 'openFolder':
            return async () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.webkitdirectory = true;
              return new Promise<string | null>((resolve) => {
                input.onchange = () => {
                  if (input.files && input.files.length > 0) {
                    const rootPath = captureDirectoryFiles(input.files);
                    resolve(rootPath);
                  } else {
                    resolve(null);
                  }
                  input.remove();
                };
                input.oncancel = () => { resolve(null); input.remove(); };
                input.click();
              });
            };
          case 'openFile':
            return async () => {
              const input = document.createElement('input');
              input.type = 'file';
              return new Promise<string | null>((resolve) => {
                input.onchange = async () => {
                  if (input.files && input.files.length > 0) {
                    const file = input.files[0];
                    if (file.name.toLowerCase().endsWith('.zip')) {
                      const root = file.name.replace(/\.zip$/i, '');
                      await importZipArchive(file, root);
                      resolve(root);
                      input.remove();
                      return;
                    }
                    const path = captureSingleFile(file);
                    // Read file content immediately so it's available for readFile/readFileForEditor
                    const reader = new FileReader();
                    reader.onload = () => {
                      const entry = bStat(path);
                      if (entry && typeof reader.result === 'string') {
                        (entry as any).content = reader.result;
                      }
                      resolve(path);
                    };
                    reader.onerror = () => resolve(path);
                    reader.readAsText(file);
                  } else {
                    resolve(null);
                  }
                  input.remove();
                };
                input.oncancel = () => { resolve(null); input.remove(); };
                input.click();
              });
            };
          case 'openPdf':
            return async () => false;
          case 'readDir':
            return async (dirPath: string, options?: { showHidden?: boolean }) => {
              const entries = bReadDir(dirPath, options);
              return entries.map(e => ({
                name: e.name,
                path: e.path,
                isDirectory: e.isDirectory,
                size: e.size,
                mtimeMs: e.mtimeMs,
              }));
            };
          case 'exists':
            return async (path: string) => bExists(path);
          case 'stat':
            return async (path: string) => {
              const entry = bStat(path);
              if (!entry) return null;
              return {
                isDirectory: entry.isDirectory,
                size: entry.size,
                mtimeMs: entry.mtimeMs,
              };
            };
          case 'writeFile':
            return async (path: string, content: string) => {
              bWriteFile(path, content);
            };
          case 'unlink':
            return async (path: string) => {
              bUnlink(path);
            };
          case 'mkdir':
            return async (path: string) => {
              bMkdir(path);
            };
          case 'rename':
            return async (oldPath: string, newPath: string) => {
              bRename(oldPath, newPath);
            };
          case 'setWorkspacePath':
            return async (path: string) => {
              /* no-op in browser dev mode */
            };
          case 'getSettings':
            return async () => ({ ...DEFAULT_SETTINGS });
          case 'setSettings':
            return async (settings: Partial<AppSettings>) => ({ ...DEFAULT_SETTINGS, ...settings });
          case 'getAboutInfo':
            return async () => ({
              name: 'NexCode IDE',
              version: 'web',
              description: 'NexCode IDE web preview',
              author: { name: 'Hyggshi OS major project center', email: '' },
              license: 'MIT',
            } as any);
          case 'getLatestReleaseNotes':
            return async () => ({
              title: 'Web Preview',
              body: 'Running renderer-web preview',
              url: '',
            } as any);
          case 'getRecentFiles':
            return async () => [];
          case 'pushRecentFile':
          case 'removeRecentFile':
          case 'clearRecentFiles':
            return async () => [];
          case 'searchMarketplaceExtensions':
            return async () => [];
          case 'gitExec':
          case 'aiChat':
          case 'aiValidate':
          case 'readFileBinary':
            return promiseUndefined;
          case 'gitStatus':
            return async () => ({ branch: null, isRepo: false });
          case 'readFile':
            return async (path: string) => {
              try {
                return await bReadFile(path);
              } catch {
                return '';
              }
            };
          case 'readFileForEditor':
            return async (path: string) => {
              const entry = bStat(path);
              if (!entry) {
                return { isBinary: false, content: '' };
              }
              // Detect binary/media by extension
              const ext = path.split('.').pop()?.toLowerCase() ?? '';
              const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif'];
              const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'];
              const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'];
              const pdfExt = ['pdf'];

              if (imageExts.includes(ext) || videoExts.includes(ext) || audioExts.includes(ext) || pdfExt.includes(ext)) {
                const kind: MediaKind = imageExts.includes(ext) ? 'image' : videoExts.includes(ext) ? 'video' : audioExts.includes(ext) ? 'audio' : 'pdf';
                const mediaUrl = bCreateBlobUrl(path) ?? '';
                return { isBinary: true, content: '', size: entry.size, mediaKind: kind, mediaUrl, dataBase64: '' };
              }

              try {
                const content = await bReadFile(path);
                return { isBinary: false, content, size: entry.size, mediaKind: null };
              } catch {
                return { isBinary: true, content: '', size: entry.size, mediaKind: null, mediaUrl: '', dataBase64: '' };
              }
            };
          default:
            return promiseUndefined;
        }
      },
    },
  ) as ElectronAPI;

  (window as any).electronAPI = api;
  return api;
})();

if (!(window as any).electronAPI) {
  (window as any).electronAPI = browserElectronAPI;
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
  private vsixStore = new VsixExtensionStore((themeId) => {
    if (themeId && this.settings.theme !== themeId) {
      void this.applySettings({ theme: themeId as AppTheme });
    }
  });
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
  private sessionManager = new SessionManager();
  private hasCommandLineOpenPaths = false;

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
  private tabBrowser!: TabBrowser;
  private browserView!: BrowserView;
  private debuggerModule!: NexDebugger;
  private trustManager!: WorkspaceTrustManager;
  /** Set while the diff editor is reviewing AI changes — suppresses file watcher reloads */
  private diffEditorActive = false;
  /** Trimmed terminal output sample for moment detection — capped to reduce memory */
  private terminalOutputSample = '';
  private settingsApplyQueue: Promise<void> = Promise.resolve();

  private static readonly MAXIMIZE_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4.5C2 3.11929 3.11929 2 4.5 2H11.5C12.8807 2 14 3.11929 14 4.5V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V4.5ZM4.5 3C3.67157 3 3 3.67157 3 4.5V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V4.5C13 3.67157 12.3284 3 11.5 3H4.5Z" fill="currentColor"/></svg>`;
  private static readonly RESTORE_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.08496 4C5.29088 3.4174 5.8465 3 6.49961 3H9.99961C11.6565 3 12.9996 4.34315 12.9996 6V9.5C12.9996 10.1531 12.5822 10.7087 11.9996 10.9146V6C11.9996 4.89543 11.1042 4 9.99961 4H5.08496ZM4.5 5H9.5C10.3284 5 11 5.67157 11 6.5V11.5C11 12.3284 10.3284 13 9.5 13H4.5C3.67157 13 3 12.3284 3 11.5V6.5C3 5.67157 3.67157 5 4.5 5ZM4.5 6C4.22386 6 4 6.22386 4 6.5V11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5V6.5C10 6.22386 9.77614 6 9.5 6H4.5Z" fill="currentColor"/></svg>`;

  private async syncWindowControlState(): Promise<void> {
    const maximizeBtn = document.getElementById('btn-maximize');
    if (!maximizeBtn) return;
    try {
      const isMaximized = await window.electronAPI.isMaximized();
      maximizeBtn.innerHTML = isMaximized ? NexusApp.RESTORE_SVG : NexusApp.MAXIMIZE_SVG;
      maximizeBtn.setAttribute('title', isMaximized ? 'Restore' : 'Maximize');
    } catch {
      maximizeBtn.innerHTML = NexusApp.MAXIMIZE_SVG;
      maximizeBtn.setAttribute('title', 'Maximize');
    }
  }

  private getSidebarWidth(): number {
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    if (!shell) return 280;
    const raw = getComputedStyle(shell).getPropertyValue('--sidebar-width').trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 280;
  }

  private setSidebarWidth(width: number): void {
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    if (!shell) return;
    const clamped = Math.max(200, Math.min(width, 520));
    shell.style.setProperty('--sidebar-width', `${clamped}px`);
    requestAnimationFrame(() => this.editor.layout());
  }

  private syncSidebarResizer(): void {
    const shell = document.querySelector('.app-shell');
    const resizer = document.getElementById('sidebar-resizer');
    const collapsed = shell?.classList.contains('sidebar-collapsed') ?? false;
    resizer?.classList.toggle('hidden', collapsed);
  }

  private bindSidebarResizer(): void {
    const resizer = document.getElementById('sidebar-resizer');
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    if (!resizer || !shell) return;

    let dragging = false;
    let lastX = 0;

    const stopDragging = (): void => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', (e: MouseEvent) => {
      if (shell.classList.contains('sidebar-collapsed')) return;
      dragging = true;
      lastX = e.clientX;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      const nextWidth = this.getSidebarWidth() + (e.clientX - lastX);
      lastX = e.clientX;
      this.setSidebarWidth(nextWidth);
    });

    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
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

    // Pre-warm the recent-files cache so the File menu opens instantly.
    this.recentFilesCache = await this.refreshRecentFiles();
    this.recentFilesCacheAt = Date.now();

    splash.setStatus('Preparing editor…');
    EditorManager.registerSnippets();

    this.statusBar = new StatusBar();
    this.trustManager = new WorkspaceTrustManager('status-trust', (trusted) => {
      console.log(`[WorkspaceTrust] Trust status changed: ${trusted}`);
    });
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
    this.explorer.setExtensionHost(this.pluginHost);
    this.explorer.setOnInstallExtension(() => void this.installExtensionFromDialog());
    void this.vsixStore.loadGlobalExtensions(this.pluginHost).then(() => {
      this.explorer.updateConvenienceStore(this.vsixStore.getExtensions());
    });
    this.pluginHost.configure({
      getWorkspacePath: () => this.workspacePath,
      getSettings: () => this.settings,
      getActiveFilePath: () => this.tabs.getActivePath(),
      getActiveText: () => {
        const path = this.tabs.getActivePath();
        return path ? this.editor.getContent(path) : '';
      },
      getActiveLanguageId: () => this.editor.getActiveModel()?.getLanguageId() ?? 'plaintext',
      replaceActiveText: (text) => {
        const path = this.tabs.getActivePath();
        if (!path) return;
        if (this.editor.replaceActiveText(text)) {
          this.onEditorChange(path);
        }
      },
      insertIntoActiveEditor: (text) => this.editor.insertTextAtCursor(text),
      openTextDocument: async (path) => {
        const result = await window.electronAPI.readFileForEditor(path);
        return {
          uri: path,
          fileName: path,
          languageId: result.isBinary ? 'plaintext' : (this.editor.getActiveModel()?.getLanguageId() ?? 'plaintext'),
          getText: () => result.content ?? '',
        };
      },
      showMessage: (message, severity) => {
        const prefix = severity === 'error' ? 'Error' : severity === 'warning' ? 'Warning' : 'Info';
        document.getElementById('status-file')!.textContent = `${prefix}: ${message}`;
      },
      setStatus: (message) => {
        document.getElementById('status-file')!.textContent = message;
      },
      readFile: (path) => window.electronAPI.readFile(path),
      writeFile: (path, content) => window.electronAPI.writeFile(path, content),
    });
    this.tabs = new TabManager(
      'tab-bar',
      (path, x, y) => this.onTabContextMenu(path, x, y),
      (path, newName) => void this.onTabRename(path, newName),
      (path) => this.onBeforeTabClose(path),
    );
    this.tabBrowser = new TabBrowser();
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

    this.gitPanel = new GitPanel(
      'panel-git',
      (command) => {
        void this.terminal.show();
        void this.terminal.sendCommand(command, true);
      },
      async (filePath) => {
        try {
          const content = await window.electronAPI.readFile(filePath);
          await this.editor.openFile(filePath, content);
        } catch { /* ignore */ }
      },
      async (filePath, _staged) => {
        // Diff is rendered in the GitPanel's inline diff viewer; just open the file
        try {
          const content = await window.electronAPI.readFile(filePath);
          await this.editor.openFile(filePath, content);
        } catch { /* ignore */ }
      },
    );

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

    // Initialize BrowserView for HTML file preview
    this.browserView = new BrowserView('editor-container');

    // Initialize integrated debugger
    this.debuggerModule = new NexDebugger('panel-debug', this.editor, this.terminal);

    this.tabs.on('select', (path) => {
      void this.switchToFile(path);
      this.syncSessionState();
    });
    this.tabs.on('close', (path) => this.onTabClose(path));

    this.startFileChangeWatcher();
    this.bindCrashMoments();
    this.bindUI();
    this.bindTitlebarMenus();
    this.bindSidebarResizer();
    this.syncSidebarResizer();
    this.bindContextMenus();
    this.bindCommandPalette();
    this.bindTerminalPanelTabs();
    this.updates.init();
    void this.showSidebarPanel('explorer');
    this.updateViewState();

    // Hot Exit / Session Restore: Restore previous workspace, open tabs, and unsaved drafts
    if (!this.hasCommandLineOpenPaths) {
      await this.restoreSavedSession();
    }

    window.addEventListener('beforeunload', () => {
      this.syncSessionState();
      this.sessionManager.flush();
    });

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

    // Sync terminal prompt label with selected shell
    this.syncTerminalPromptLabel();

    document.getElementById('btn-open-folder')?.addEventListener('click', () => void this.openFolder());
    document.getElementById('btn-run')?.addEventListener('click', () => void this.runActiveFile());
    document.getElementById('btn-terminal-quick')?.addEventListener('click', () => this.terminal.toggle());
    document.getElementById('status-terminal')?.addEventListener('click', () => this.terminal.toggle());
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
        if (!panel) return;
        void this.showSidebarPanel(panel);
      });
    });

    document.getElementById('titlebar-btn-sidebar')?.addEventListener('click', () => {
      document.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed');
      this.syncSidebarResizer();
      requestAnimationFrame(() => this.editor.layout());
    });

    // Back/Forward navigation buttons — open Tab Browser to navigate tabs
    document.getElementById('titlebar-nav-back')?.addEventListener('click', () => {
      // Try to navigate back in history first
      const path = this.tabBrowser.navigateBack();
      if (path) {
        this.tabs.setActive(path);
      } else {
        // No history — open Tab Browser overlay to let user pick a tab
        this.tabBrowser.updateTabs(this.tabs.getTabs(), this.tabs.getActivePath());
        this.tabBrowser.show();
      }
    });
    document.getElementById('titlebar-nav-forward')?.addEventListener('click', () => {
      // Try to navigate forward in history first
      const path = this.tabBrowser.navigateForward();
      if (path) {
        this.tabs.setActive(path);
      } else {
        // No history — open Tab Browser overlay to let user pick a tab
        this.tabBrowser.updateTabs(this.tabs.getTabs(), this.tabs.getActivePath());
        this.tabBrowser.show();
      }
    });

    // F12 — toggle Developer Tools
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F12' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        window.electronAPI.toggleDevtools();
      }
    });

    // Ctrl+Tab — open Tab Browser overlay (quick tab switcher)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        // Update Tab Browser with current tab data before showing
        this.tabBrowser.updateTabs(this.tabs.getTabs(), this.tabs.getActivePath());
        this.tabBrowser.toggle();
      }
    });

    window.addEventListener('beforeunload', () => {
      if (this.fileWatchTimer !== null) window.clearInterval(this.fileWatchTimer);
      this.idleEasterEgg.dispose();
      this.updates.dispose();
      this.terminal.dispose();
    });
  }

  /** Pre-load crash audio so it plays instantly on error */
  private crashAudio: HTMLAudioElement | null = null;

  private async initCrashAudio(): Promise<void> {
    try {
      // Load the crash.ogg as a base64 data URL from the main process
      // The main process resolves the actual path (user override or built-in)
      const audioUrl = await window.electronAPI.getCrashAudio();
      if (!audioUrl) return;
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.volume = 0.7;
      audio.load();
      this.crashAudio = audio;
    } catch {
      // Best-effort
    }
  }

  private playCrashAudio(): void {
    if (!this.crashAudio) return;
    try {
      this.crashAudio.currentTime = 0;
      void this.crashAudio.play().catch(() => {});
    } catch {
      // Best-effort
    }
  }

  private bindCrashMoments(): void {
    this.initCrashAudio();

    window.addEventListener('error', (event) => {
      this.playCrashAudio();
      this.moments.showCrash();
      const target = event.error instanceof Error ? event.error : new Error(event.message || 'Renderer error');
      window.electronAPI.reportCrash({
        source: 'renderer.error',
        message: target.message,
        stack: target.stack,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      this.playCrashAudio();
      this.moments.showCrash();
      const reason = event.reason;
      const err =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === 'string'
                ? reason
                : typeof reason?.message === 'string'
                  ? reason.message
                  : 'Unhandled rejection',
            );
      window.electronAPI.reportCrash({
        source: 'renderer.unhandledrejection',
        message: err.message,
        stack: err.stack,
      });
    });
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
    const known = new Set(['explorer', 'search', 'git', 'chat', 'debug', 'settings']);
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
        return this.buildFileMenuItems();
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
            label: 'Toggle Developer Tools',
            shortcut: 'F12',
            action: () => window.electronAPI.toggleDevtools(),
          },
          { separator: true },
          {
            label: 'Report Issue',
            action: () => void this.openReportIssue(),
          },
          {
            label: 'View License',
            action: () => void this.showLicense(),
          },
          {
            label: 'About NexCode IDE',
            action: () => void this.showAbout(),
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
    this.syncSidebarResizer();

    const title = document.getElementById('sidebar-title')!;
    (['explorer', 'search', 'git', 'chat', 'debug', 'settings'] as const).forEach((id) => {
      document.getElementById(`panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });

    const openFolderBtn = document.getElementById('btn-open-folder');
    openFolderBtn?.classList.toggle('hidden', panel === 'git' || panel === 'debug');

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
    } else if (panel === 'debug') {
      title.textContent = 'RUN AND DEBUG';
      this.explorer.hide();
      this.debuggerModule.syncBreakpointsUI();
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
      saveAs: () => void this.saveActiveFileAs(),
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
      case 'saveAs':
        actions.saveAs();
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

    // For HTML/HTM files, open the BrowserView (embedded browser tab) instead of
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'html' || ext === 'htm') {
      // Hide other views
      this.editor.hide();
      this.binaryView.hide();
      this.releaseNotes.hide();
      this.mdPreview.hide();
      this.welcome.hide();
      // Show the browser view with the file URL
      this.browserView.show(path);
      this.statusBar.setFile(path);
      this.statusBar.setLanguage('HTML');
      document.getElementById('status-file')!.textContent = 'Browser preview';
      return;
    }

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
      if (!(e.target as HTMLElement).closest('.terminal-container, .xterm')) return;
      e.preventDefault();
      this.contextMenu.show(e.clientX, e.clientY, [
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => void this.terminal.paste() },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => void this.terminal.copySelection() },
        { label: 'Select All', shortcut: 'Ctrl+Shift+A', action: () => this.terminal.selectAll() },
        { label: 'Clear', shortcut: 'Ctrl+L', action: () => this.terminal.clear() },
        { separator: true },
        { label: 'New Terminal', action: () => void this.terminal.createTerminal() },
        { label: 'Kill Terminal', action: () => this.terminal.killActiveTerminal() },
      ]);
    });

  }

  private insertConfiguredFont(): void {
    const inserted = this.editor.insertFontFamily(this.settings.insertFontFamily);
    if (inserted) {
      document.getElementById('status-file')!.textContent = 'Inserted font';
    }
  }

  /** Update the terminal prompt label (PS> / $) based on the configured shell. */
  private syncTerminalPromptLabel(): void {
    const label = document.getElementById('terminal-prompt-label');
    if (!label) return;
    if (this.settings.terminalShell === 'powershell') {
      label.textContent = 'PS>';
    } else if (this.settings.terminalShell === 'cmd') {
      label.textContent = '>';
    } else {
      label.textContent = '$>';
    }
  }

  /**
   * Bind the terminal panel tab buttons (PROBLEMS / OUTPUT / TERMINAL / DEBUG CONSOLE).
   * Manages `.hidden` on view content divs and populates the Problems panel.
   */
  private bindTerminalPanelTabs(): void {
    const tabButtons = document.querySelectorAll<HTMLElement>('[data-terminal-view]');
    const views: Record<string, string> = {
      problems: 'problems-container',
      terminal: 'terminal-container',
      debug: 'debug-console',
    };

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Update active tab style
        tabButtons.forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });

        const view = btn.dataset.terminalView!;

        // Show/hide view content
        Object.entries(views).forEach(([key, id]) => {
          const el = document.getElementById(id);
          el?.classList.toggle('hidden', key !== view);
        });

        if (view === 'problems') {
          this.refreshProblemsPanel();
        }
      });
    });
  }

  /** Populate the PROBLEMS panel from Monaco's model markers. */
  private refreshProblemsPanel(): void {
    const container = document.getElementById('problems-container');
    if (!container) return;

    // Import monaco lazily via dynamic reference on window global set by monaco-setup
    const monaco = (window as any).monaco as typeof import('monaco-editor') | undefined;
    if (!monaco) {
      container.innerHTML = '<div class="problems-empty">Monaco not loaded.</div>';
      return;
    }

    const allMarkers = monaco.editor.getModelMarkers({});
    if (allMarkers.length === 0) {
      container.innerHTML = '<div class="problems-empty">No problems detected in the workspace.</div>';
      return;
    }

    // Group by resource
    const byFile = new Map<string, typeof allMarkers>();
    allMarkers.forEach((m) => {
      const uri = m.resource.toString();
      if (!byFile.has(uri)) byFile.set(uri, []);
      byFile.get(uri)!.push(m);
    });

    let html = '';
    byFile.forEach((markers, uri) => {
      const filename = uri.split('/').pop() ?? uri;
      html += `<div class="problems-file-label">${this.escapeHtml(filename)}</div>`;
      markers.forEach((m) => {
        const severity = m.severity === 8 ? 'error' : m.severity === 4 ? 'warning' : 'info';
        const icon = severity === 'error' ? '✖' : severity === 'warning' ? '⚠' : 'ℹ';
        html += `<div class="problem-row" data-uri="${uri}" data-line="${m.startLineNumber}">
          <span class="problem-icon ${severity}">${icon}</span>
          <span class="problem-message">${this.escapeHtml(m.message)}</span>
          <span class="problem-location">${m.startLineNumber}:${m.startColumn}</span>
        </div>`;
      });
    });

    container.innerHTML = html;

    // Click to jump to location
    container.querySelectorAll<HTMLElement>('.problem-row').forEach((row) => {
      row.addEventListener('click', () => {
        const line = Number(row.dataset.line ?? 1);
        this.editor.revealLine(line);
      });
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Command Palette — Ctrl+Shift+P
   * Searchable list of all IDE actions.
   */
  private bindCommandPalette(): void {
    const overlay = document.getElementById('command-palette')!;
    const input = document.getElementById('command-palette-input') as HTMLInputElement;
    const list = document.getElementById('command-palette-list')!;

    if (!overlay || !input || !list) return;

    const commands: { label: string; shortcut?: string; action: () => void }[] = [
      { label: 'Open File…',             shortcut: 'Ctrl+O',         action: () => void this.pickFile() },
      { label: 'Open Folder…',           shortcut: 'Ctrl+Shift+O',   action: () => void this.openFolder() },
      { label: 'New File',               shortcut: 'Ctrl+N',         action: () => void this.newUntitledFile() },
      { label: 'Save',                   shortcut: 'Ctrl+S',         action: () => void this.saveActiveFile() },
      { label: 'Save As…',              shortcut: 'Ctrl+Shift+S',   action: () => void this.saveActiveFileAs() },
      { label: 'Revert File',                                         action: () => void this.revertActiveFile() },
      { label: 'Close Tab',              shortcut: 'Ctrl+W',         action: () => { const p = this.tabs.getActivePath(); if (p) this.tabs.closeTab(p); } },
      { label: 'Run Active File',        shortcut: 'F5',             action: () => void this.runActiveFile() },
      { label: 'Toggle Terminal',        shortcut: 'Ctrl+`',         action: () => this.terminal.toggle() },
      { label: 'New Terminal',                                        action: () => void this.terminal.createTerminal() },
      { label: 'Find',                   shortcut: 'Ctrl+F',         action: () => this.search.show(false) },
      { label: 'Find and Replace',       shortcut: 'Ctrl+H',         action: () => this.search.show(true) },
      { label: 'Go to Line…',           shortcut: 'Ctrl+G',         action: () => void this.editor.runEditorAction('editor.action.gotoLine') },
      { label: 'Go to Symbol…',         shortcut: 'Ctrl+Shift+O',   action: () => void this.editor.runEditorAction('editor.action.quickOutline') },
      { label: 'Toggle Comment',         shortcut: 'Ctrl+/',         action: () => void this.editor.runEditorAction('editor.action.commentLine') },
      { label: 'Format Document',        shortcut: 'Shift+Alt+F',    action: () => void this.editor.runEditorAction('editor.action.formatDocument') },
      { label: 'Explorer',                                            action: () => void this.showSidebarPanel('explorer') },
      { label: 'Source Control',                                      action: () => void this.showSidebarPanel('git') },
      { label: 'Chat AI',                                             action: () => void this.showSidebarPanel('chat') },
      { label: 'Run and Debug',                                       action: () => void this.showSidebarPanel('debug') },
      { label: 'Settings',               shortcut: 'Ctrl+,',         action: () => void this.showSidebarPanel('settings') },
      { label: 'Toggle Sidebar',                                      action: () => { document.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed'); requestAnimationFrame(() => this.editor.layout()); } },
      { label: 'Toggle Markdown Preview',                             action: () => { const p = this.tabs.getActivePath(); if (p) { const c = this.editor.getContent(p) ?? ''; const f = p.split(/[\/\\]/).pop() ?? ''; this.mdPreview.toggle(c, f); } } },
      { label: 'Extension Marketplace',                               action: () => void this.openExtensionMarketplace() },
      { label: "What's New",                                          action: () => void this.openReleaseNotes() },
      { label: 'About NexCode IDE',                                   action: () => window.electronAPI.showAboutWindow() },
      { label: 'Toggle Developer Tools', shortcut: 'F12',            action: () => window.electronAPI.toggleDevtools() },
      { label: 'Zoom In',                                             action: () => void this.editor.runEditorAction('editor.action.fontZoomIn') },
      { label: 'Zoom Out',                                            action: () => void this.editor.runEditorAction('editor.action.fontZoomOut') },
      { label: 'Reset Zoom',                                          action: () => void this.editor.runEditorAction('editor.action.fontZoomReset') },
      { label: 'Select All',             shortcut: 'Ctrl+A',         action: () => void this.editor.runEditorAction('editor.action.selectAll') },
      { label: 'Start Debugging',        shortcut: 'F5',             action: () => this.debuggerModule.start() },
      { label: 'Stop Debugging',         shortcut: 'Shift+F5',       action: () => this.debuggerModule.stop() },
      { label: 'Step Over',              shortcut: 'F10',            action: () => this.debuggerModule.stepOver() },
    ];

    let activeIdx = -1;
    let filtered = commands;

    const close = () => {
      overlay.classList.add('hidden');
      input.value = '';
      activeIdx = -1;
    };

    const open = () => {
      overlay.classList.remove('hidden');
      input.value = '';
      activeIdx = -1;
      renderList(commands);
      requestAnimationFrame(() => input.focus());
    };

    const renderList = (items: typeof commands) => {
      filtered = items;
      activeIdx = items.length > 0 ? 0 : -1;
      list.innerHTML = items.length === 0
        ? '<div class="command-palette-no-results">No commands match</div>'
        : items.map((cmd, i) => `
          <div class="command-palette-item${i === 0 ? ' active' : ''}" data-index="${i}">
            <span class="command-palette-item-label">${this.escapeHtml(cmd.label)}</span>
            ${cmd.shortcut ? `<span class="command-palette-item-shortcut">${cmd.shortcut}</span>` : ''}
          </div>`).join('');

      list.querySelectorAll<HTMLElement>('.command-palette-item').forEach((el) => {
        el.addEventListener('mouseenter', () => {
          const idx = Number(el.dataset.index);
          setActive(idx);
        });
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.index);
          close();
          filtered[idx]?.action();
        });
      });
    };

    const setActive = (idx: number) => {
      const items = list.querySelectorAll<HTMLElement>('.command-palette-item');
      items.forEach((el, i) => el.classList.toggle('active', i === idx));
      activeIdx = idx;
      const active = items[idx];
      active?.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const matches = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
      renderList(matches);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); e.preventDefault(); return; }
      if (e.key === 'Enter') {
        if (activeIdx >= 0 && filtered[activeIdx]) {
          const action = filtered[activeIdx].action;
          close();
          action();
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') { setActive(Math.min(activeIdx + 1, filtered.length - 1)); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { setActive(Math.max(activeIdx - 1, 0)); e.preventDefault(); }
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Ctrl+Shift+P / Ctrl+P to open
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.contains('hidden') ? open() : close();
      }
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
        close();
        e.preventDefault();
      }
    });
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
      if (partial.terminalShell !== undefined) {
        this.syncTerminalPromptLabel();
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
    if (payload.folders.length > 0 || payload.files.length > 0) {
      this.hasCommandLineOpenPaths = true;
    }

    for (const folder of payload.folders) {
      try {
        await this.setWorkspaceFolder(folder, true);
      } catch (err) {
        console.error('[handleOpenPaths] Failed to open folder:', folder, err);
      }
    }

    for (const filePath of payload.files) {
      try {
        if (!this.workspacePath) {
          await this.setWorkspaceFolder(parentDir(filePath), false);
        }
        await this.openFile(filePath);
      } catch (err) {
        console.error('[handleOpenPaths] Failed to open file:', filePath, err);
      }
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

  private syncSessionState(): void {
    const openTabs = this.tabs.getTabs().map((t) => ({
      path: t.path,
      name: t.name,
      isDirty: this.dirtyFiles.has(t.path),
    }));
    this.sessionManager.updateSession({
      workspacePath: this.workspacePath,
      openTabs,
      activeTab: this.tabs.getActivePath(),
    });
  }

  private async restoreSavedSession(): Promise<void> {
    const session = this.sessionManager.getState();
    if (!session) return;

    // 1. Restore previous workspace folder
    if (session.workspacePath) {
      try {
        const exists = await window.electronAPI.exists(session.workspacePath);
        if (exists) {
          await this.setWorkspaceFolder(session.workspacePath, false);
        }
      } catch {
        /* ignore */
      }
    }

    // 2. Restore previous open tabs & unsaved drafts (Hot Exit)
    if (session.openTabs && session.openTabs.length > 0) {
      for (const tabInfo of session.openTabs) {
        if (this.releaseNotes.isReleaseNotesPath(tabInfo.path) || tabInfo.path === WELCOME_TAB_PATH) {
          continue;
        }
        const draft = this.sessionManager.getDraft(tabInfo.path);
        if (draft) {
          // File had unsaved changes when app closed (Hot Exit)
          try {
            let baseDiskContent = '';
            if (!draft.isUntitled) {
              try {
                baseDiskContent = await window.electronAPI.readFile(tabInfo.path);
              } catch {
                baseDiskContent = draft.originalContent ?? '';
              }
            }
            this.originalContent.set(tabInfo.path, draft.originalContent ?? baseDiskContent);
            this.tabs.openTab(tabInfo.path);
            await this.showTextTab(tabInfo.path, draft.content);
            this.dirtyFiles.add(tabInfo.path);
            this.tabs.setDirty(tabInfo.path, true);
            await this.updateFileSnapshot(tabInfo.path);
          } catch (err) {
            console.warn('[SessionManager] Failed to restore draft for', tabInfo.path, err);
          }
        } else {
          // Saved / Clean tab
          try {
            const exists = await window.electronAPI.exists(tabInfo.path);
            if (exists) {
              await this.openFile(tabInfo.path);
            }
          } catch {
            /* ignore missing files */
          }
        }
      }

      // 3. Restore active tab focus
      if (session.activeTab && this.tabs.getTabs().some((t) => t.path === session.activeTab)) {
        await this.switchToFile(session.activeTab);
      } else if (this.tabs.getTabs().length > 0) {
        await this.switchToFile(this.tabs.getTabs()[0].path);
      }
    }
  }

  private async setWorkspaceFolder(folder: string, updateTerminalShell: boolean): Promise<void> {
    this.workspacePath = folder;
    this.syncSessionState();
    try {
      await window.electronAPI.setWorkspacePath(folder);
    } catch {
      /* Older running main processes may not have this handler until restart. */
    }
    this.terminal.setCwd(folder);
    this.statusBar.setTerminalCwd(folder);
    document.getElementById('titlebar-path')!.textContent = folder;
    this.trustManager.updateWorkspace(folder);
    void this.trustManager.checkTrustOnOpen(folder);
    await this.explorer.loadFolder(folder);
    if (updateTerminalShell) await this.terminal.changeDirectory(folder, false);
    // Extensions are global (per-user), like VSCode — not re-scanned per
    // workspace. We still opportunistically pick up legacy
    // `.nexcode/extensions` folders inside the opened workspace, additively.
    await this.vsixStore.scanWorkspace(folder, this.pluginHost);
    this.explorer.updateConvenienceStore(this.vsixStore.getExtensions());
    this.explorer.getTimeline().clear();
    this.pluginHost.emit('folderOpened', folder);
    this.gitPanel.setWorkspace(folder);
    void this.refreshGitBranch();
    this.updateViewState();
  }

  private async installExtensionFromDialog(): Promise<void> {
    const sourcePath = await window.electronAPI.openExtensionFile();
    if (!sourcePath) return;
    try {
      await this.vsixStore.installExtension(sourcePath);
      this.explorer.updateConvenienceStore(this.vsixStore.getExtensions());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to install extension:\n\n${message}`);
    }
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
    const base = this.workspacePath ?? await window.electronAPI.getHomePath();
    let i = 1;
    let path = joinPath(base, `untitled-${i}.txt`);
    while (await window.electronAPI.exists(path)) {
      i++;
      path = joinPath(base, `untitled-${i}.txt`);
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

    // Track the file in the recent-files list (MRU). The list is consulted by
    // the File menu's "Open Recent" section and persists across sessions.
    void this.pushRecent(path);

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
    // Persist tab list to session so it can be restored on next launch
    this.syncSessionState();
    // Send updated editor context to main so AI has current file/cursor
    this.pushEditorContext();
  }

  /** Push current editor context (file, cursor, selection) to main process for AI. */
  private pushEditorContext(): void {
    if (!window.electronAPI.setEditorContext) return;
    try {
      const ctx = this.editor.getAiContext();
      window.electronAPI.setEditorContext(ctx);
    } catch {
      // Non-fatal — editor may not be initialised yet
    }
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
      dataBase64: meta.dataBase64,
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
    if (mediaKind === 'pdf') return 'PDF';
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
    this.browserView.hide();
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
            <p>Do you want to save the changes you made to <strong>${this.escapeHtml(filename)}</strong>?</p>
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
    const normalize = (p: string) => p.replace(/\\/g, '/');
    const oldNormalized = normalize(oldPath);
    const newNormalized = normalize(newPath);
    const isUnderOld = (path: string) =>
      path === oldPath ||
      path === oldNormalized ||
      path.startsWith(`${oldPath}/`) ||
      path.startsWith(`${oldNormalized}/`) ||
      path.startsWith(`${oldPath}\\`) ||
      path.startsWith(`${oldNormalized}\\`);
    const getRenamed = (path: string): string => {
      if (path === oldPath || path === oldNormalized) return newPath;
      if (path.startsWith(oldPath) || path.startsWith(oldNormalized)) return newPath + path.slice(oldPath.length);
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
      if (!lastShownVersion || lastShownVersion !== version) {
        await this.openReleaseNotes(true);
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
        <pre class="license-modal-body">${this.escapeHtml(licenseText)}</pre>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btn-license-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  private async openReportIssue(): Promise<void> {
    try {
      await window.electronAPI.openExternal('https://github.com/Hyggshi-OS-project-center/NexCode/issues/new');
    } catch {
      window.alert('Please report issues at: https://github.com/Hyggshi-OS-project-center/NexCode/issues/new');
    }
  }

  /** Show About dialog — opens native BrowserWindow on desktop, or sleek modal on web. */
  private async showAbout(): Promise<void> {
    const isDesktop = Boolean((window.electronAPI as any)?.isDesktop && !(window.electronAPI as any)?.isWeb);
    if (isDesktop && typeof window.electronAPI?.showAboutWindow === 'function') {
      try {
        window.electronAPI.showAboutWindow();
        return;
      } catch {
        /* fallback to in-app modal */
      }
    }

    // Web / In-app About Modal
    const existing = document.getElementById('about-modal');
    if (existing) {
      existing.remove();
      return;
    }

    const version = '3.5.7-Insider.10';
    const edition = isDesktop ? 'Desktop' : 'Web Edition';
    const userAgent = navigator.userAgent;
    const metaText = [
      '© 2026 Hyggshi OS major project center',
      `Platform: ${edition}`,
      `Browser: ${navigator.appName || 'Web'}`,
      `User Agent: ${userAgent}`,
      'Hyggshi OS Engine 2.4.0',
    ].join('\n');

    const modal = document.createElement('div');
    modal.id = 'about-modal';
    modal.className = 'about-modal';
    modal.innerHTML = `
      <div class="about-modal-box">
        <div class="about-modal-logo" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="56" height="56"><path fill="currentColor" d="M24 4l18 10.5v19L24 44 6 33.5v-19L24 4z"/></svg>
        </div>
        <h2 class="about-modal-title">NexCode IDE</h2>
        <p class="about-modal-tagline">A world-class code editor at its core, enhanced with integrated tools and AI-ready workflows.</p>
        <p class="about-modal-version">Version <code>${version} (${edition})</code></p>
        <pre class="about-modal-meta">${this.escapeHtml(metaText)}</pre>
        <div class="about-modal-actions">
          <button type="button" class="about-modal-btn" id="btn-about-copy">Copy</button>
          <button type="button" class="about-modal-btn primary" id="btn-about-ok">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('btn-about-ok')?.addEventListener('click', closeModal);
    document.getElementById('btn-about-copy')?.addEventListener('click', () => {
      const fullInfo = `NexCode IDE\nVersion: ${version} (${edition})\n${metaText}`;
      void navigator.clipboard.writeText(fullInfo).then(() => {
        const btn = document.getElementById('btn-about-copy');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => {
            if (btn) btn.textContent = 'Copy';
          }, 1500);
        }
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKeyDown);
      }
    };
    window.addEventListener('keydown', onKeyDown);
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
      this.browserView.hide();
      this.statusBar.setFile('Welcome');
      this.statusBar.setInternalPage('Welcome');
      this.updateRunButtonForActiveTab();
      return;
    }

    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) {
      this.showBinaryTab(path);
      this.statusBar.setFile(path);
      this.browserView.hide();
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
    const content = this.editor.getContent(path);
    const original = this.originalContent.get(path);
    const tab = this.tabs.getTabs().find((t) => t.path === path);
    const name = tab?.name || path.split(/[/\\]/).pop() || 'untitled';
    const isUntitled = /untitled-\d+\.txt$/i.test(name);
    this.sessionManager.saveDraft(path, name, content, original, isUntitled);
    this.syncSessionState();
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

  /**
   * Save the active file under a new path (Save As… / Ctrl+Shift+S).
   * - Always prompts for a destination via the native save dialog.
   * - Writes content to the chosen path, then re-binds the active tab/model
   *   to the new path (the old path's tab and dirty state is dropped).
   * - If the old tab was newUntitled, the empty stub on disk is cleaned up.
   */
  private async saveActiveFileAs(): Promise<void> {
    const oldPath = this.tabs.getActivePath();
    if (!oldPath || this.releaseNotes.isReleaseNotesPath(oldPath) || oldPath === WELCOME_TAB_PATH) return;
    if (this.binaryMeta.has(oldPath) && !this.forceTextOpen.has(oldPath)) return;

    // Suggest a sensible default file name based on the current path.
    const defaultName = oldPath.split(/[/\\]/).pop() ?? 'untitled.txt';
    const newPath = await window.electronAPI.saveFile(defaultName);
    if (!newPath || newPath === oldPath) return;

    const content = this.editor.getContent(oldPath);
    console.trace('[WRITE FILE - saveActiveFileAs]', newPath);
    await window.electronAPI.writeFile(newPath, content);
    await window.electronAPI.pushRecentFile(newPath);

    // Rebind the existing Monaco model to the new path (preserves undo history
    // and the user's cursor position) by closing the old tab and re-opening at
    // the new path with the just-written content. This is simpler and more
    // robust than mutating model URIs in place.
    const wasActiveTab = this.tabs.getActivePath() === oldPath;
    this.tabs.closeTab(oldPath);
    this.dirtyFiles.delete(oldPath);
    this.originalContent.delete(oldPath);
    this.fileSnapshots.delete(oldPath);
    this.sessionManager.removeDraft(oldPath);
    this.sessionManager.removeDraft(newPath);
    this.syncSessionState();

    await this.openFile(newPath);
    if (wasActiveTab) this.tabs.setActive(newPath);

    // Clean up the stub file left behind by newUntitledFile when the user
    // immediately chooses "Save As" on a brand-new tab.
    if (oldPath !== newPath && /untitled-\d+\.txt$/.test(basename(oldPath))) {
      try { await window.electronAPI.unlink(oldPath); } catch { /* ignore */ }
    }

    this.dirtyFiles.delete(newPath);
    this.tabs.setDirty(newPath, false);
    this.originalContent.set(newPath, content);
    await this.updateFileSnapshot(newPath);

    document.getElementById('status-file')!.textContent = `Saved ${newPath.split(/[/\\]/).pop()}`;
    this.explorer.getTimeline().push(newPath, 'Saved');
    void this.explorer.refreshGitDecorations();
    if (this.workspacePath) void this.explorer.refresh();
    this.pluginHost.emit('fileSaved', newPath);
  }

  /** Load recent-files list from main process (newest first). */
  private async refreshRecentFiles(): Promise<string[]> {
    try { return await window.electronAPI.getRecentFiles(); } catch { return []; }
  }

  /**
   * Push a path to the recent-files list and update the in-memory cache.
   * Skips the special welcome / release-notes / untitled-stub paths so the
   * menu doesn't fill up with junk entries.
   */
  private async pushRecent(path: string): Promise<void> {
    if (!path) return;
    if (this.releaseNotes.isReleaseNotesPath(path) || path === WELCOME_TAB_PATH) return;
    if (/untitled-\d+\.txt$/.test(basename(path))) return;
    try {
      this.recentFilesCache = await window.electronAPI.pushRecentFile(path);
      this.recentFilesCacheAt = Date.now();
    } catch {
      /* non-fatal */
    }
  }

  /** Cache the most recent recent-files snapshot so the menu doesn't refetch every open. */
  private recentFilesCache: string[] = [];
  private recentFilesCacheAt = 0;

  /** Recent files (max 10) with a fallback cache so the File menu can open instantly. */
  private async getRecentFilesCached(force = false): Promise<string[]> {
    const stale = Date.now() - this.recentFilesCacheAt > 5_000;
    if (force || stale || this.recentFilesCacheAt === 0) {
      this.recentFilesCache = await this.refreshRecentFiles();
      this.recentFilesCacheAt = Date.now();
    }
    return this.recentFilesCache;
  }

  /**
   * Build the File menu items. Mirrors VS Code's menu layout so the three
   * high-frequency features — Save / Save As / Auto Save / Open Recent —
   * sit exactly where users expect them.
   */
  private buildFileMenuItems(): MenuItem[] {
    const recent = this.recentFilesCache;
    const recentSubmenu: MenuItem[] = recent.length === 0
      ? [{ label: '(No recent files)', disabled: true }]
      : [
          ...recent.map((filePath) => ({
            label: this.shortenRecentLabel(filePath),
            action: () => void this.openRecentFile(filePath),
          })),
          { separator: true },
          { label: 'Clear Recent', action: () => void this.clearRecentFiles() },
        ];

    const items: MenuItem[] = [
      { label: 'New Text File', shortcut: 'Ctrl+N', action: () => void this.newUntitledFile() },
      { label: 'New File…', action: () => void this.newUntitledFile() },
      { separator: true },
      { label: 'Open File…', shortcut: 'Ctrl+O', action: () => void this.pickFile() },
      { label: 'Open Folder…', shortcut: 'Ctrl+Shift+O', action: () => void this.openFolder() },
      { label: 'Open Recent', submenu: recentSubmenu },
      { separator: true },
      { label: 'Save', shortcut: 'Ctrl+S', action: () => void this.saveActiveFile() },
      { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => void this.saveActiveFileAs() },
      {
        label: 'Auto Save',
        checked: this.settings.autoSave,
        action: () => void this.toggleAutoSave(),
      },
    ];

    const isWeb = Boolean((window.electronAPI as any)?.isWeb);
    if (isWeb) {
      items.push(
        { separator: true },
        {
          label: 'Download Active File',
          action: () => {
            const active = this.tabs.getActivePath();
            if (active) void downloadSingleFile(active);
          },
        },
        {
          label: 'Export Workspace as ZIP (.zip)',
          action: () => void exportWorkspaceAsZip(this.workspacePath),
        },
        {
          label: 'Import Workspace from ZIP…',
          action: () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip,application/zip';
            input.onchange = async () => {
              if (input.files && input.files[0]) {
                await importZipArchive(input.files[0], this.workspacePath || '/');
                await this.explorer.refresh();
              }
              input.remove();
            };
            input.click();
          },
        },
      );
    }

    items.push(
      { separator: true },
      { label: 'Revert File', action: () => void this.revertActiveFile() },
    );

    return items;
  }

  /** Flip the Auto Save setting and refresh any open File menu. */
  private async toggleAutoSave(): Promise<void> {
    await this.applySettings({ autoSave: !this.settings.autoSave });
    this.contextMenu.refresh();
  }

  /** Restore the on-disk content of the active file and clear dirty state. */
  private async revertActiveFile(): Promise<void> {
    const path = this.tabs.getActivePath();
    if (!path) return;
    if (this.releaseNotes.isReleaseNotesPath(path) || path === WELCOME_TAB_PATH) return;
    if (this.binaryMeta.has(path) && !this.forceTextOpen.has(path)) return;
    try {
      const content = await window.electronAPI.readFile(path);
      this.editor.updateFileContent(path, content);
      this.dirtyFiles.delete(path);
      this.tabs.setDirty(path, false);
      this.originalContent.set(path, content);
      await this.updateFileSnapshot(path);
      document.getElementById('status-file')!.textContent = `Reverted ${path.split(/[/\\]/).pop()}`;
    } catch (err) {
      console.warn('[REVERT] failed', err);
    }
  }

  /** Format a recent-files entry: "filename.ext  —  /path/to/dir" */
  private shortenRecentLabel(filePath: string): string {
    const filename = filePath.split(/[/\\]/).pop() ?? filePath;
    const dir = filePath.substring(0, filePath.length - filename.length).replace(/[/\\]+$/, '');
    const shortDir = dir.length > 40 ? `…${dir.slice(-37)}` : dir;
    return shortDir ? `${filename}  \u2014  ${shortDir}` : filename;
  }

  private async openRecentFile(filePath: string): Promise<void> {
    // Best-effort existence check so we can remove stale entries from the list.
    const exists = await window.electronAPI.exists(filePath);
    if (!exists) {
      const updated = await window.electronAPI.removeRecentFile(filePath);
      this.recentFilesCache = updated;
      this.recentFilesCacheAt = Date.now();
      document.getElementById('status-file')!.textContent = `Removed missing file: ${filePath.split(/[/\\]/).pop()}`;
      return;
    }
    await this.openFile(filePath);
    this.recentFilesCache = await this.refreshRecentFiles();
    this.recentFilesCacheAt = Date.now();
  }

  private async clearRecentFiles(): Promise<void> {
    this.recentFilesCache = await window.electronAPI.clearRecentFiles();
    this.recentFilesCacheAt = Date.now();
  }

  private async saveFile(path: string, showFeedback: boolean): Promise<void> {
    // Respect autoSave suspension — don't save if user has been asked about unsaved changes
    if (this.autoSaveSuspended) return;
    if (!this.dirtyFiles.has(path)) return;
    const content = this.editor.getContent(path);
    console.trace('[WRITE FILE - saveFile]', path);
    await window.electronAPI.writeFile(path, content);
    // Bump MRU so the file moves to the top of Open Recent after a manual save
    // (auto-saves still count — if you're editing it, it's recent).
    void this.pushRecent(path);
    await this.updateFileSnapshot(path);
    // Update original content baseline ONLY on manual saves (showFeedback=true)
    // so "Don't Save" after auto-save restores to the pre-edit state.
    if (showFeedback) {
      this.originalContent.set(path, content);
    }
    this.dirtyFiles.delete(path);
    this.tabs.setDirty(path, false);
    this.sessionManager.removeDraft(path);
    this.syncSessionState();
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
    this.dirtyFiles.delete(path);
    this.sessionManager.removeDraft(path);
    this.syncSessionState();
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

  /**
   * Update the back/forward navigation buttons based on history state.
   */
  private updateNavButtons(): void {
    const backBtn = document.getElementById('titlebar-nav-back') as HTMLButtonElement | null;
    const forwardBtn = document.getElementById('titlebar-nav-forward') as HTMLButtonElement | null;
    if (backBtn) {
      backBtn.classList.toggle('disabled', !this.tabBrowser.canGoBack);
      backBtn.title = this.tabBrowser.canGoBack ? 'Back' : 'No history';
    }
    if (forwardBtn) {
      forwardBtn.classList.toggle('disabled', !this.tabBrowser.canGoForward);
      forwardBtn.title = this.tabBrowser.canGoForward ? 'Forward' : 'No history';
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
        this.browserView.hide();
        this.statusBar.setFile('Welcome');
        this.statusBar.setInternalPage('Welcome');
        this.updateRunButtonForActiveTab();
      } else {
        this.welcome.hide();

        if (active && this.binaryMeta.has(active) && !this.forceTextOpen.has(active)) {
          this.showBinaryTab(active);
          this.mdPreview.hide();
          this.browserView.hide();
        } else if (this.releaseNotes.isReleaseNotesPath(active)) {
          this.editor.hide();
          this.binaryView.hide();
          this.editorBanner.hide();
          this.mdPreview.hide();
          this.browserView.hide();
          void this.releaseNotes.show();
        } else {
          this.releaseNotes.hide();
          this.binaryView.hide();
          this.browserView.hide();
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
      this.browserView.hide();
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

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : typeof reason?.message === 'string'
          ? reason.message
          : '';

  // Monaco and related disposables can reject with known internal errors during
  // normal editor churn (tab switches, splits, IntelliSense cancellation).
  // These are expected and must not surface as fatal crashes.
  if (
    message === 'Canceled' ||
    message === 'Canceled: Canceled' ||
    message.includes('InstantiationService has been disposed') ||
    message.includes('Object is disposed') ||
    message.includes('editor has been disposed')
  ) {
    event.preventDefault();
  }
});

// Suppress synchronous Monaco-internal errors thrown when a context menu or
// hover widget fires on an editor that was just torn down (e.g. split view closed).
window.addEventListener('error', (event) => {
  const msg = event.message ?? '';
  if (
    msg.includes('InstantiationService has been disposed') ||
    msg.includes('Object is disposed') ||
    msg.includes('editor has been disposed')
  ) {
    event.preventDefault();
  }
});

