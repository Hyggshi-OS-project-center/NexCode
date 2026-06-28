#!/bin/bash
# ============================================
# build-app.sh — Full production build
# ============================================

set -e

cd "$(dirname "$0")/.."

echo "[env 4GB] Setting environment variable to allow 4GB+ memory usage for Electron Builder..."

export NODE_OPTIONS=--max-old-space-size=4096

echo "[build-app] Building icons and compiling source..."
npm run build

echo "[build-app] Packaging application..."

echo "[build-app] Skipping native module rebuild (npmRebuild=false) -- canvas is unused optional dep of pdfjs-dist"

npx electron-builder --win --x64 \
  --config.npmRebuild=false \
  --config.nsis.artifactName="NexCode.IDE-\${version}-Setup-\${arch}.\${ext}"

echo
echo " Output file:"

FILENAME=$(node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-Setup-x64.exe')")

echo "  $FILENAME — Windows 64-bit (recommended)"
echo

echo "[build-app] Build and pack complete."