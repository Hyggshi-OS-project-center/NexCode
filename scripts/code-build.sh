#!/usr/bin/env bash
# ============================================
# code-build.sh — Build TypeScript source only
# ============================================
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[code-build] Compiling TypeScript..."
npm run build:main
npm run build:renderer
echo "[code-build] Source build complete."