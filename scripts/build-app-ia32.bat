@echo off
REM ============================================
REM build-app-ia32.bat — Full build + package (ia32)
REM ============================================
setlocal

cd /d "%~dp0.."

echo [build-app-ia32] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app-ia32] Build FAILED
  exit /b %errorlevel%
)

echo [build-app-ia32] Packaging application (ia32)...
call npx electron-builder --win --ia32 --config.nsis.include="scripts/installer-ia32.nsh" --config.nsis.artifactName="NexCode.IDE-${version}-Setup-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app-ia32] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-Setup-ia32.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Windows 32-bit
echo.
echo [build-app-ia32] Build and pack (ia32) complete.