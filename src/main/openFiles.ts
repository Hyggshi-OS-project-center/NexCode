/**
 * Open files/folders passed on the command line (Windows file associations, drag-drop, etc.).
 */
import { app, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

export interface OpenPathsPayload {
  files: string[];
  folders: string[];
}

const pending: OpenPathsPayload = { files: [], folders: [] };

function normalizePath(p: string): string {
  return path.normalize(path.resolve(p));
}

/** Args that are the app itself, not user files. */
function isAppLaunchArg(resolved: string): boolean {
  const lower = resolved.toLowerCase();
  const skip = new Set<string>(
    [
      process.execPath,
      process.argv[0],
      app.getPath('exe'),
      app.getAppPath(),
      path.join(app.getAppPath(), 'package.json'),
      path.join(app.getAppPath(), 'dist', 'main', 'main.js'),
    ].map((p) => path.normalize(p).toLowerCase()),
  );
  return skip.has(lower);
}

/** Parse argv for file/folder paths (skip flags and Electron launch args). */
export function parseOpenPathsFromArgv(argv: string[]): OpenPathsPayload {
  const files: string[] = [];
  const folders: string[] = [];

  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-')) continue;

    // Normalize the path relative to process.cwd() if it's a relative path
    let resolved: string;
    try {
      resolved = normalizePath(raw);
      // If the path doesn't exist as-is, try resolving it relative to cwd
      if (!fs.existsSync(resolved)) {
        resolved = normalizePath(path.join(process.cwd(), raw));
      }
    } catch {
      continue;
    }

    if (isAppLaunchArg(resolved)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      continue;
    }

    if (stat.isFile()) {
      if (!files.includes(resolved)) files.push(resolved);
    } else if (stat.isDirectory()) {
      if (!folders.includes(resolved)) folders.push(resolved);
    }
  }

  return { files, folders };
}

export function queueOpenPaths(payload: OpenPathsPayload): void {
  for (const f of payload.files) {
    if (!pending.files.includes(f)) pending.files.push(f);
  }
  for (const d of payload.folders) {
    if (!pending.folders.includes(d)) pending.folders.push(d);
  }
}

export function takePendingOpenPaths(): OpenPathsPayload {
  const batch: OpenPathsPayload = {
    files: [...pending.files],
    folders: [...pending.folders],
  };
  pending.files.length = 0;
  pending.folders.length = 0;
  return batch;
}

export function sendPendingOpenPaths(getWindow: () => BrowserWindow | null): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;

  const payload = takePendingOpenPaths();
  if (payload.files.length === 0 && payload.folders.length === 0) return;

  win.webContents.send('app:open-paths', payload);
}

export function setupOpenFileHandlers(getWindow: () => BrowserWindow | null): void {
  // macOS — Finder / dock
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queueOpenPaths(parseOpenPathsFromArgv([process.execPath, filePath]));
    sendPendingOpenPaths(getWindow);
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
