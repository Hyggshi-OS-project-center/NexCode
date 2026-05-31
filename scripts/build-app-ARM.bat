@echo off
REM ============================================
REM build-app-ARM.bat — Full build + package (arm64)
REM ============================================
setlocal

cd /d "%~dp0.."

echo [build-app-ARM] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app-ARM] Build FAILED
  exit /b %errorlevel%
)

echo [build-app-ARM] Packaging application (arm64)...
call npx electron-builder --win --arm64 --config.nsis.artifactName="NexCode.IDE-${version}-Setup-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app-ARM] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-Setup-arm64.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Windows on ARM
echo.
echo [build-app-ARM] Build and pack (arm64) complete.