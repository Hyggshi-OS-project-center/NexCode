#!/usr/bin/env bash
# ============================================
# build-app-all-linux-platform.sh — Build all Linux packages
# AppImage, .deb, and .rpm for universal Linux support
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

export NODE_OPTIONS=--max-old-space-size=4096

echo "============================================"
echo " Building NexCode IDE for all Linux platforms"
echo "============================================"
echo

echo "[build-app-all-linux] Step 1/4: Build source..."
npm run build

echo
echo "[build-app-all-linux] Step 2/4: Building AppImage (universal, works on most distros)..."
npx electron-builder --linux --x64 \
  --config.npmRebuild=false \
  --config.linux.target="AppImage" \
  --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.AppImage"

echo
echo "[build-app-all-linux] Step 3/4: Building .deb package (Debian/Ubuntu/Linux Mint)..."
npx electron-builder --linux --x64 \
  --config.npmRebuild=false \
  --config.linux.target="deb" \
  --config.linux.artifactName="nexcode-ide-\${version}-\${arch}.deb"

echo
echo "[build-app-all-linux] Step 4/4: Building .rpm package (Fedora/openSUSE)..."
npx electron-builder --linux --x64 \
  --config.npmRebuild=false \
  --config.linux.target="rpm" \
  --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.rpm"

echo
echo "============================================"
echo " Output files:"
echo "============================================"

VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")

echo "  NexCode.IDE-$VERSION-x64.AppImage — Universal (AppImage)"
echo "  nexcode-ide-$VERSION-x64.deb — Debian/Ubuntu/Linux Mint"
echo "  NexCode.IDE-$VERSION-x64.rpm — Fedora/openSUSE"
echo
echo "============================================"
echo "[build-app-all-linux] All Linux packages built successfully ✔"
echo "============================================"