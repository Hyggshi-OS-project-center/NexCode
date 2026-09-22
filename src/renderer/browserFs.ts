/**
 * In-memory browser filesystem for dev mode (Vite browser, no Electron).
 * Files are captured from the webkitdirectory / file input pickers and stored
 * in a flat Map keyed by normalized path.
 */

export interface BrowserFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Last-modified timestamp (ms) */
  mtimeMs: number;
  /** Text content (for text files that have been read) */
  content?: string;
  /** Blob URL for binary previews */
  blobUrl?: string;
}

type FileMap = Map<string, BrowserFileEntry>;
type FileRefMap = Map<string, File>;

let fileMap: FileMap = new Map();
let fileRefs: FileRefMap = new Map();
let roots = new Set<string>();

const WORKSPACE_STORAGE_KEY = 'nexcode.web-workspace.v1';
const MAX_PERSISTED_FILE_BYTES = 1024 * 1024;
const TEXT_FILE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'csv', 'go', 'h', 'hpp', 'html', 'java',
  'js', 'json', 'jsx', 'md', 'mjs', 'php', 'py', 'rb', 'rs', 'scss', 'sh',
  'sql', 'svg', 'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml',
]);

interface PersistedWorkspace {
  version: 1;
  roots: string[];
  entries: BrowserFileEntry[];
}

function canPersistTextFile(file: File): boolean {
  if (file.size > MAX_PERSISTED_FILE_BYTES) return false;
  if (file.type.startsWith('text/')) return true;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_FILE_EXTENSIONS.has(extension);
}

function persistWorkspace(): void {
  try {
    // Files that have not been read are backed by a browser File object, which
    // is not serializable. Store only directories and materialized text files.
    const entries = [...fileMap.values()]
      .filter((entry) => entry.isDirectory || entry.content !== undefined)
      .map(({ blobUrl: _blobUrl, ...entry }) => entry);
    const snapshot: PersistedWorkspace = { version: 1, roots: [...roots], entries };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Quota/security failures must not prevent editing the current workspace.
    console.warn('[BrowserFs] Could not persist web workspace:', error);
  }
}

function restoreWorkspace(): void {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw) as PersistedWorkspace;
    if (snapshot.version !== 1 || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.roots)) return;
    fileMap = new Map(snapshot.entries.map((entry) => [normalizePath(entry.path), { ...entry, blobUrl: undefined }]));
    roots = new Set(snapshot.roots.map(normalizePath));
  } catch (error) {
    console.warn('[BrowserFs] Could not restore saved web workspace:', error);
  }
}

/**
 * Normalize a path to use forward slashes and lowercase drive letter.
 */
function normalizePath(p: string): string {
  let n = p.replace(/\\+/g, '/');
  // Lowercase drive letter if present
  n = n.replace(/^([A-Z]):/i, (_, d) => d.toLowerCase() + ':');
  return n;
}

/**
 * Get the parent path of a given path.
 */
function parentDir(p: string): string {
  const n = normalizePath(p).replace(/\/+$/, '');
  const idx = n.lastIndexOf('/');
  return idx > 0 ? n.substring(0, idx) : '/';
}

/**
 * Capture files from a webkitdirectory <input> selection.
 * Must be called before any readDir/readFile operations.
 */
export function captureDirectoryFiles(files: FileList): string {
  fileMap = new Map();
  fileRefs = new Map();
  roots = new Set();

  const dirs = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rawPath = (f as any).path || f.webkitRelativePath || f.name;
    const normalized = normalizePath(rawPath);

    // Extract directory entries from file paths
    const parts = normalized.split('/');
    let accum = '';
    for (let j = 0; j < parts.length - 1; j++) {
      accum = accum ? `${accum}/${parts[j]}` : parts[j];
      dirs.add(accum);
    }

    fileMap.set(normalized, {
      name: parts[parts.length - 1],
      path: normalized,
      isDirectory: false,
      size: f.size,
      mtimeMs: f.lastModified || Date.now(),
      content: undefined,
      blobUrl: undefined,
    });
    fileRefs.set(normalized, f);
  }

  for (const d of dirs) {
    const parts = d.split('/');
    fileMap.set(d, {
      name: parts[parts.length - 1],
      path: d,
      isDirectory: true,
      size: 0,
      mtimeMs: Date.now(),
    });
  }

  // Determine root(s)
  for (const d of dirs) {
    if (!d.includes('/')) roots.add(d);
  }
  // If no root directories found, derive from first file
  if (roots.size === 0 && files.length > 0) {
    const first = normalizePath((files[0] as any).path || files[0].webkitRelativePath);
    const root = first.split('/')[0];
    roots.add(root);
  }

  // Browser File references vanish on reload. Materialize ordinary source files
  // in the background so a web workspace can be reopened later.
  void cacheSelectedTextFiles(files);
  return [...roots][0] || '/';
}

