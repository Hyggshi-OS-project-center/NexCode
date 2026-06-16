@echo off
REM ============================================
REM build-app.bat — Full production build
REM ============================================
setlocal

cd /d "%~dp0.."

echo [env 4GB] Setting environment variable to allow 4GB+ memory usage for Electron Builder...
set NODE_OPTIONS=--max-old-space-size=4096
if %errorlevel% neq 0 (
  echo [env 4GB] Setting environment variable FAILED
  exit /b %errorlevel%
)

echo [build-app] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app] Build FAILED
  exit /b %errorlevel%
)

echo [build-app] Packaging application...

echo [build-app] Skipping native module rebuild (npmRebuild=false) -- canvas is unused optional dep of pdfjs-dist
call npx electron-builder --win --x64 --config.npmRebuild=false --config.nsis.artifactName="NexCode.IDE-${version}-Setup-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-Setup-x64.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Windows 64-bit (recommended)
echo.
echo [build-app] Build and pack complete.