@echo off
title UK FTSE 100 & FTSE 250 Stock Picker
echo ==============================================================
echo        Starting UK FTSE 100 & FTSE 250 Stock Picker...
echo ==============================================================
echo.
cd /d "%~dp0"

python server.py

if errorlevel 1 (
    echo.
    echo Launching index.html directly in browser...
    start "" "%~dp0static\index.html"
)
pause
