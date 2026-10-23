#!/usr/bin/env node
/**
 * rebuild-native-offline.mjs
 * Rebuilds node-pty for Electron by serving pre-downloaded headers
 * via a local HTTP server, bypassing Node.js TLS connectivity issues.
 * Usage: npm run rebuild:native:offline
 */

import { execSync } from 'child_process';
import { createServer } from 'http';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const raw = pkg.devDependencies?.electron || pkg.dependencies?.electron || '43.8.3';
const version = raw.replace(/[^0-9.]/g, '');

const HEADER_URL = `https://artifacts.electronjs.org/headers/dist/v${version}`;
const CACHE_DIR = join(tmpdir(), 'electron-headers', `v${version}`);
const FILES = [`node-v${version}-headers.tar.gz`, 'SHASUMS256.txt'];

mkdirSync(CACHE_DIR, { recursive: true });
for (const file of FILES) {
  const dest = join(CACHE_DIR, file);
  if (!existsSync(dest)) {
    console.log(`[rebuild-native] Downloading ${file}...`);
    execSync(`curl -sL "${HEADER_URL}/${file}" -o "${dest}"`, { stdio: 'inherit' });
  } else {
    console.log(`[rebuild-native] Cached: ${file}`);
  }
}

const MIME = { '.gz': 'application/gzip', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  const parts = req.url.split('/').filter(Boolean);
  const filename = parts[parts.length - 1];
  const filePath = join(CACHE_DIR, filename);
  if (existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': MIME[extname(filename)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found: ' + filename);
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const localUrl = `http://127.0.0.1:${port}/`;
console.log(`[rebuild-native] Serving headers at ${localUrl}`);
console.log(`[rebuild-native] Rebuilding node-pty for Electron ${version}...`);

try {
  execSync(
    `npx @electron/rebuild --version ${version} --module-dir node_modules/node-pty --dist-url "${localUrl}"`,
    { stdio: 'inherit', cwd: ROOT }
  );
  console.log('[rebuild-native] ✅ Done!');
} finally {
  server.close();
}
