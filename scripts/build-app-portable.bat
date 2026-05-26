@echo off
REM ============================================
REM build-app-portable.bat — Build + package portable
REM ============================================
setlocal
cd /d "%~dp0.."
echo [build-app-portable] Building and packaging portable...
call npm run pack:portable
if %errorlevel% neq 0 (
  echo [build-app-portable] FAILED
  exit /b %errorlevel%
)
echo [build-app-portable] Portable package created.