async function cacheSelectedTextFiles(files: FileList): Promise<void> {
  const reads: Promise<void>[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!canPersistTextFile(file)) continue;
    const path = normalizePath((file as any).path || file.webkitRelativePath || file.name);
    reads.push(file.text().then((content) => {
      const entry = fileMap.get(path);
      if (entry) entry.content = content;
    }).catch(() => undefined));
  }
  await Promise.all(reads);
  persistWorkspace();
}

/**
 * Capture a single file from an <input type="file"> selection.
 * Returns the stored path.
 */
export function captureSingleFile(file: File): string {
  const rawPath = (file as any).path || file.name;
  const normalized = normalizePath(rawPath);

  fileMap.set(normalized, {
    name: file.name,
    path: normalized,
    isDirectory: false,
    size: file.size,
    mtimeMs: file.lastModified || Date.now(),
    content: undefined,
    blobUrl: undefined,
  });
  fileRefs.set(normalized, file);
  if (canPersistTextFile(file)) {
    void file.text().then((content) => {
      const entry = fileMap.get(normalized);
      if (entry) entry.content = content;
      persistWorkspace();
    }).catch(() => undefined);
  }

  return normalized;
}

/**
 * Read the text content of a file into the cache.
 * Lazily reads from the stored File object (webkitdirectory or single-file picker).
 */
export async function readFileContent(path: string): Promise<string> {
  const n = normalizePath(path);
  const entry = fileMap.get(n);
  if (!entry || entry.isDirectory) throw new Error(`File not found: ${path}`);
  if (entry.content !== undefined) return entry.content;

  // Try to read from stored File reference
  const fileRef = fileRefs.get(n);
  if (fileRef) {
    const text = await fileRef.text();
    entry.content = text;
    persistWorkspace();
    return text;
  }

  // Fallback: try blobUrl
  if (entry.blobUrl) {
    const resp = await fetch(entry.blobUrl);
    const text = await resp.text();
    entry.content = text;
    persistWorkspace();
    return text;
  }

  throw new Error(`File content not available for: ${path}`);
}

/**
 * Get content from a file synchronously if already cached, otherwise read it async.
 * This is the key function used by readFile and readFileForEditor in the electron API shim.
 */
export async function readFileContentAsync(path: string): Promise<string> {
  return readFileContent(path);
}

