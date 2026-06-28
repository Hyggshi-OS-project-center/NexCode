@echo off
REM ============================================
REM run-web.bat — Run the web application
REM ============================================
setlocal
cd /d "%~dp0.."

echo [run-web] Starting the web application...

call npm run dev:vite

if %errorlevel% neq 0 (
  echo [run-web] Failed to start the application
  exit /b %errorlevel%
)

pause