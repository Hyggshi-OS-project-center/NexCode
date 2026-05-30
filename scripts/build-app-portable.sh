#!/usr/bin/env bash
# ============================================
# build-app-portable.sh — Build + package portable
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-app-portable] Building and packaging portable..."
npm run pack:portable

echo "[build-app-portable] Portable package created."