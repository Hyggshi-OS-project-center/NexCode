import { app, BrowserWindow, nativeImage, type NativeImage, type Rectangle } from 'electron';
import fs from 'fs';
import path from 'path';

let easterEggWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

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
        path.join(__dirname, '../../../src/renderer/public/insider-icon.ico'),
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

function getDevRendererOrigin(parent: BrowserWindow | null): string {
  if (parent && !parent.isDestroyed()) {
    try {
      const url = new URL(parent.webContents.getURL());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      // Fall back to the Vite default below.
    }
  }
  return 'http://127.0.0.1:5173';
}

async function loadEasterEggContent(window: BrowserWindow, parent: BrowserWindow | null): Promise<void> {
  if (isDev) {
    await window.loadURL(`${getDevRendererOrigin(parent)}/easterEgg.html`);
    return;
  }

  const htmlPath = path.join(__dirname, '../../renderer/easterEgg.html');
  if (fs.existsSync(htmlPath)) {
    await window.loadFile(htmlPath);
    return;
  }

  throw new Error(`Easter egg renderer not found: ${htmlPath}`);
}

function showLoadedWindow(icon: NativeImage | undefined): void {
  if (!easterEggWindow || easterEggWindow.isDestroyed()) return;
  if (icon && process.platform === 'win32') {
    easterEggWindow.setIcon(icon);
  }
  easterEggWindow.show();
  easterEggWindow.focus();
}

function getWindowBounds(parent: BrowserWindow | null): Rectangle {
  const width = 500;
  const height = 580;
  const margin = 20;

  if (!parent || parent.isDestroyed()) {
    return { x: 120, y: 120, width, height };
  }

  const bounds = parent.getBounds();
  return {
    x: Math.max(bounds.x + 24, bounds.x + bounds.width - width - margin),
    y: Math.max(bounds.y + 60, bounds.y + bounds.height - height - margin),
    width,
    height,
  };
}

export function showEasterEggWindow(parent: BrowserWindow | null): void {
  if (easterEggWindow && !easterEggWindow.isDestroyed()) {
    const bounds = getWindowBounds(parent);
    easterEggWindow.setBounds(bounds);
    easterEggWindow.show();
    easterEggWindow.focus();
    return;
  }

  const icon = resolveAppIcon();
  easterEggWindow = new BrowserWindow({
    ...getWindowBounds(parent),
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'NexCode Easter Egg',
    parent: parent ?? undefined,
    modal: false,
    frame: true,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: '#1e1e1e',
    icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  easterEggWindow.once('ready-to-show', () => {
    showLoadedWindow(icon);
  });

  void loadEasterEggContent(easterEggWindow, parent).catch((error) => {
    console.error('[EasterEgg] Failed to load renderer:', error);
    showLoadedWindow(icon);
  });

  easterEggWindow.on('closed', () => {
    easterEggWindow = null;
  });
}

export function closeEasterEggWindow(): void {
  if (easterEggWindow && !easterEggWindow.isDestroyed()) {
    easterEggWindow.close();
  }
}
