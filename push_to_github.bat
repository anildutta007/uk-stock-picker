@echo off
title Push UK Stock Picker to GitHub
cd /d "%~dp0"
echo ========================================================
echo        Pushing UK Stock Picker to GitHub
echo ========================================================
echo.
echo Remote target: https://github.com/anildutta007/uk-stock-picker.git
echo.
git push -u origin main
if errorlevel 1 (
    echo.
    echo [NOTE] If you haven't created the repository on GitHub yet:
    echo 1. Go to https://github.com/new
    echo 2. Repository name: uk-stock-picker
    echo 3. Click "Create repository" (leave it empty without README)
    echo 4. Run this script again to push!
)
pause
