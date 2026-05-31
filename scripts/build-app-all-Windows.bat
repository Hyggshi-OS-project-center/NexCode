@echo off
REM ============================================
REM build-app.bat — Full production build
REM ============================================
setlocal

cd /d "%~dp0.."

echo [build-app] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app] Build FAILED
  exit /b %errorlevel%
)

echo [build-app] Packaging application...
call npx electron-builder --win --x64 --config.nsis.artifactName="NexCode.IDE-${version}-Setup-${arch}.${ext}"
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