/**
 * Persistent "Open Recent" file list.
 * - Stored in `userData/recent-files.json` (max 10 entries, MRU order, no duplicates).
 * - Pure-Node implementation so it works in main without dragging in extra deps.
 */
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

const RECENT_FILES_LIMIT = 10;
const STORAGE_NAME = 'recent-files.json';

interface RecentFilesState {
  files: string[];
}

let cache: RecentFilesState = { files: [] };
let loadPromise: Promise<void> | null = null;

function storagePath(): string {
  return path.join(app.getPath('userData'), STORAGE_NAME);
}

async function load(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await fs.readFile(storagePath(), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<RecentFilesState>;
      if (Array.isArray(parsed.files)) {
        cache = { files: parsed.files.filter((f) => typeof f === 'string').slice(0, RECENT_FILES_LIMIT) };
      }
    } catch {
      cache = { files: [] };
    }
  })();
  return loadPromise;
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(storagePath()), { recursive: true });
    await fs.writeFile(storagePath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    /* Non-fatal — keep the in-memory list. */
  }
}

/** Return the current recent-files list (most-recent first). */
export function getRecentFiles(): string[] {
  return [...cache.files];
}

/**
 * Record that a file was opened or saved.
 * Moves it to the top of the list, drops duplicates, and trims to the limit.
 */
export function pushRecentFile(filePath: string): void {
  if (!filePath) return;
  const normalized = path.resolve(filePath);
  const filtered = cache.files.filter((f) => path.resolve(f) !== normalized);
  filtered.unshift(normalized);
  cache.files = filtered.slice(0, RECENT_FILES_LIMIT);
  void persist();
}

/** Forget a specific path (e.g., after a rename). */
export function removeRecentFile(filePath: string): void {
  if (!filePath) return;
  const normalized = path.resolve(filePath);
  const before = cache.files.length;
  cache.files = cache.files.filter((f) => path.resolve(f) !== normalized);
  if (cache.files.length !== before) void persist();
}

/** Wipe the entire list. */
export function clearRecentFiles(): void {
  cache.files = [];
  void persist();
}

export const RECENT_FILES_LIMIT_VALUE = RECENT_FILES_LIMIT;

app.whenReady().then(() => void load());
