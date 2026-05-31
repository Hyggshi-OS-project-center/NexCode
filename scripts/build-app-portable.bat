@echo off
REM ============================================
REM build-app-portable.bat — Build + package portable
REM ============================================
setlocal
cd /d "%~dp0.."

echo [build-app-portable] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app-portable] Build FAILED
  exit /b %errorlevel%
)

echo [build-app-portable] Packaging portable application...
call npx electron-builder --win portable --config.portable.artifactName="NexCode.IDE-${version}-portable-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app-portable] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-portable-x64.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Portable version for Windows (no installation required)
echo.
echo [build-app-portable] Portable package created.