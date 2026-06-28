/**
 * Electron main process — window lifecycle, IPC routing, and native integrations.
 * Optimized for reduced RAM usage (< 300 MB).
 */
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { registerIpcHandlers, shutdownTerminals } from './ipc/handlers';
import {
  parseOpenPathsFromArgv,
  queueOpenPaths,
  sendPendingOpenPaths,
  setupOpenFileHandlers,
} from './openFiles';
import { shortcutFromInput } from '../shared/shortcuts';
import { UpdateService } from './update/UpdateService';

// Disable sandbox for AppImage compatibility (SUID sandbox helper cannot be configured in FUSE mounts)
app.commandLine.appendSwitch('no-sandbox');
const APP_NAME = 'NexCode IDE';
const CRASH_ISSUES_URL = 'https://github.com/Hyggshi-OS-project-center/NexCode/issues';
/** Try loading crash.ogg from .nexcode/extensions first, then fall back to built-in */
function resolveCrashOggPath(): string {
  // Priority 1: in .nexcode/extensions (user can override the crash sound)
  const userDir = app.isPackaged
    ? path.join(process.resourcesPath, '.nexcode', 'extensions')
    : path.join(__dirname, '../../.nexcode/extensions');
  const userPath = path.join(userDir, 'crash.ogg');
  if (fs.existsSync(userPath)) return userPath;

  // Priority 2: .nexcode/extensions/ inside workspace (if available)
  const wsPath = path.join(process.cwd(), '.nexcode', 'extensions', 'crash.ogg');
  if (fs.existsSync(wsPath)) return wsPath;

  // Priority 3: built-in Easter egg
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'src', 'icons', 'Easter_Egg', 'crash.ogg');
  }
  return path.join(__dirname, '../../src/icons/Easter_Egg/crash.ogg');
}
const CRASH_OGG_PATH = resolveCrashOggPath();
function getCrashLogPath(): string {
  try {
    return path.join(app.getPath('userData'), 'crash.log');
  } catch {
    return path.join(process.cwd(), 'crash.log');
  }
}
/** Buffer crash log lines until app.whenReady() resolves */
const crashLogBuffer: string[] = [];
function appendCrashLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  crashLogBuffer.push(line);
  // Flush to file asynchronously
  try {
    const logPath = getCrashLogPath();
    fs.appendFileSync(logPath, line + '\n');
  } catch {
    // Best-effort
  }
}

app.commandLine.appendSwitch('max_old_space_size', '512');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --optimize-for-size');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('enable-features', 'Vulkan');
app.commandLine.appendSwitch('log-level', '0');

process.title = APP_NAME;
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nexcode.ide');
}

