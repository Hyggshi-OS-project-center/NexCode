@echo off
REM ============================================
REM code.bat — Run the IDE in development mode
REM ============================================
setlocal
cd /d "%~dp0.."
echo [code] Starting dev environment...
call npm run dev
if %errorlevel% neq 0 (
  echo [code] FAILED
  pause
  exit /b %errorlevel%
)