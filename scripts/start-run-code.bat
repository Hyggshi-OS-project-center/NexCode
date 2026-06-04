@echo off
REM ============================================
REM start-run-code.bat — Start and run the code
REM ============================================
setlocal
cd /d "%~dp0.."

echo [start-run-code] Starting the application...

call npm run start

if %errorlevel% neq 0 (
  echo [start-run-code] Failed to start the application
  exit /b %errorlevel%
)

pause