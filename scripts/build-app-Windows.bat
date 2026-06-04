@echo off
REM ============================================
REM build-app-Windows.bat — Build + package Windows version
REM ============================================
setlocal
cd /d "%~dp0.."

echo [build-app] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app] Build FAILED
  exit /b %errorlevel%
)

echo [build-app-pack] Packaging Windows application...
call npm run pack --win --config.portable.artifactName="NexCode.IDE-${version}-portable-${arch}.${ext}"
if %errorlevel% neq 0 (
  echo [build-app-pack] Pack FAILED
  exit /b %errorlevel%
)

echo.
echo  Output file:
for /f "tokens=*" %%i in ('node -e "const p=require('./package.json'); console.log('NexCode.IDE-' + p.version + '-portable-x64.exe')"') do set FILENAME=%%i
echo   %FILENAME% — Portable version for Windows (no installation required)
echo.
echo [build-app-pack] Windows package created.