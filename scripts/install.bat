@echo off
setlocal enabledelayedexpansion

echo Installing dependencies...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo Node version:
node --version
echo npm version:
npm --version

npm install
if %errorlevel% neq 0 (
    echo Error: npm install failed
    pause
    exit /b 1
)

echo Done.
endlocal
