/**
 * Pack portable Windows exe into a fresh output folder (avoids locked app.asar in prior builds).
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

const targetLinux = process.argv.includes('--linux') || process.platform !== 'win32';
const platformArg = targetLinux ? '--linux AppImage' : '--win portable';
console.log(`Packing portable package for ${targetLinux ? 'linux' : process.platform} to ${outDir} ...`);

execSync(`npx electron-builder ${platformArg} --config.directories.output=${outDir}`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false' },
});

const files = fs.readdirSync(outAbs);
const portable = files.find((name) =>
  (!targetLinux && name.toLowerCase().includes('portable') && name.endsWith('.exe')) ||
  (targetLinux && name.endsWith('.AppImage'))
);

if (portable) {
  console.log(`\nDone. Portable package:\n  ${path.join(outAbs, portable)}`);
}

