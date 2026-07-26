#!/usr/bin/env bash
# ============================================
# build-app-all-linux-platform.sh — Build all Linux packages
# AppImage, .deb, and .rpm — for x64, arm64, and armv7l (32-bit ARM)
#
# NOTE: ia32 (x86 32-bit) is intentionally NOT built here.
# Electron dropped official Linux ia32 builds years ago
# (last available around Electron 19). If you need 32-bit x86
# Linux support you'll have to build Electron from source —
# not something electron-builder can do out of the box.
# ============================================
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_OPTIONS=--max-old-space-size=4096

# Architectures and package targets to build.
# arm64  = 64-bit ARM (Raspberry Pi 4/5, most modern ARM SBCs, Apple Silicon-via-Linux VMs)
# armv7l = 32-bit ARM (older Raspberry Pi, some embedded boards)
ARCHS=("x64" "arm64" "armv7l")
TARGETS=("AppImage" "deb" "rpm")

echo "[build-app-all-linux] Checking dependencies..."
if ! command -v rpmbuild &> /dev/null; then
    echo "WARNING: rpmbuild is not installed. RPM package builds will be skipped."
    echo
    echo "On Fedora/openSUSE, install with:"
    echo "  sudo dnf install rpm-build redhat-rpm-config"
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
echo " Architectures: ${ARCHS[*]}"
echo "============================================"
echo

VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")
echo "[build-app-all-linux] Version: $VERSION"

echo "[build-app-all-linux] Build source..."
npm run build
echo

# Track results for the final summary table
declare -A RESULTS

TOTAL_STEPS=0
for target in "${TARGETS[@]}"; do
  for arch in "${ARCHS[@]}"; do
    if [ "$target" = "rpm" ] && [ "$BUILD_RPM" != true ]; then
      continue
    fi
    TOTAL_STEPS=$((TOTAL_STEPS + 1))
  done
done

STEP=0
for target in "${TARGETS[@]}"; do
  for arch in "${ARCHS[@]}"; do
    key="${target}-${arch}"

    if [ "$target" = "rpm" ] && [ "$BUILD_RPM" != true ]; then
      RESULTS["$key"]="⚠ Skipped (rpmbuild not installed)"
      continue
    fi

    STEP=$((STEP + 1))
    echo "[build-app-all-linux] Step $STEP/$TOTAL_STEPS: Building $target for $arch..."

    # artifactName pattern includes \${arch} so files for different
    # architectures don't overwrite each other in dist/pack-out/
    case "$target" in
      AppImage)
        artifact_name="NexCode.IDE-\${version}-\${arch}.AppImage"
        ;;
      deb)
        artifact_name="nexcode-ide-\${version}-\${arch}.deb"
        ;;
      rpm)
        artifact_name="NexCode.IDE-\${version}-\${arch}.rpm"
        ;;
    esac

    if npx electron-builder --linux --"$arch" \
        --publish never \
        --config.npmRebuild=false \
        --config.linux.target="$target" \
        --config.linux.artifactName="$artifact_name"; then
      RESULTS["$key"]="✔ Built successfully"
    else
      RESULTS["$key"]="✗ Failed"
    fi
    echo
  done
done

echo "============================================"
echo " Output summary:"
echo "============================================"
for target in "${TARGETS[@]}"; do
  for arch in "${ARCHS[@]}"; do
    key="${target}-${arch}"
    printf "  %-10s %-8s %s\n" "$target" "$arch" "${RESULTS[$key]:-⚠ Unknown}"
  done
done
echo
echo "  Files are in: dist/pack-out/"
echo
echo "============================================"
echo "[build-app-all-linux] Build process completed"
echo "============================================"

# Fail the overall script if anything actually failed (not just skipped)
for status in "${RESULTS[@]}"; do
  if [[ "$status" == "✗ Failed"* ]]; then
    exit 1
  fi
done