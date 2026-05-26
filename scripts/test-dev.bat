@echo off
REM ============================================
REM test-dev.bat — Run full development test cycle
REM ============================================
setlocal
cd /d "%~dp0.."
echo [test-dev] Building then launching IDE in dev mode...
call npm run build
if %errorlevel% neq 0 (
  echo [test-dev] Build FAILED
  exit /b %errorlevel%
)
echo [test-dev] Build OK — starting dev server...
npm run dev