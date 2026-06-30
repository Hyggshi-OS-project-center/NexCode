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
    # electron-builder đọc version thẳng từ package.json và tự convert - → ~
    # trước khi pass cho fpm, nên --config.extraMetadata.version không có tác dụng.
    # Fix: patch package.json tạm thời, build xong restore lại.
    RPM_VERSION=$(echo "$VERSION" | sed 's/[-~]/./g' | tr '[:upper:]' '[:lower:]')
    echo "[build-app-all-linux] RPM version sanitized: $VERSION → $RPM_VERSION"

    # Backup package.json
    cp package.json package.json.rpm-bak

    # Trap để đảm bảo luôn restore dù build lỗi/crash
    trap 'mv package.json.rpm-bak package.json 2>/dev/null || true' EXIT

    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      pkg.version = '$RPM_VERSION';
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "[build-app-all-linux] Patched package.json version temporarily"

    npx electron-builder --linux --x64 \
      --config.npmRebuild=false \
      --config.linux.target="rpm" \
      --config.linux.artifactName="NexCode.IDE-\${version}-\${arch}.rpm"

    # Restore package.json
    mv package.json.rpm-bak package.json
    trap - EXIT
    echo "[build-app-all-linux] Restored package.json ✔"

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