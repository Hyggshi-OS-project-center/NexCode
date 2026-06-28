#!/usr/bin/env bash
# ============================================
# build-app-portable.sh — Build + package portable
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-app-portable] Setting up 4GB memory for Node.js..."
export NODE_OPTIONS="--max-old-space-size=4096"

echo "[build-app-portable] Building and packaging portable..."
npm run icons && npm run buildfast:Nocompile && npm run build:main && node scripts/pack-portable.mjs --linux

echo "[build-app-portable] Portable package created."