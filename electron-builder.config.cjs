/**
 * electron-builder config — file associations use unique ProgIDs from scripts/file-associations.cjs
 */
const associations = require('./scripts/file-associations.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  fileAssociations: associations.map((item) => ({
    ext: item.ext,
    name: item.progId,
    description: item.description,
    icon: item.icon,
  })),
};
