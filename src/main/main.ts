/**
 * Electron main process — window lifecycle, IPC routing, and native integrations.
 */
import { app, BrowserWindow, dialog, nativeImage, shell, type NativeImage } from 'electron';
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

const APP_NAME = 'NexCode IDE';

// Windows Task Manager uses process title / exe metadata — avoid generic "Electron" label
process.title = APP_NAME;
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nexcode.ide');
}

let mainWindow: BrowserWindow | null = null;
let crashMessageShown = false;

const isDev = !app.isPackaged;

function showCrashMessage(error: unknown): void {
  if (crashMessageShown) return;
  crashMessageShown = true;
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  dialog.showErrorBox('NexCode crashed', `(╥﹏╥)\nI don't know what the error is either...\n\n${detail}`);
}

process.on('uncaughtException', showCrashMessage);
process.on('unhandledRejection', showCrashMessage);

function resolveAppIconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
      ]
    : [
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
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (icon && process.platform === 'win32') {
      mainWindow?.setIcon(icon);
    }
    mainWindow?.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    sendPendingOpenPaths(() => mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept Mod+shortcuts before xterm/Monaco — fixes terminal (CMD) focus on Windows
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

  registerIpcHandlers(() => mainWindow);
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
