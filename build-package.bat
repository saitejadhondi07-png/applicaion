@echo off
echo Running build and package script...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-package.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Build failed with error code %errorlevel%.
    pause
    exit /b %errorlevel%
)
echo.
pause
