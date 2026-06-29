#!/usr/bin/env bash
# ============================================
# build-app-rpm.sh — Build + package for RPM (Fedora/openSUSE)
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

export NODE_OPTIONS=--max-old-space-size=4096


echo "[build-app-rpm] Step 1/3: Build source..."
npm run build

echo "[build-app-rpm] Step 2/3: Pack Electron app for Linux RPM..."
npm run pack:linux

echo "[build-app-rpm] Step 3/3: Building RPM package..."
npx electron-builder --linux --rpm --x64 \
  --config.npmRebuild=false \
  --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.rpm"

echo
echo "[build-app-rpm] Output file:"

FILENAME=$(node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-x64.rpm')")

echo "  $FILENAME — RPM package for Fedora/openSUSE (x64)"
echo

echo "[build-app-rpm] DONE ✔"