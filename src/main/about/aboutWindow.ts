/**
 * Native-framed About dialog (non-modal child of the main window).
 */
import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

let aboutWindow: BrowserWindow | null = null;

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

/** In dev the renderer is served by Vite; dist/renderer may not exist (npm run dev never builds it). */
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

async function loadAboutContent(window: BrowserWindow, parent: BrowserWindow | null): Promise<void> {
  const aboutHtml = path.join(__dirname, '../../renderer/about.html');
  // Prefer the built file (packaged app, or dev with a fresh build); otherwise use Vite in dev.
  if (fs.existsSync(aboutHtml)) {
    await window.loadFile(aboutHtml);
    return;
  }
  if (isDev) {
    await window.loadURL(`${getDevRendererOrigin(parent)}/about.html`);
    return;
  }
  throw new Error(`About renderer not found: ${aboutHtml}`);
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
    // Not modal on purpose: a modal child locks input on the parent window and, with several
    // Linux window managers / compositors, never releases it (main window "unclickable").
    // Keeping `parent` still makes About stay on top of the main window.
    modal: false,
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

  const win = aboutWindow;
  let shown = false;
  const showAbout = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (icon && process.platform === 'win32') {
      win.setIcon(icon);
    }
    win.show();
  };

  win.once('ready-to-show', showAbout);

  void loadAboutContent(win, parent)
    .then(() => {
      // Show immediately once content is loaded — don't wait for ready-to-show.
      showAbout();
    })
    .catch((error) => {
      console.error('[About] Failed to load renderer:', error);
      if (!win.isDestroyed()) {
        const msg = error instanceof Error ? error.message : String(error);
        void win.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent(
              `<body style="font:13px sans-serif;background:#252526;color:#ccc;padding:16px">` +
                `<h3>NexCode IDE</h3><p>About page failed to load.</p><pre style="white-space:pre-wrap">${msg.replace(/</g, '&lt;')}</pre></body>`,
            ),
        ).catch(() => {});
      }
      showAbout();
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
