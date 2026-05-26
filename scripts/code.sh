#!/usr/bin/env bash
# ============================================
# code.sh — Run the IDE in development mode
# ============================================
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[code] Starting dev environment..."
npm run dev