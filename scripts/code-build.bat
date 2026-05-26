@echo off
REM ============================================
REM code-build.bat — Build TypeScript source only
REM ============================================
setlocal
cd /d "%~dp0.."
echo [code-build] Compiling TypeScript...
call npm run build:main
if %errorlevel% neq 0 (
  echo [code-build] FAILED (main)
  exit /b %errorlevel%
)
call npm run build:renderer
if %errorlevel% neq 0 (
  echo [code-build] FAILED (renderer)
  exit /b %errorlevel%
)
echo [code-build] Source build complete.