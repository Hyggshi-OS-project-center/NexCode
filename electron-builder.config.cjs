/**
 * electron-builder config – file associations use unique ProgIDs from scripts/file-associations.cjs
 */
const associations = require('./scripts/file-associations.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  fileAssociations: associations.flatMap((item) =>
    (Array.isArray(item.ext) ? item.ext : [item.ext]).map((ext) => ({
      ext,
      name: item.progId,
      description: item.description,
      icon: item.icon,
    }))
  ),
};
