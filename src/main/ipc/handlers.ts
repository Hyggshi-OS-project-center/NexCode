/**
 * Central IPC handler registration — keeps main process logic modular.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import type { Stats } from 'node:fs';
import type { AppSettings, FileEntry, ReadFileForEditorResult } from '../../shared/types';
import type { UpdateChannel } from '../../shared/types';
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
import { clearRecentFiles, getRecentFiles, pushRecentFile, removeRecentFile } from '../recentFiles';
import { closeAboutWindow, showAboutWindow } from '../about/aboutWindow';
import { closeEasterEggWindow, showEasterEggWindow } from '../easterEgg/easterEggWindow';
import { chatWithGemini, listGeminiModels } from '../ai/geminiService';
import { chatWithOpenRouter, listOpenRouterModels } from '../ai/openRouterService';
import { chatWithClaude, listClaudeModels } from '../ai/claudeService';
import { validateWrittenFile } from '../ai/agentWorkflow';
import type { AboutInfo, AiChatMessage, AiEditorContext } from '../../shared/types';
import type { GitHubRelease, ReleaseNotesInfo } from '../../shared/types';
import { UpdateService } from '../update/UpdateService';

const terminals = new TerminalManager();
let currentWorkspacePath: string | null = null;
const RELEASE_NOTES_URL = 'https://api.github.com/repos/Hyggshi-OS-project-center/NexCode/releases/latest';
const GITHUB_USER_AGENT = 'NexCode-IDE';

export function shutdownTerminals(): void {
  terminals.killAll();
}

async function readDirShallow(dirPath: string, showHidden = false): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    for (const entry of sorted) {
      if (!showHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;
      const fullPath = path.posix.join(dirPath.replace(/\\/g, '/'), entry.name);
      result.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      });
    }
    return result;
  } catch (error: unknown) {
    throw wrapFsError(error, dirPath, 'read folder');
  }
}

function wrapFsError(error: unknown, filePath: string, operation: string): Error {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') {
    return new Error(`Permission denied: cannot ${operation} "${filePath}". Try running NexCode IDE as administrator or choose a location with proper access rights.`);
  }
  if (code === 'ENOENT') {
    return new Error(`File or folder not found: "${filePath}". It may have been moved or deleted.`);
  }
  if (code === 'EISDIR') {
    return new Error(`Expected a file but found a directory: "${filePath}".`);
  }
  if (code === 'EISDIR' || code === 'ENOTDIR') {
    return new Error(`Path component is not a directory: "${filePath}".`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  updateService: UpdateService,
): void {
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
  ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
    try {
      return await fs.readFile(path.resolve(filePath), 'utf-8');
    } catch (error: unknown) {
      throw wrapFsError(error, filePath, 'read');
    }
  });
  ipcMain.handle('fs:readFileForEditor', async (_e, filePath: string): Promise<ReadFileForEditorResult> => {
    const resolvedPath = path.resolve(filePath);
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch (error: unknown) {
      throw wrapFsError(error, filePath, 'access');
    }
    const ext = getExtension(resolvedPath);
    const mediaKind = getMediaKind(ext);

    if (mediaKind) {
      const buf = await fs.readFile(resolvedPath);
      // Use data URLs so images/videos/audio load from http:// dev server
      // (file:// URLs are blocked by Chromium when page origin is http://)
      const ext = resolvedPath.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
        mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
        pdf: 'application/pdf',
      };
      const mime = mimeMap[ext] ?? 'application/octet-stream';
      const base64 = buf.toString('base64');
      return {
        isBinary: true,
        mediaKind,
        size: stat.size,
        mediaUrl: `data:${mime};base64,${base64}`,
        dataBase64: mediaKind === 'pdf' ? base64 : undefined,
      };
    }

    const buf = await fs.readFile(resolvedPath);
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
    try {
      const resolvedPath = path.resolve(filePath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, 'utf-8');
    } catch (error: unknown) {
      throw wrapFsError(error, filePath, 'write');
    }
  });
  ipcMain.handle('fs:exists', async (_e, filePath: string) => {
    try {
      await fs.access(path.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('fs:stat', async (_e, filePath: string) => {
    try {
      const resolvedPath = path.resolve(filePath);
      const stat = await fs.stat(resolvedPath);
      return { isDirectory: stat.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw wrapFsError(error, filePath, 'stat');
    }
  });
  ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
    try {
      const resolvedPath = dirPath.startsWith('/') ? path.resolve(dirPath) : path.resolve(`/${dirPath}`);
      await fs.mkdir(resolvedPath, { recursive: true });
    } catch (error: unknown) {
      throw wrapFsError(error, dirPath, 'create directory');
    }
  });
  ipcMain.handle('fs:unlink', async (_e, targetPath: string) => {
    try {
      const resolvedPath = path.resolve(targetPath);
      const stat = await fs.stat(resolvedPath);
      if (stat.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(resolvedPath);
      }
    } catch (error: unknown) {
      throw wrapFsError(error, targetPath, 'delete');
    }
  });
  ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
    try {
      await fs.rename(path.resolve(oldPath), path.resolve(newPath));
    } catch (error: unknown) {
      throw wrapFsError(error, oldPath, 'rename');
    }
  });

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
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links can be opened externally.');
    await shell.openExternal(parsed.href);
  });
  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    await shell.openPath(filePath);
  });
  ipcMain.handle('releaseNotes:getLatest', async (): Promise<ReleaseNotesInfo> => {
    const release = await fetchJson<GitHubRelease>(RELEASE_NOTES_URL);
    return {
      version: release.tag_name.trim().replace(/^v/i, ''),
      title: release.name || release.tag_name,
      body: release.body?.trim() || 'No release notes were published for this version.',
      url: release.html_url ?? null,
    };
  });
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

    const insider = !app.isPackaged || app.getVersion().toLowerCase().includes('insider');
    let iconUrl: string | null = null;
    const iconCandidates = app.isPackaged
      ? [
          path.join(process.resourcesPath, insider ? 'insider-icon.ico' : 'icon.ico'),
          path.join(path.dirname(process.execPath), 'resources', insider ? 'insider-icon.ico' : 'icon.ico'),
          // Fallback to regular icon
          path.join(process.resourcesPath, 'icon.ico'),
          path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
          path.join(process.resourcesPath, 'icon.png'),
        ]
      : [
          // In development, the insider icon lives in src/renderer/public/
          path.join(__dirname, '../../../src/renderer/public/insider-icon.ico'),
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
      chromium: process.versions.chrome ?? process.versions.chromium,
      node: process.versions.node,
      v8: process.versions.v8,
      os: `${os.type()} ${os.arch()} ${os.release()}`,
      installType: app.isPackaged ? 'User setup' : 'Development',
      iconUrl,
    };
  });

  // Update channel handler
  ipcMain.handle('update:setChannel', (_e, channel: UpdateChannel) => {
    updateService.setChannel(channel);
  });

  ipcMain.handle('pdf:open', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return false;
    }
    const filePath = result.filePaths[0];
    const pdfWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'PDF Viewer',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        sandbox: false,
      },
    });
    const viewerPath = path.join(__dirname, '../../node_modules/pdfjs-dist/web/viewer.html');
    const encodedFilePath = encodeURIComponent(filePath);
    pdfWindow.loadFile(viewerPath, { query: { file: encodedFilePath } });
    return true;
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
        if (settings.aiProvider === 'claude') {
          return chatWithClaude(
            settings.claudeApiKey,
            settings.claudeModel,
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

   // Validate a file after user approves AI changes
   ipcMain.handle('ai:validate', async (_e, filePath: string, workspacePath: string | null) => {
     const cwd = workspacePath ?? process.cwd();
     return validateWrittenFile(filePath, workspacePath ?? null, cwd, []);
   });

  // Dynamic AI model listing
  ipcMain.handle('models:list-gemini', async () => {
    try {
      const settings = getSettings();
      if (!settings.geminiApiKey) return [];
      return await listGeminiModels(settings.geminiApiKey);
    } catch {
      return [];
    }
  });

  ipcMain.handle('models:list-openrouter', async () => {
    try {
      const settings = getSettings();
      if (!settings.openRouterApiKey) return [];
      return await listOpenRouterModels(settings.openRouterApiKey);
    } catch {
      return [];
    }
  });

  ipcMain.handle('models:list-claude', async () => {
    try {
      return await listClaudeModels();
    } catch {
      return [];
    }
  });

  // Recent files (Open Recent menu)
  ipcMain.handle('recentFiles:get', () => getRecentFiles());
  ipcMain.handle('recentFiles:clear', () => {
    clearRecentFiles();
    return getRecentFiles();
  });
  ipcMain.handle('recentFiles:push', (_e, filePath: string) => {
    pushRecentFile(filePath);
    return getRecentFiles();
  });
  ipcMain.handle('recentFiles:remove', (_e, filePath: string) => {
    removeRecentFile(filePath);
    return getRecentFiles();
  });
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': GITHUB_USER_AGENT, Accept: 'application/vnd.github+json' } }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub release notes request failed with HTTP ${response.statusCode ?? 'unknown'}.`));
          response.resume();
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}