interface NativeViteDevServer {
  resolvedUrls: { local: string[] };
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

let mainWindow: BrowserWindow | null = null;
let agentWindow: BrowserWindow | null = null;
let crashMessageShown = false;
let updateService: UpdateService | null = null;
let viteDevServer: Promise<NativeViteDevServer> | null = null;

const isDev = !app.isPackaged;

function showCrashMessage(error: unknown): void {
  if (crashMessageShown) return;
  crashMessageShown = true;
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  dialog.showErrorBox('NexCode crashed', `(???)\nI don't know what the error is either...\n\n${detail}`);
  void shell.openExternal(CRASH_ISSUES_URL);
  void playCrashAudio();
  mainWindow?.webContents.openDevTools({ mode: 'detach' });
}

let appReady = false;
app.whenReady().then(() => { appReady = true; });

async function playCrashAudio(): Promise<void> {
  // Can only create BrowserWindows after app is ready
  if (!appReady) return;
  try {
    if (!fs.existsSync(CRASH_OGG_PATH)) return;

    const player = new BrowserWindow({
      show: false,
      frame: false,
      width: 1,
      height: 1,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    const fileUrl = `file://${CRASH_OGG_PATH.replace(/\\/g, '/')}`;
    const html = `<!doctype html><html><body><audio id="a" autoplay><source src="${fileUrl}" type="audio/ogg"></audio><script>
      const a = document.getElementById('a');
      if (a) {
        a.play().catch(() => {});
        a.addEventListener('ended', () => window.close(), { once: true });
        setTimeout(() => window.close(), 10000);
      }
    </script></body></html>`;

    await player.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch {
    // Best-effort only.
  }
}
process.on('uncaughtException', showCrashMessage);
process.on('unhandledRejection', showCrashMessage);

ipcMain.on('app:reportCrash', (_event, detail: { message: string; stack?: string; source?: string }) => {
  const message = detail?.message || 'Renderer crash';
  const stack = detail?.stack ? `\n\n${detail.stack}` : '';
  showCrashMessage(new Error(`${detail?.source ? `[${detail.source}] ` : ''}${message}${stack}`));
});

/** Returns true when running as an Insider / Development build. */
function isInsiderBuild(): boolean {
  if (isDev) return true;
  return app.getVersion().toLowerCase().includes('insider');
}

function resolveAppIconPath(): string | undefined {
  const insider = isInsiderBuild();

  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, insider ? 'insider-icon.ico' : 'icon.ico'),
        path.join(path.dirname(process.execPath), 'resources', insider ? 'insider-icon.ico' : 'icon.ico'),
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
      ]
    : [
        path.join(__dirname, '../../src/renderer/public/insider-icon.ico'),
        path.join(__dirname, '../../build/icon.ico'),
        path.join(__dirname, '../../build/icon.png'),
      ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return path.resolve(file);
  }
  return undefined;
}

function resolveAppIcon(): NativeImage | undefined {
  const file = resolveAppIconPath();
  if (!file) return undefined;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? undefined : image;
}

function createWindow(): void {
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    frame: false,
    backgroundColor: '#0d1117',
    icon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
      // webSecurity is left at its secure default (true). Binary file previews
      // (images / video / audio) work in both modes without disabling it:
      //   - Electron: fs:readFileForEditor returns base64 data URLs.
      //   - Vite browser dev: blob: URLs are created from in-memory File refs.
    },
  });

  mainWindow.webContents.setZoomFactor(1);

  mainWindow.once('ready-to-show', () => {
    if (icon && process.platform === 'win32') {
      mainWindow?.setIcon(icon);
    }
    mainWindow?.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    sendPendingOpenPaths(() => mainWindow);
    void updateService?.checkForUpdates(true);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Strip X-Frame-Options and Content-Security-Policy frame-ancestors
  // to allow embedding external sites in the browser view iframe
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.responseHeaders) {
        // Remove X-Frame-Options
        delete details.responseHeaders['x-frame-options'];
        delete details.responseHeaders['X-Frame-Options'];
        // Remove frame-ancestors from CSP
        if (details.responseHeaders['content-security-policy']) {
          details.responseHeaders['content-security-policy'] = details.responseHeaders['content-security-policy'].map(
            (h: string) => h.replace(/frame-ancestors[^;]*;?/gi, ''),
          );
        }
        if (details.responseHeaders['Content-Security-Policy']) {
          details.responseHeaders['Content-Security-Policy'] = details.responseHeaders['Content-Security-Policy'].map(
            (h: string) => h.replace(/frame-ancestors[^;]*;?/gi, ''),
          );
        }
      }
      callback({ responseHeaders: details.responseHeaders });
    },
  );

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const action = shortcutFromInput(input);
    if (!action) return;
    mainWindow?.webContents.send('shortcut:trigger', action);
    event.preventDefault();
  });
  
  if (isDev) {
    void (async () => {
      try {
        // When VITE_DEV_SERVER=1 is set, the external dev:renderer script has already
        // started Vite on port 5173 — don't start a duplicate internal server.
        if (process.env.VITE_DEV_SERVER === '1') {
          const devUrl = 'http://localhost:5173';
          if (!mainWindow?.isDestroyed()) {
            await mainWindow.loadURL(devUrl);
            console.log(`[Vite] Loaded external dev server: ${devUrl}`);
          }
          return;
        }

        viteDevServer ??= (async () => {
          const { startViteDevServer } = await import('./viteDevServer');
          return startViteDevServer();
        })();
        const server = await viteDevServer;
        const devUrl = server.resolvedUrls.local[0] ?? 'http://localhost:5173';
        if (!mainWindow?.isDestroyed()) {
          await mainWindow.loadURL(devUrl);
          console.log(`[Vite] Loaded dev server: ${devUrl}`);
        }
      } catch (error) {
        console.error('[Vite] Failed to start dev server:', error);
        const rendererPath = path.join(__dirname, '../../dist/renderer/index.html');
        const hasStaticBuild = fs.existsSync(rendererPath);
        if (hasStaticBuild && !mainWindow?.isDestroyed()) {
          try {
            await mainWindow.loadFile(rendererPath);
            console.log(`[Vite] Falling back to built renderer: ${rendererPath}`);
            return;
          } catch (fallbackError) {
            console.error('[Vite] Failed to load built renderer fallback:', fallbackError);
          }
        }
        if (!hasStaticBuild && !mainWindow?.isDestroyed()) {
          dialog.showErrorBox(
            'NexCode failed to start',
            'Could not start the Vite dev server and no built renderer was found at:\n' +
              rendererPath +
              '\n\nRun "npm run buildfast" or "npm run dev" and try again.',
          );
          app.quit();
        }
      }
    })();
  } else {
    const rendererPath = path.join(__dirname, '../../dist/renderer/index.html');
    void mainWindow.loadFile(rendererPath);
  }

  if (isDev && process.env.NEXUS_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function resolveAgentRendererPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../dist/agents/renderer/index.html'),
    path.join(__dirname, '../../src/agents/src/renderer/index.html'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function resolveAgentPreloadPath(): string | null {
  const candidates = [
    path.join(__dirname, '../agents/renderer/modules/preload.js'),
    path.join(__dirname, '../../src/agents/src/renderer/modules/preload.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function createOrFocusAgentWindow(): void {
  if (agentWindow && !agentWindow.isDestroyed()) {
    if (agentWindow.isMinimized()) agentWindow.restore();
    agentWindow.focus();
    return;
  }

  const rendererPath = resolveAgentRendererPath();
  const preloadPath = resolveAgentPreloadPath();
  if (!rendererPath || !preloadPath) {
    dialog.showErrorBox(
      'AI IDE Agent unavailable',
      'Could not find AI Agent UI files. Please rebuild the app and try again.',
    );
    return;
  }

  agentWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    title: 'NexCode AI Agent',
    frame: false,
    backgroundColor: '#1e1e1e',
    parent: mainWindow ?? undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  });

  void agentWindow.loadFile(rendererPath);
  agentWindow.on('closed', () => {
    agentWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    queueOpenPaths(parseOpenPathsFromArgv(argv));
    sendPendingOpenPaths(() => mainWindow);
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

setupOpenFileHandlers(() => mainWindow);

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

  updateService = new UpdateService(() => mainWindow);
  registerIpcHandlers(() => mainWindow, updateService);

  ipcMain.handle('fs:readFileBinary', async (_event, filePath: string) => {
    const buf = await fs.promises.readFile(filePath);
    return new Uint8Array(buf);
  });

  // Serve the crash audio as a base64 data URL so the renderer can play it
  // from the resolved path (handles both built-in and user-overridden crash.ogg)
  ipcMain.handle('app:getCrashAudio', async () => {
    try {
      const buf = await fs.promises.readFile(CRASH_OGG_PATH);
      const base64 = buf.toString('base64');
      return `data:audio/ogg;base64,${base64}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('update:check', async () => {
    return updateService ? await updateService.checkForUpdates(false) : { available: false };
  });
  ipcMain.handle('update:start', () => updateService?.downloadAndInstall());
  ipcMain.on('agent:open', () => createOrFocusAgentWindow());
  ipcMain.on('agent-window:minimize', () => agentWindow?.minimize());
  ipcMain.on('agent-window:maximize', () => {
    if (!agentWindow) return;
    if (agentWindow.isMaximized()) agentWindow.unmaximize();
    else agentWindow.maximize();
  });
  ipcMain.on('window:toggleDevtools', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
  ipcMain.on('agent-window:close', () => agentWindow?.close());
  ipcMain.handle('agent-window:is-maximized', () => agentWindow?.isMaximized() ?? false);
  queueOpenPaths(parseOpenPathsFromArgv(process.argv));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  shutdownTerminals();
  if (viteDevServer) {
    void viteDevServer.then((server) => {
      void server.close();
    });
    viteDevServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
