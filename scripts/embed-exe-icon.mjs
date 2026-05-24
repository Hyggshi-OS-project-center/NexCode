/**
 * Manual fallback: embed icon only into win-unpacked/NexCode IDE.exe.
 * Do NOT patch *-setup.exe or *-portable.exe (breaks NSIS integrity).
 * Normal builds use scripts/after-pack.cjs via electron-builder afterPack.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconPath = path.join(root, 'build', 'icon.ico');

if (!fs.existsSync(iconPath)) {
  console.error('Missing build/icon.ico — run: npm run icons');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const exeName = `${pkg.build?.win?.executableName || pkg.productName || 'NexCode IDE'}.exe`;

function findAppExe(searchRoots) {
  for (const rootDir of searchRoots) {
    const candidate = path.join(rootDir, 'win-unpacked', exeName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const packOut = process.env.PACK_OUT;
const searchRoots = packOut
  ? [packOut]
  : [
      path.join(root, 'dist', 'pack-out'),
      ...(fs.existsSync(path.join(root, 'dist'))
        ? fs
            .readdirSync(path.join(root, 'dist'))
            .filter((name) => name.startsWith('pack-'))
            .map((name) => path.join(root, 'dist', name))
            .sort()
            .reverse()
        : []),
    ];

const exePath = findAppExe(searchRoots);

if (!exePath) {
  console.error('No win-unpacked app exe found — run electron-builder first.');
  process.exit(1);
}

await rcedit(exePath, {
  icon: iconPath,
  'file-version': pkg.version,
  'product-version': pkg.version,
  'version-string': {
    FileDescription: pkg.productName || pkg.name,
    ProductName: pkg.productName || pkg.name,
    InternalFilename: pkg.build?.win?.executableName || pkg.productName || 'NexCode IDE',
  },
});

console.log(`Embedded icon into ${exePath}`);
