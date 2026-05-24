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

console.log(`Packing to ${outDir} ...`);

execSync(`npx electron-builder --win portable --config.directories.output=${outDir}`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false' },
});

const portable = fs
  .readdirSync(outAbs)
  .find((name) => name.toLowerCase().includes('portable') && name.endsWith('.exe'));

if (portable) {
  console.log(`\nDone. Run:\n  ${path.join(outAbs, portable)}`);
}
