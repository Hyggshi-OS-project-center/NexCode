/**
 * Generate build/icon.ico and src/renderer/public/favicon.ico from build/icon.svg
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'build', 'icon.svg');
const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'src', 'renderer', 'public');

/** Windows often blocks in-place overwrites (Explorer preview, AV, OneDrive). */
function safeWriteFile(filePath, data, retries = 8) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);

  fs.writeFileSync(tmpPath, data);

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true, maxRetries: 3, retryDelay: 100 });
      }
      fs.renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      lastError = err;
      const deadline = Date.now() + 150 * (attempt + 1);
      while (Date.now() < deadline) {
        /* spin-wait — short delays for file lock release */
      }
    }
  }

  try {
    fs.rmSync(tmpPath, { force: true });
  } catch {
    /* ignore */
  }
  throw lastError;
}

if (!fs.existsSync(svgPath)) {
  console.error('Missing build/icon.svg');
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const svg = fs.readFileSync(svgPath);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
);

const ico = await toIco(pngBuffers);
safeWriteFile(path.join(buildDir, 'icon.ico'), ico);

const favicon16 = await sharp(svg).resize(16, 16).png().toBuffer();
const favicon32 = await sharp(svg).resize(32, 32).png().toBuffer();
const faviconIco = await toIco([favicon16, favicon32]);
safeWriteFile(path.join(publicDir, 'favicon.ico'), faviconIco);

// PNG for window icon in dev / optional Linux
const pngPath = path.join(buildDir, 'icon.png');
safeWriteFile(pngPath, await sharp(svg).resize(256, 256).png().toBuffer());

console.log('Generated build/icon.ico, build/icon.png, src/renderer/public/favicon.ico');
