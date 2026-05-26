#!/usr/bin/env bash
# ============================================
# build-app.sh — Full production build
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-app] Building icons and compiling source..."
npm run build

echo "[build-app] Packaging application..."
npm run pack

echo "[build-app] Build and pack complete."