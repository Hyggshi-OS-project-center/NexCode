#!/usr/bin/env bash
# ============================================
# build-app-linux.sh — Build + package for Linux (AppImage & deb)
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-app-linux] Step 1/2: Build source..."
npm run build

echo "[build-app-linux] Step 2/2: Pack Electron app for Linux..."
npm run pack:linux

echo "[build-app-linux] DONE ✔"
