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

  return [...roots][0] || '/';
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
    return text;
  }

  // Fallback: try blobUrl
  if (entry.blobUrl) {
    const resp = await fetch(entry.blobUrl);
    const text = await resp.text();
    entry.content = text;
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
    if (!key.startsWith(prefix) || key === n) continue;
    const rest = key.substring(prefix.length);
    const firstSlash = rest.indexOf('/');
    const childName = firstSlash >= 0 ? rest.substring(0, firstSlash) : rest;

    if (!entries.has(childName)) {
      entries.set(childName, {
        name: childName,
        path: prefix + childName,
        isDirectory: firstSlash >= 0 || (entry.isDirectory && rest === childName),
        size: firstSlash >= 0 ? 0 : entry.size,
        mtimeMs: firstSlash >= 0 ? entry.mtimeMs : entry.mtimeMs,
        content: entry.content,
        blobUrl: entry.blobUrl,
      });
    }
  }

  return [...entries.values()];
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
}

/** Delete a file */
export function unlink(path: string): void {
  const n = normalizePath(path);
  fileMap.delete(n);
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
    }
  } else {
    fileMap.delete(oldN);
    fileMap.set(newN, { ...oldEntry, path: newN, name: newN.split('/').pop() || '' });
  }
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
  roots = new Set();
}

/** Get all stored paths (for debugging) */
export function getPaths(): string[] {
  return [...fileMap.keys()];
}