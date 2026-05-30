/**
 * Build Linux AppImage and deb packages into a fresh output folder.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = `dist/pack-${stamp}`;
const outAbs = path.join(root, outDir);

console.log(`Building Linux packages to ${outDir} ...`);

execSync(`npx electron-builder --linux --config.directories.output=${outDir}`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false' },
});

try {
  const files = fs.readdirSync(outAbs);
  const appImage = files.find((name) => name.endsWith('.AppImage'));
  const deb = files.find((name) => name.endsWith('.deb'));

  if (appImage) {
    console.log(`\nDone. AppImage:\n  ${path.join(outAbs, appImage)}`);
  }
  if (deb) {
    console.log(`deb package:\n  ${path.join(outAbs, deb)}`);
  }
} catch (err) {
  console.error(`Error reading output directory: ${err.message}`);
}
