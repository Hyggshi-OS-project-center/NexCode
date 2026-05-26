#!/usr/bin/env bash
# ============================================
# build-app.sh — Full production build
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-app] Step 1/2: Build source..."
npm run build

echo "[build-app] Step 2/2: Pack Electron app..."
npm run pack

echo "[build-app] DONE ✔"