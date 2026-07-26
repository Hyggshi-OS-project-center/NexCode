#!/usr/bin/env bash
# ============================================
# build-app-all-linux-platform.sh — Build all Linux packages
# AppImage, .deb, and .rpm for universal Linux support
# ============================================
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_OPTIONS=--max-old-space-size=4096

# Check for required dependencies
echo "[build-app-all-linux] Checking dependencies..."
if ! command -v rpmbuild &> /dev/null; then
    echo "WARNING: rpmbuild is not installed. RPM package build will be skipped."
    echo
    echo "On Fedora/openSUSE, install with:"
    echo "  sudo dnf install rpm-build"
    echo "  sudo dnf install redhat-rpm-config"
    echo
    echo "On Ubuntu/Debian (for testing), install with:"
    echo "  sudo apt-get install rpm"
    echo
    BUILD_RPM=false
else
    BUILD_RPM=true
fi

if ! command -v fpm &> /dev/null; then
    echo "WARNING: fpm is not installed. electron-builder will use its bundled version."
    echo "For better results, install fpm: https://fpm.readthedocs.io/"
fi

echo "[build-app-all-linux] Dependencies check passed ✔"
echo
echo "============================================"
echo " Building NexCode IDE for all Linux platforms"
echo "============================================"
echo

VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")
echo "[build-app-all-linux] Version: $VERSION"

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
if [ "$BUILD_RPM" = true ]; then
    # NOTE: do NOT manually rewrite package.json's version here.
    # electron-builder has its own internal sanitizer that converts
    # the semver version (e.g. 3.5.7-Insider.6) into a valid RPM
    # version string when the "rpm" target is built. Overwriting
    # package.json ourselves breaks semver parsing and causes
    # "Invalid version" errors in app-builder-lib.
    npx electron-builder --linux --x64 \
      --config.npmRebuild=false \
      --config.linux.target="rpm" \
      --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.rpm"
    RPM_STATUS="✔ Built successfully"
else
    echo "[build-app-all-linux] SKIPPED — rpmbuild not available"
    RPM_STATUS="⚠ Skipped (rpmbuild not installed)"
fi
echo

echo "============================================"
echo " Output files:"
echo "============================================"
echo "  NexCode.IDE-$VERSION-x64.AppImage — Universal (AppImage)"
echo "  nexcode-ide-$VERSION-x64.deb — Debian/Ubuntu/Linux Mint"
echo "  NexCode.IDE-$VERSION-x64.rpm — Fedora/openSUSE ($RPM_STATUS)"
echo
echo "============================================"
echo "[build-app-all-linux] Build process completed"
echo "============================================"