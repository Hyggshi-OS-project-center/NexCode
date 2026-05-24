/**
 * Embed app icon into NexCode IDE.exe in win-unpacked BEFORE NSIS/portable wrappers are built.
 * Must not run rcedit on *-setup.exe or *-portable.exe — that breaks NSIS integrity checks.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const iconPath = path.join(root, 'build', 'icon.ico');
  const exeName = `${pkg.build?.win?.executableName || pkg.productName || 'NexCode IDE'}.exe`;
  const exePath = path.join(context.appOutDir, exeName);

  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] Missing build/icon.ico — run npm run icons');
    return;
  }
  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] App exe not found: ${exePath}`);
    return;
  }

  const { rcedit } = await import('rcedit');
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
  console.log(`[afterPack] Embedded icon into ${exePath}`);
};
