/**
 * Build NSIS setup installer into a fresh output folder.
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

console.log(`Building installer to ${outDir} ...`);

execSync(`npx electron-builder --win nsis --config.directories.output=${outDir}`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false' },
});

const setup = fs.readdirSync(outAbs).find((name) => name.toLowerCase().includes('setup') && name.endsWith('.exe'));

if (setup) {
  console.log(`\nDone. Run installer:\n  ${path.join(outAbs, setup)}`);
}
