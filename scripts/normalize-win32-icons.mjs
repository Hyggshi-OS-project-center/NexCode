/**
 * Rebuild src/icons/win32/*.ico with standard sizes and a transparent background.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';
import decodeIco from 'decode-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src', 'icons', 'win32');
const sizes = [16, 24, 32, 48, 256];

function safeWrite(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true, maxRetries: 3, retryDelay: 100 });
  }
  fs.renameSync(tmp, filePath);
}

function largestFrame(frames) {
  return frames.reduce((best, frame) => {
    const area = frame.width * frame.height;
    return area > best.width * best.height ? frame : best;
  }, frames[0]);
}

async function frameToPngBuffer(frame) {
  if (frame.type === 'png') {
    return sharp(Buffer.from(frame.data)).png().toBuffer();
  }
  return sharp(Buffer.from(frame.data), {
    raw: { width: frame.width, height: frame.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

if (!fs.existsSync(srcDir)) {
  console.warn('No src/icons/win32 — skipping ICO normalization');
  process.exit(0);
}

let count = 0;
for (const name of fs.readdirSync(srcDir)) {
  if (!name.toLowerCase().endsWith('.ico')) continue;

  const filePath = path.join(srcDir, name);
  try {
    const frames = decodeIco(fs.readFileSync(filePath));
    if (!frames.length) continue;

    const sourcePng = await frameToPngBuffer(largestFrame(frames));
    const pngBuffers = await Promise.all(
      sizes.map((size) =>
        sharp(sourcePng)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer(),
      ),
    );
    safeWrite(filePath, await toIco(pngBuffers));
    count++;
  } catch (err) {
    console.warn(`Skipped ${name}: ${err.message}`);
  }
}

console.log(`Normalized ${count} Win32 icon(s) in src/icons/win32/`);
