#!/usr/bin/env bash
# ============================================
# test-dev.sh — Run full development test cycle
# ============================================
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[test-dev] Building then launching IDE in dev mode..."
npm run build
echo "[test-dev] Build OK — starting dev server..."
npm run dev