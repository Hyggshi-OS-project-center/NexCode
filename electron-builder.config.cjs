/**
 * electron-builder config – file associations use unique ProgIDs from scripts/file-associations.cjs
 */
const associations = require('./scripts/file-associations.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  /**
   * Rebuild native modules for the correct Electron ABI.
   * node-pty is a native module that must be rebuilt per Electron version.
   * Other modules (canvas from pdfjs-dist) are not used and can be skipped
   * by omitting them here — they will be excluded via files config.
   */
  npmRebuild: true,
  buildDependenciesFromSource: false,

  /**
   * node-pty ships a native .node binary. Electron cannot dlopen/require
   * native addons from inside app.asar, so it must be unpacked to
   * app.asar.unpacked at build time — otherwise the app fails on launch
   * with "Cannot find module './prebuilds/linux-x64//pty.node'".
   */
  asarUnpack: [
    'node_modules/node-pty/**/*'
  ],

  fileAssociations: associations.flatMap((item) =>
    (Array.isArray(item.ext) ? item.ext : [item.ext]).map((ext) => ({
      ext,
      name: item.progId,
      description: item.description,
      icon: item.icon,
    }))
  ),
};
