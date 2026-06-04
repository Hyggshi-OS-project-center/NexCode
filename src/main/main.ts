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

const APP_NAME = 'NexCode IDE';

app.commandLine.appendSwitch('max_old_space_size', '512');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --optimize-for-size');

process.title = APP_NAME;
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nexcode.ide');
}

let mainWindow: BrowserWindow | null = null;
let agentWindow: BrowserWindow | null = null;
let crashMessageShown = false;
let updateService: UpdateService | null = null;

const isDev = !app.isPackaged;

function showCrashMessage(error: unknown): void {
  if (crashMessageShown) return;
  crashMessageShown = true;
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  dialog.showErrorBox('NexCode crashed', `(╥﹏╥)\nI don't know what the error is either...\n\n${detail}`);
}

process.on('uncaughtException', showCrashMessage);
process.on('unhandledRejection', showCrashMessage);

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
        // Fallback to regular icon if the insider icon is missing
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
      ]
    : [
        // In development, the insider icon lives in src/renderer/public/
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const action = shortcutFromInput(input);
    if (!action) return;
    mainWindow?.webContents.send('shortcut:trigger', action);
    event.preventDefault();
  });

  const rendererPath = path.join(__dirname, '../../dist/renderer/index.html');
  mainWindow.loadFile(rendererPath);

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

  // run updateService and registerIpcHandlers
  updateService = new UpdateService(() => mainWindow);
  registerIpcHandlers(() => mainWindow, updateService);

  ipcMain.handle('update:check', () => updateService?.checkForUpdates(false));
  ipcMain.handle('update:start', () => updateService?.downloadAndInstall());
  ipcMain.on('agent:open', () => createOrFocusAgentWindow());
  ipcMain.on('agent-window:minimize', () => agentWindow?.minimize());
  ipcMain.on('agent-window:maximize', () => {
    if (!agentWindow) return;
    if (agentWindow.isMaximized()) agentWindow.unmaximize();
    else agentWindow.maximize();
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});