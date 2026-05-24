/**
 * Native-framed About dialog (modal child of the main window).
 */
import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

let aboutWindow: BrowserWindow | null = null;

function resolveAppIconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
      ]
    : [
        path.join(__dirname, '../../../build/icon.ico'),
        path.join(__dirname, '../../../build/icon.png'),
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

export function showAboutWindow(parent: BrowserWindow | null): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const icon = resolveAppIcon();
  aboutWindow = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    title: 'About NexCode IDE',
    parent: parent ?? undefined,
    modal: Boolean(parent),
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#252526',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'aboutPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const aboutHtml = path.join(__dirname, '../../renderer/about.html');
  void aboutWindow.loadFile(aboutHtml);

  aboutWindow.once('ready-to-show', () => {
    if (icon && process.platform === 'win32') {
      aboutWindow?.setIcon(icon);
    }
    aboutWindow?.show();
  });

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

export function closeAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.close();
  }
}