/** List entries in a directory */
export function readDir(dirPath: string, _options?: { showHidden?: boolean }): BrowserFileEntry[] {
  const n = normalizePath(dirPath).replace(/\/+$/, '');
  const prefix = n === '' ? '' : n + '/';

  const entries = new Map<string, BrowserFileEntry>();

  for (const [key, entry] of fileMap) {
    // Skip the directory itself
    if (key === n) continue;

    // Check if this entry is a direct or nested child of the target directory
    if (!key.startsWith(prefix)) continue;

    const rest = key.substring(prefix.length);
    const firstSlash = rest.indexOf('/');
    const childName = firstSlash >= 0 ? rest.substring(0, firstSlash) : rest;

    if (!entries.has(childName)) {
      // Determine full path of the child entry
      const childPath = prefix + childName;
      const childEntry = fileMap.get(childPath);
      entries.set(childName, {
        name: childName,
        path: childPath,
        isDirectory: childEntry?.isDirectory ?? firstSlash >= 0,
        size: childEntry?.size ?? (firstSlash >= 0 ? 0 : entry.size),
        mtimeMs: childEntry?.mtimeMs ?? (firstSlash >= 0 ? entry.mtimeMs : entry.mtimeMs),
        content: childEntry?.content,
        blobUrl: childEntry?.blobUrl,
      });
    }
  }

  // Mirror the native Explorer: folders first, then files; names remain
  // alphabetical inside each group. Map insertion order otherwise puts files
  // selected by the browser ahead of the generated directory entries.
  return [...entries.values()].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Check if a path exists */
export function exists(path: string): boolean {
  return fileMap.has(normalizePath(path));
}

/** Get file stat */
export function stat(path: string): BrowserFileEntry | null {
  const entry = fileMap.get(normalizePath(path));
  if (!entry) return null;
  return { ...entry };
}

/** Write text content to a path */
export function writeFile(path: string, content: string): void {
  const n = normalizePath(path);
  const existing = fileMap.get(n);
  fileMap.set(n, {
    name: existing?.name || n.split('/').pop() || 'untitled',
    path: n,
    isDirectory: false,
    size: content.length,
    mtimeMs: Date.now(),
    content,
  });
  persistWorkspace();
}

/** Delete a file */
export function unlink(path: string): void {
  const n = normalizePath(path);
  fileMap.delete(n);
  fileRefs.delete(n);
  persistWorkspace();
}

/** Create a directory */
export function mkdir(path: string): void {
  const n = normalizePath(path).replace(/\/+$/, '');
  if (fileMap.has(n)) return;
  fileMap.set(n, {
    name: n.split('/').pop() || '',
    path: n,
    isDirectory: true,
    size: 0,
    mtimeMs: Date.now(),
  });
  // Ensure parent directories exist
  const parent = parentDir(n);
  if (parent && parent !== n && !fileMap.has(parent)) {
    mkdir(parent);
  }
  persistWorkspace();
}

/** Rename a file or directory */
export function rename(oldPath: string, newPath: string): void {
  const oldN = normalizePath(oldPath);
  const newN = normalizePath(newPath);

  const oldEntry = fileMap.get(oldN);
  if (!oldEntry) throw new Error(`Path not found: ${oldPath}`);

  if (oldEntry.isDirectory) {
    // Move all children
    const toMove: [string, BrowserFileEntry][] = [];
    for (const [key, entry] of fileMap) {
      if (key === oldN || key.startsWith(oldN + '/')) {
        toMove.push([key, entry]);
      }
    }
    for (const [key, entry] of toMove) {
      fileMap.delete(key);
      const rel = key.substring(oldN.length);
      const newKey = newN + rel;
      fileMap.set(newKey, { ...entry, path: newKey, name: newKey.split('/').pop() || '' });
      const fileRef = fileRefs.get(key);
      if (fileRef) {
        fileRefs.delete(key);
        fileRefs.set(newKey, fileRef);
      }
    }
  } else {
    fileMap.delete(oldN);
    fileMap.set(newN, { ...oldEntry, path: newN, name: newN.split('/').pop() || '' });
    const fileRef = fileRefs.get(oldN);
    if (fileRef) {
      fileRefs.delete(oldN);
      fileRefs.set(newN, fileRef);
    }
  }
  if (roots.delete(oldN)) roots.add(newN);
  persistWorkspace();
}

/**
 * Create a blob URL from the stored File object for the given path.
 * Returns null if the file is not found or is a directory.
 */
export function createFileBlobUrl(path: string): string | null {
  const n = normalizePath(path);
  const fileRef = fileRefs.get(n);
  if (fileRef) return URL.createObjectURL(fileRef);
  // Case-insensitive fallback: try matching all keys against the path
  for (const [key, ref] of fileRefs) {
    if (key.toLowerCase() === n.toLowerCase()) return URL.createObjectURL(ref);
  }
  // Filename-only fallback: match by basename if nothing else worked
  const basename = n.split('/').pop()?.toLowerCase();
  if (basename) {
    for (const [key, ref] of fileRefs) {
      if (key.split('/').pop()?.toLowerCase() === basename) return URL.createObjectURL(ref);
    }
  }
  return null;
}

/** Clear all stored files */
export function reset(): void {
  fileMap = new Map();
  fileRefs = new Map();
  roots = new Set();
  try {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Ignore storage security failures in embedded browser previews.
  }
}

/** Return the previously opened browser workspace root, if one was saved. */
export function getWorkspaceRoot(): string | null {
  return [...roots][0] ?? null;
}

/** Get all stored paths (for debugging) */
export function getPaths(): string[] {
  return [...fileMap.keys()];
}

restoreWorkspace();
