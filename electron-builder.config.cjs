/**
 * electron-builder config – file associations use unique ProgIDs from scripts/file-associations.cjs
 */
const associations = require('./scripts/file-associations.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  /**
   * Skip rebuilding native modules (canvas, an unused optional dep of pdfjs-dist).
   * Rebuilding fails on this machine due to: space in project path, missing GTK/Cairo
   * development libraries, and missing MSVC v143 build tools.
   * canvas is never imported by the app itself.
   */
  npmRebuild: false,
  fileAssociations: associations.flatMap((item) =>
    (Array.isArray(item.ext) ? item.ext : [item.ext]).map((ext) => ({
      ext,
      name: item.progId,
      description: item.description,
      icon: item.icon,
    }))
  ),
};
