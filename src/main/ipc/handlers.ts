/**
 * Central IPC handler registration — keeps main process logic modular.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AppSettings, FileEntry, ReadFileForEditorResult } from '../../shared/types';
import { TerminalManager } from '../terminal/TerminalManager';
import { getSettings, setSettings } from '../settings/store';
import { pathToFileURL } from 'url';
import {
  getExtension,
  getMediaKind,
  isBinaryBuffer,
  isKnownBinaryExtension,
} from '../utils/fileKind';
import { getGitStatus, gitExec } from '../git/gitService';
import { searchMarketplaceExtensions } from '../extensions/marketplaceService';
import { closeAboutWindow, showAboutWindow } from '../about/aboutWindow';
import { closeEasterEggWindow, showEasterEggWindow } from '../easterEgg/easterEggWindow';
import { chatWithGemini } from '../ai/geminiService';
import { chatWithOpenRouter } from '../ai/openRouterService';
import type { AboutInfo, AiChatMessage, AiEditorContext } from '../../shared/types';

const terminals = new TerminalManager();
let currentWorkspacePath: string | null = null;

/** Kill all integrated terminal shells when the app exits. */
export function shutdownTerminals(): void {
  terminals.killAll();
}

/** Read one directory level (lazy tree expansion). */
async function readDirShallow(dirPath: string, showHidden = false): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  for (const entry of sorted) {
    if (!showHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;
    const fullPath = path.join(dirPath, entry.name);
    result.push({
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
    });
  }
  return result;
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:openFile', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string) => {
    const win = getWindow();
    const result = await dialog.showSaveDialog(win!, { defaultPath });
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.handle(
    'fs:readDir',
    async (_e, dirPath: string, options?: { showHidden?: boolean }) =>
      readDirShallow(dirPath, options?.showHidden ?? false),
  );
  ipcMain.handle('fs:readFile', async (_e, filePath: string) => fs.readFile(filePath, 'utf-8'));
  ipcMain.handle('fs:readFileForEditor', async (_e, filePath: string): Promise<ReadFileForEditorResult> => {
    const stat = await fs.stat(filePath);
    const ext = getExtension(filePath);
    const mediaKind = getMediaKind(ext);

    if (mediaKind) {
      return {
        isBinary: true,
        mediaKind,
        size: stat.size,
        mediaUrl: pathToFileURL(filePath).href,
      };
    }

    const buf = await fs.readFile(filePath);
    const isBinary = isKnownBinaryExtension(ext) || isBinaryBuffer(buf);

    if (isBinary) {
      return { isBinary: true, mediaKind: null, size: stat.size };
    }

    return {
      isBinary: false,
      mediaKind: null,
      size: stat.size,
      content: buf.toString('utf-8'),
    };
  });
  ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  });
  ipcMain.handle('fs:exists', async (_e, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('fs:stat', async (_e, filePath: string) => {
    try {
      const stat = await fs.stat(filePath);
      return { isDirectory: stat.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  });
  ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => fs.mkdir(dirPath, { recursive: true }));
  ipcMain.handle('fs:unlink', async (_e, targetPath: string) => {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.unlink(targetPath);
    }
  });
  ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => fs.rename(oldPath, newPath));

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => setSettings(partial));

  ipcMain.on('window:minimize', () => getWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => getWindow()?.close());
  ipcMain.handle('window:isMaximized', () => getWindow()?.isMaximized() ?? false);
  ipcMain.handle('ai:get-editor-context', async () => null);
  ipcMain.handle('ai:get-workspace-path', async () => currentWorkspacePath);
  ipcMain.handle('ai:set-workspace-path', async (_e, workspacePath?: string | null) => {
    currentWorkspacePath = workspacePath ? path.resolve(workspacePath) : null;
  });
  ipcMain.on('window:showAbout', () => showAboutWindow(getWindow()));
  ipcMain.on('window:showEasterEgg', () => showEasterEggWindow(getWindow()));
  ipcMain.on('window:closeEasterEgg', () => closeEasterEggWindow());
  ipcMain.on('about:close', () => closeAboutWindow());
  ipcMain.handle('about:getInfo', async (): Promise<AboutInfo> => {
    let productName = 'NexCode IDE';
    let version = app.getVersion();
    let description = 'A world-class code editor at its core, built for speed and modern workflows.';
    let author = '';
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      const raw = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as {
        productName?: string;
        name?: string;
        version?: string;
        description?: string;
        author?: string;
      };
      productName = pkg.productName ?? pkg.name ?? productName;
      version = pkg.version ?? version;
      if (pkg.description) description = pkg.description;
      if (typeof pkg.author === 'string') author = pkg.author;
    } catch {
      /* use defaults */
    }

    let iconUrl: string | null = null;
    const iconCandidates = app.isPackaged
      ? [
          path.join(process.resourcesPath, 'icon.ico'),
          path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
          path.join(process.resourcesPath, 'icon.png'),
        ]
      : [
          path.join(__dirname, '../../../build/icon.ico'),
          path.join(__dirname, '../../../build/icon.png'),
        ];
    for (const file of iconCandidates) {
      try {
        await fs.access(file);
        iconUrl = pathToFileURL(path.resolve(file)).href;
        break;
      } catch {
        /* try next */
      }
    }

    return {
      productName,
      version,
      description,
      author,
      electron: process.versions.electron,
      iconUrl,
    };
  });

  ipcMain.handle('terminal:create', async (_e, cwd?: string) => {
    const win = getWindow();
    if (!win) return -1;
    return terminals.create(win, cwd);
  });
  ipcMain.on('terminal:write', (_e, id: number, data: string) => terminals.write(id, data));
  ipcMain.on('terminal:resize', (_e, id: number, cols: number, rows: number) => {
    terminals.resize(id, cols, rows);
  });
  ipcMain.on('terminal:kill', (_e, id: number) => terminals.kill(id));

  ipcMain.handle('git:status', async (_e, cwd: string) => getGitStatus(cwd));
  ipcMain.handle('git:exec', async (_e, cwd: string, args: string[]) => gitExec(cwd, args));

  ipcMain.handle('path:home', () => os.homedir());
  ipcMain.handle('extensions:search', async (_e, query: string, limit?: number) =>
    searchMarketplaceExtensions(query, limit),
  );

  ipcMain.handle(
    'ai:chat',
    async (
      _e,
      messages: AiChatMessage[],
      workspacePath?: string | null,
      editorContext?: AiEditorContext | null,
    ) => {
      const settings = getSettings();
      if (settings.aiProvider === 'openrouter') {
        return chatWithOpenRouter(
          settings.openRouterApiKey,
          settings.openRouterModel,
          messages,
          workspacePath ?? null,
          editorContext ?? null,
        );
      }
      return chatWithGemini(
        settings.geminiApiKey,
        settings.geminiModel,
        messages,
        workspacePath ?? null,
        editorContext ?? null,
      );
    },
  );
}
