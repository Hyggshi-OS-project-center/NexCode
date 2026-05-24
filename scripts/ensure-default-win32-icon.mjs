/**
 * Ensure src/icons/win32/default.ico exists (explorer + NSIS use it for generic text).
 * If missing, copy from another bundled icon so builds do not fail.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src', 'icons', 'win32');
const defaultPath = path.join(srcDir, 'default.ico');

if (!fs.existsSync(srcDir)) {
  console.warn('No src/icons/win32 — skipping default.ico check');
  process.exit(0);
}

if (fs.existsSync(defaultPath)) {
  process.exit(0);
}

const fallbacks = ['javascript.ico', 'config.ico', 'json.ico', 'html.ico'];
for (const name of fallbacks) {
  const src = path.join(srcDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, defaultPath);
    console.warn(`default.ico was missing — created from ${name} (replace with a dedicated asset if you want).`);
    process.exit(0);
  }
}

console.warn(
  'src/icons/win32/default.ico is missing and no fallback .ico was found. Add default.ico (or any other .ico) before packaging.',
);
process.exit(0);
