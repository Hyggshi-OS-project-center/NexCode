/**
 * Copy src/icons/win32/*.ico into build/win32 for electron-builder file associations.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src', 'icons', 'win32');
const destDir = path.join(root, 'build', 'win32');

if (!fs.existsSync(srcDir)) {
  console.warn('No src/icons/win32 directory — skipping copy');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

let count = 0;
for (const name of fs.readdirSync(srcDir)) {
  if (!name.toLowerCase().endsWith('.ico')) continue;
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  count++;
}

console.log(`Copied ${count} file association icon(s) to build/win32/`);
