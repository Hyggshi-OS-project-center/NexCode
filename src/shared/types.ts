/** Shared types between main and renderer processes */

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

/** Previewable media category (image, video, audio) */
export type MediaKind = 'image' | 'video' | 'audio' | null;

/** Result of reading a file for the editor — detects binary/media before display */
export interface ReadFileForEditorResult {
  isBinary: boolean;
  mediaKind: MediaKind;
  size: number;
  content?: string;
  /** Local file URL for media preview (images, video, audio) */
  mediaUrl?: string;
}

export interface FileStatResult {
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

export interface CodeValidationResult {
  command: string;
  ok: boolean;
  code: number;
  output: string;
}

export type TerminalShell = 'cmd' | 'powershell' | 'bash';
export type AiProvider = 'gemini' | 'openrouter';

export interface ShellAdapter {
  SHELL: TerminalShell;
  formatPrompt(cwd: string | null): string;
  normalizeCommand(line: string, cwd: string | null, home: string): string;
  listCompletions(input: string, cwd: string | null, home: string): unknown;
  applyCompletion(input: string, dir: string, match: string, replaceStart: number): string;
  getParentPathHint(cwd: string | null): string | null;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  fontFamily: string;
  insertFontFamily: string;
  customFontFamilies: string[];
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  autoSave: boolean;
  autoSaveDelayMs: number;
  terminalFontSize: number;
  /** Integrated terminal shell — default PowerShell on Windows */
  terminalShell: TerminalShell;
  /** Update channel — 'stable' or 'insider' */
  updateChannel: UpdateChannel;
  /** Google Gemini API key for the autonomous AI agent */
  geminiApiKey: string;
  /** Gemini API model id, e.g. gemini-2.5-flash */
  geminiModel: string;
  /** AI provider for the autonomous agent */
  aiProvider: AiProvider;
  /** OpenRouter API key for the autonomous AI agent */
  openRouterApiKey: string;
  /** OpenRouter model id, e.g. openai/gpt-4o-mini */
  openRouterModel: string;
  /** Enable Chromium sandbox (requires restart) — off by default for memory savings */
  sandbox: boolean;
}

/** One turn in the Gemini chat history */
export interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
  attachments?: AiChatAttachment[];
}

export interface AiChatAttachment {
  name: string;
  kind: 'text' | 'image';
  mimeType: string;
  content?: string;
  dataUrl?: string;
  truncated?: boolean;
}

export interface AiEditorContext {
  activeFilePath: string | null;
  languageId: string | null;
  cursor?: { lineNumber: number; column: number } | null;
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
  selectedText?: string;
  selectedTextTruncated?: boolean;
  content?: string;
  contentTruncated?: boolean;
}

/** Tool action performed by the agent (for UI + editor sync) */
export interface AiAgentAction {
  type: 'write_file' | 'read_file' | 'run_command';
  /** Absolute path on disk */
  path?: string;
  command?: string;
  label: string;
  /** New file content (for write_file actions — used by the diff editor) */
  content?: string;
  /** Original file content before the AI modified it (for write_file actions) */
  originalContent?: string;
}

export interface AiChatResult {
  text?: string;
  error?: string;
  actions?: AiAgentAction[];
}

/** Metadata shown in the About dialog window */
export interface AboutInfo {
  productName: string;
  version: string;
  description: string;
  author: string;
  electron: string;
  chromium?: string;
  node?: string;
  v8?: string;
  os?: string;
  installType?: string;
  HyggshiOSEngine?: string;
  iconUrl: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  insertFontFamily: 'Arial, Helvetica, sans-serif',
  customFontFamilies: [],
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  minimap: true,
  autoSave: true,
  autoSaveDelayMs: 1000,
  terminalFontSize: 16,
  terminalShell: 'powershell',
  updateChannel: 'stable' as UpdateChannel,
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  aiProvider: 'gemini',
  openRouterApiKey: '',
  openRouterModel: 'openai/gpt-4o-mini',
  sandbox: false,
};

