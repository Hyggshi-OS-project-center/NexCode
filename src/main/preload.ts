/**
 * Preload script — exposes a safe, typed API to the renderer via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiChatMessage,
  AiChatResult,
  AppSettings,
  CodeValidationResult,
  AboutInfo,
  ElectronAPI,
  GitExecResult,
  GitStatusResult,
  MarketplaceExtensionResult,
  OpenPathsPayload,
  ReleaseNotesInfo,
  UpdateInfo,
  UpdateProgress,
  UpdateChannel,
} from '../shared/types';

const api: ElectronAPI = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  readDir: (dirPath, options) => ipcRenderer.invoke('fs:readDir', dirPath, options),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileBinary: (filePath) => ipcRenderer.invoke('fs:readFileBinary', filePath),
  readFileForEditor: (filePath) => ipcRenderer.invoke('fs:readFileForEditor', filePath),
  writeFile: (filePath, content) => {
    console.trace('[IPC WRITE FILE]', filePath);
    return ipcRenderer.invoke('fs:writeFile', filePath, content);
  },
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  unlink: (filePath) => ipcRenderer.invoke('fs:unlink', filePath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  showAboutWindow: () => ipcRenderer.send('window:showAbout'),
  showEasterEggWindow: () => ipcRenderer.send('window:showEasterEgg'),
  closeEasterEggWindow: () => ipcRenderer.send('window:closeEasterEgg'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  getAboutInfo: () => ipcRenderer.invoke('about:getInfo') as Promise<AboutInfo>,
  getLatestReleaseNotes: () => ipcRenderer.invoke('releaseNotes:getLatest') as Promise<ReleaseNotesInfo>,
  createTerminal: (cwd) => ipcRenderer.invoke('terminal:create', cwd),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.send('terminal:kill', id),
  onTerminalData: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { id: number; data: string }) =>
      callback(payload);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalCwd: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { id: number; cwd: string }) =>
      callback(payload);
    ipcRenderer.on('terminal:cwd', handler);
    return () => ipcRenderer.removeListener('terminal:cwd', handler);
  },
  onShortcut: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, action: string) =>
      callback(action as import('../shared/shortcuts').ShortcutAction);
    ipcRenderer.on('shortcut:trigger', handler);
    return () => ipcRenderer.removeListener('shortcut:trigger', handler);
  },
  onOpenPaths: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: OpenPathsPayload) => callback(payload);
    ipcRenderer.on('app:open-paths', handler);
    return () => ipcRenderer.removeListener('app:open-paths', handler);
  },
  gitStatus: (cwd) => ipcRenderer.invoke('git:status', cwd) as Promise<GitStatusResult>,
  gitExec: (cwd, args) => ipcRenderer.invoke('git:exec', cwd, args) as Promise<GitExecResult>,
  getHomePath: () => ipcRenderer.invoke('path:home') as Promise<string>,
  searchMarketplaceExtensions: (query, limit) =>
    ipcRenderer.invoke('extensions:search', query, limit) as Promise<MarketplaceExtensionResult[]>,
  getWorkspacePath: () => ipcRenderer.invoke('ai:get-workspace-path') as Promise<string | null>,
  setWorkspacePath: (workspacePath) =>
    ipcRenderer.invoke('ai:set-workspace-path', workspacePath ?? null) as Promise<void>,
  aiChat: (messages, workspacePath, editorContext) =>
    ipcRenderer.invoke('ai:chat', messages, workspacePath ?? null, editorContext ?? null) as Promise<AiChatResult>,
  aiValidate: (filePath, workspacePath) =>
    ipcRenderer.invoke('ai:validate', filePath, workspacePath ?? null) as Promise<CodeValidationResult | null>,
  openAgent: () => ipcRenderer.send('agent:open'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  startUpdate: () => ipcRenderer.invoke('update:start'),
  onUpdateAvailable: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: UpdateProgress) => callback(progress);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  setUpdateChannel: (channel: UpdateChannel) =>
    ipcRenderer.invoke('update:setChannel', channel),
  openPdf: () => ipcRenderer.invoke('pdf:open') as Promise<boolean>,
  getRecentFiles: () => ipcRenderer.invoke('recentFiles:get') as Promise<string[]>,
  pushRecentFile: (filePath) => ipcRenderer.invoke('recentFiles:push', filePath) as Promise<string[]>,
  removeRecentFile: (filePath) => ipcRenderer.invoke('recentFiles:remove', filePath) as Promise<string[]>,
  clearRecentFiles: () => ipcRenderer.invoke('recentFiles:clear') as Promise<string[]>,
};

contextBridge.exposeInMainWorld('electronAPI', api);
