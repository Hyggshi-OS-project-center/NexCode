@echo off
REM ============================================
REM build-app.bat — Full production build
REM ============================================
setlocal
cd /d "%~dp0.."
echo [build-app] Building icons and compiling source...
call npm run build
if %errorlevel% neq 0 (
  echo [build-app] FAILED
  exit /b %errorlevel%
)
echo [build-app] Build complete.