export type IpcChannel =
  | 'dialog:openFolder'
  | 'dialog:openFile'
  | 'dialog:saveFile'
  | 'fs:readDir'
  | 'fs:readFile'
  | 'fs:readFileForEditor'
  | 'fs:writeFile'
  | 'fs:exists'
  | 'fs:stat'
  | 'fs:mkdir'
  | 'fs:unlink'
  | 'fs:rename'
  | 'settings:get'
  | 'settings:set'
  | 'window:minimize'
  | 'window:maximize'
  | 'window:close'
  | 'window:isMaximized'
  | 'window:showAbout'
  | 'window:showEasterEgg'
  | 'window:closeEasterEgg'
  | 'shell:openExternal'
  | 'about:getInfo'
  | 'releaseNotes:getLatest'
  | 'about:close'
  | 'terminal:create'
  | 'terminal:write'
  | 'terminal:resize'
  | 'terminal:kill'
  | 'terminal:data'
  | 'terminal:cwd'
  | 'path:home'
  | 'extensions:search'
  | 'ai:chat'
  | 'ai:get-workspace-path'
  | 'ai:set-workspace-path'
  | 'shortcut:trigger'
  | 'app:open-paths'
  | 'git:status'
  | 'git:exec'
  | 'update:check'
  | 'update:start'
  | 'update:available'
  | 'update:progress'
  | 'update:setChannel'

/** Paths to open from OS file association or second-instance launch */
export interface OpenPathsPayload {
  files: string[];
  folders: string[];
}

export interface GitChangedFile {
  path: string;
  index: string;
  worktree: string;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string | null;
  files: GitChangedFile[];
  error?: string;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface MarketplaceExtensionResult {
  identifier: string;
  publisher: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  downloadUrl: string;
  iconUrl: string | null;
  installs: number | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
  content_type?: string;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string;
  html_url?: string;
  body?: string | null;
  prerelease: boolean;
  assets: GitHubReleaseAsset[];
}

export interface ReleaseNotesInfo {
  version: string;
  title: string;
  body: string;
  url: string | null;
}

export type UpdateInstallMode = 'installed' | 'portable' | 'zip';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseUrl: string | null;
  assetName: string;
  assetUrl: string;
  installMode: UpdateInstallMode;
  /** Target architecture of the update asset (e.g. "x64", "arm64", "ia32") */
  arch: string;
}

export type UpdateProgressStage =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'preparing'
  | 'restarting'
  | 'installing'
  | 'completed'
  | 'error';

export interface UpdateProgress {
  stage: UpdateProgressStage;
  message: string;
  percent?: number;
}

export interface UpdateCheckResult {
  available: boolean;
  info?: UpdateInfo;
  error?: string;
}

export type UpdateChannel = 'stable' | 'insider';

export interface ElectronAPI {
  openFolder: () => Promise<string | null>;
  openFile: () => Promise<string | null>;
  saveFile: (defaultPath?: string) => Promise<string | null>;
  readDir: (dirPath: string, options?: { showHidden?: boolean }) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  readFileForEditor: (filePath: string) => Promise<ReadFileForEditorResult>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<FileStatResult | null>;
  mkdir: (dirPath: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  showAboutWindow: () => void;
  showEasterEggWindow: () => void;
  closeEasterEggWindow: () => void;
  openExternal: (url: string) => Promise<void>;
  getAboutInfo: () => Promise<AboutInfo>;
  getLatestReleaseNotes: () => Promise<ReleaseNotesInfo>;
  createTerminal: (cwd?: string) => Promise<number>;
  writeTerminal: (id: number, data: string) => void;
  resizeTerminal: (id: number, cols: number, rows: number) => void;
  killTerminal: (id: number) => void;
  onTerminalData: (callback: (payload: { id: number; data: string }) => void) => () => void;
  onTerminalCwd: (callback: (payload: { id: number; cwd: string }) => void) => () => void;
  onShortcut: (callback: (action: import('./shortcuts').ShortcutAction) => void) => () => void;
  onOpenPaths: (callback: (payload: OpenPathsPayload) => void) => () => void;
  gitStatus: (cwd: string) => Promise<GitStatusResult>;
  gitExec: (cwd: string, args: string[]) => Promise<GitExecResult>;
  getHomePath: () => Promise<string>;
  searchMarketplaceExtensions: (query: string, limit?: number) => Promise<MarketplaceExtensionResult[]>;
  getWorkspacePath: () => Promise<string | null>;
  setWorkspacePath: (workspacePath: string | null) => Promise<void>;
  aiChat: (
    messages: AiChatMessage[],
    workspacePath?: string | null,
    editorContext?: AiEditorContext | null,
  ) => Promise<AiChatResult>;
  aiValidate: (filePath: string, workspacePath: string | null) => Promise<CodeValidationResult | null>;
  openAgent: () => void;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
  setUpdateChannel: (channel: UpdateChannel) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
