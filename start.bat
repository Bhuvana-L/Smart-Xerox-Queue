@echo off
title Smart Xerox Queue
echo ========================================
echo    Smart Xerox Queue - Starting...
echo ========================================
echo.

cd /d "%~dp0backend"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies... (first time only)
    npm install --production
    echo.
)

echo Starting server...
echo.
echo ========================================
echo    Server running at: http://localhost:5000
echo    Open this URL in your browser
echo    Press Ctrl+C to stop
echo ========================================
echo.

node server.js
pause
