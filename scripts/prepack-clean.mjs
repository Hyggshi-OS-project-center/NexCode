/**
 * Close running NexCode builds and remove stale pack output so electron-builder can rewrite app.asar.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform === 'win32') {
  for (const image of ['NexCode IDE.exe', 'NexCode IDE-1.0.0-portable.exe']) {
    try {
      execSync(`taskkill /F /IM "${image}" /T`, { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
}

function rmSafe(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.warn(`Could not remove ${target}: ${err.message}`);
    console.warn('Close NexCode IDE and any Explorer window on dist/pack-out, then run pack again.');
  }
}

rmSafe(path.join(root, 'dist', 'pack-out', 'win-unpacked'));
