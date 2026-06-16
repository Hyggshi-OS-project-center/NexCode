@echo off
REM ============================================
REM build-app-ARM.bat — Full build + package (arm64)
REM ============================================
setlocal

cd /d "%~dp0.."

echo [env 4GB] Setting environment variable to allow 4GB+ memory usage for Electron Builder...
set NODE_OPTIONS=--max-old-space-size=4096
if %errorlevel% neq 0 (
  echo [env 4GB] Setting environment variable FAILED
  exit /b %errorlevel%
)

echo [build-app-ARM] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app-ARM] Build FAILED
  exit /b %errorlevel%
)

echo [build-app-ARM] Packaging application (arm64)...
echo [build-app-ARM] Skipping native module rebuild (npmRebuild=false) — canvas is unused optional dep of pdfjs-dist
echo [build-app-ARM] Restricting to arm64 only (overriding win.target from package.json)
call npx electron-builder --win portable:arm64 nsis:arm64 --config.npmRebuild=false --config.nsis.include="scripts/installer-arm64.nsh" --config.nsis.artifactName="NexCode.IDE-${version}-Setup-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app-ARM] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-Setup-arm64.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Windows on ARM
echo.
echo [build-app-ARM] Build and pack (arm64) and portable complete.