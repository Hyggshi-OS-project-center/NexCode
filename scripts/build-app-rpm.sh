#!/usr/bin/env bash
# ============================================
# build-app-rpm.sh — Build + package for RPM (Fedora/openSUSE)
# ============================================
set -euo pipefail

cd "$(dirname "$0")/.."

export NODE_OPTIONS=--max-old-space-size=4096

# Check for required dependencies
echo "[build-app-rpm] Checking dependencies..."

if ! command -v rpmbuild &> /dev/null; then
    echo "ERROR: rpmbuild is not installed. This is required for building RPM packages."
    echo
    echo "On Fedora/openSUSE, install with:"
    echo "  sudo dnf install rpm-build"
    echo "  sudo dnf install redhat-rpm-config"
    echo
    echo "On Ubuntu/Debian (for testing), install with:"
    echo "  sudo apt-get install rpm"
    echo
    exit 1
fi

if ! command -v fpm &> /dev/null; then
    echo "WARNING: fpm is not installed. electron-builder will use its bundled version."
    echo "For better results, install fpm: https://fpm.readthedocs.io/"
fi

echo "[build-app-rpm] Dependencies check passed ✔"
echo

echo "[build-app-rpm] Step 1/3: Build source..."
npm run build

echo "[build-app-rpm] Step 2/3: Pack Electron app for Linux RPM..."
npm run pack:linux

echo "[build-app-rpm] Step 3/3: Building RPM package..."

# Sanitize version for RPM (convert - and ~ to ., lowercase pre-release)
VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")
RPM_VERSION=$(echo "$VERSION" | sed 's/[-~]/./g' | tr '[:upper:]' '[:lower:]')

# Backup and patch package.json temporarily
cp package.json package.json.rpm-bak
trap 'mv package.json.rpm-bak package.json 2>/dev/null || true' EXIT

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$RPM_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

npx electron-builder --linux --rpm --x64 \
  --config.npmRebuild=false \
  --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.rpm"

# Restore package.json
mv package.json.rpm-bak package.json
trap - EXIT

echo
echo "[build-app-rpm] Output file:"

FILENAME=$(node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-x64.rpm')")

echo "  $FILENAME — RPM package for Fedora/openSUSE (x64)"
echo

echo "[build-app-rpm] DONE ✔"
