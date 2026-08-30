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
  fileAssociations: associations.flatMap((item) =>
    (Array.isArray(item.ext) ? item.ext : [item.ext]).map((ext) => ({
      ext,
      name: item.progId,
      description: item.description,
      icon: item.icon,
    }))
  ),
};
