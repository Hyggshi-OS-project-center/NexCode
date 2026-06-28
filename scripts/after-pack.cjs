/**
 * afterPack hooks:
 * - win32:  Embed app icon into NexCode IDE.exe BEFORE NSIS/portable wrappers.
 * - linux:  Remove chrome-sandbox SUID helper to avoid "SUID sandbox helper … not configured correctly"
 *           errors on AppImage (FUSE mount prevents setting root:4755). --no-sandbox is already passed,
 *           but Chromium still fatally checks for the SUID binary.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  // ---- Windows: embed icon ----
  if (context.electronPlatformName === 'win32') {
    await embedIcon(context);
    return;
  }

  // ---- Linux: disable SUID sandbox helper ----
  if (context.electronPlatformName === 'linux') {
    removeChromeSandbox(context);
  }
};

/** Embed icon into the Windows executable (rcedit). */
async function embedIcon(context) {
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
}

/**
 * Remove or disable chrome-sandbox so that the SUID sandbox check does not
 * fatally abort on AppImage (where FUSE mounts prevent setting root:4755).
 */
function removeChromeSandbox(context) {
  const sandboxPath = path.join(context.appOutDir, 'chrome-sandbox');
  if (!fs.existsSync(sandboxPath)) {
    console.log('[afterPack] No chrome-sandbox found — nothing to remove.');
    return;
  }
  try {
    // Remove the binary entirely — Electron will fall back to namespace sandbox
    // and respect the --no-sandbox flag without crashing.
    fs.unlinkSync(sandboxPath);
    console.log(`[afterPack] Removed SUID sandbox helper: ${sandboxPath}`);
  } catch (err) {
    console.error(`[afterPack] Failed to remove chrome-sandbox: ${err.message}`);
  }
}
