/**
 * Web file download and ZIP compression utility for NexCode IDE.
 * Allows downloading individual files, compressing folders to .zip,
 * exporting the entire workspace, and importing/extracting .zip files.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

/**
 * Trigger a browser file download using a Blob and anchor element.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Trigger download of raw text content.
 */
export function downloadTextContent(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

/**
 * Download a single file from the IDE filesystem.
 */
export async function downloadSingleFile(filePath: string, customName?: string): Promise<void> {
  const filename = customName || filePath.split(/[/\\]/).pop() || 'downloaded-file';
  try {
    const content = await window.electronAPI.readFile(filePath);
    downloadTextContent(content, filename);
  } catch (err) {
    console.error('[WebZipExport] Failed to download single file:', err);
    alert(`Failed to download file: ${(err as Error).message}`);
  }
}

interface ZipFileTree {
  [path: string]: Uint8Array;
}

/**
 * Recursively collect all files under a directory.
 */
async function collectFilesRecursively(
  dirPath: string,
  basePath: string,
  zipTree: ZipFileTree,
): Promise<void> {
  try {
    const entries = await window.electronAPI.readDir(dirPath, { showHidden: false });
    for (const entry of entries) {
      // Ignore common heavy/unwanted folders when creating zips
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vite') {
        continue;
      }

      const fullPath = entry.path;
      // Compute relative path inside zip
      const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '');
      const normalizedFull = fullPath.replace(/\\/g, '/');
      let relativePath = normalizedFull.startsWith(normalizedBase)
        ? normalizedFull.slice(normalizedBase.length).replace(/^\/+/, '')
        : entry.name;

      if (entry.isDirectory) {
        await collectFilesRecursively(fullPath, basePath, zipTree);
      } else {
        try {
          const content = await window.electronAPI.readFile(fullPath);
          zipTree[relativePath] = strToU8(content);
        } catch (fileErr) {
          console.warn(`[WebZipExport] Skipped reading file ${fullPath}:`, fileErr);
        }
      }
    }
  } catch (dirErr) {
    console.error(`[WebZipExport] Failed to read directory ${dirPath}:`, dirErr);
  }
}

/**
 * Compress a directory and its contents into a .zip file and trigger download.
 */
export async function downloadFolderAsZip(
  folderPath: string,
  customZipName?: string,
): Promise<void> {
  const folderName = customZipName || folderPath.split(/[/\\]/).filter(Boolean).pop() || 'workspace';
  const zipFileName = folderName.endsWith('.zip') ? folderName : `${folderName}.zip`;

  showDownloadToast(`📦 Compressing ${folderName} to ZIP...`);

  const zipTree: ZipFileTree = {};
  await collectFilesRecursively(folderPath, folderPath, zipTree);

  const fileCount = Object.keys(zipTree).length;
  if (fileCount === 0) {
    showDownloadToast(`⚠ Folder is empty or contains no readable files.`);
    return;
  }

  try {
    const zippedBuffer = zipSync(zipTree, { level: 6 });
    const blob = new Blob([zippedBuffer], { type: 'application/zip' });
    triggerBlobDownload(blob, zipFileName);
    showDownloadToast(`✔ Downloaded ${zipFileName} (${fileCount} files)`);
  } catch (err) {
    console.error('[WebZipExport] Compression failed:', err);
    showDownloadToast(`✖ ZIP compression failed: ${(err as Error).message}`);
  }
}

/**
 * Export the entire current workspace as a .zip archive.
 */
export async function exportWorkspaceAsZip(workspacePath: string | null): Promise<void> {
  const targetPath = workspacePath || '/';
  const name = workspacePath ? workspacePath.split(/[/\\]/).filter(Boolean).pop() : 'NexCode-Workspace';
  await downloadFolderAsZip(targetPath, name);
}

/**
 * Extract and import files from an uploaded .zip archive into the current workspace.
 */
export async function importZipArchive(
  zipFile: File,
  targetRootDir = '/',
): Promise<{ extractedCount: number; error?: string }> {
  try {
    const buffer = await zipFile.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    let count = 0;

    const baseDir = targetRootDir.replace(/\\/g, '/').replace(/\/+$/, '');

    for (const [relPath, fileBytes] of Object.entries(unzipped)) {
      if (relPath.endsWith('/')) {
        // Directory entry
        const dirPath = baseDir ? `${baseDir}/${relPath.slice(0, -1)}` : relPath.slice(0, -1);
        await window.electronAPI.mkdir(dirPath);
      } else {
        // File entry
        const fullPath = baseDir ? `${baseDir}/${relPath}` : relPath;
        // Ensure parent directory exists
        const parent = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parent) {
          await window.electronAPI.mkdir(parent);
        }
        const textContent = strFromU8(fileBytes);
        await window.electronAPI.writeFile(fullPath, textContent);
        count++;
      }
    }

    showDownloadToast(`✔ Imported ${count} files from ${zipFile.name}`);
    return { extractedCount: count };
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[WebZipExport] Failed to import ZIP:', err);
    showDownloadToast(`✖ Failed to import ZIP: ${msg}`);
    return { extractedCount: 0, error: msg };
  }
}

/**
 * Display a subtle temporary toast notification in the UI.
 */
function showDownloadToast(message: string): void {
  const existing = document.getElementById('web-zip-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'web-zip-toast';
  toast.className = 'web-zip-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
