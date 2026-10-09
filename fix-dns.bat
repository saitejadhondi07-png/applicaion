@echo off
echo ====================================================
echo Adding endurancebatterypackreports.com to hosts file
echo ====================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
) else (
    echo ERROR: You must right-click this file and select "Run as Administrator".
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: Append to hosts file
echo 127.0.0.1 endurancebatterypackreports.com >> %windir%\System32\drivers\etc\hosts

echo.
echo Success! The domain has been added.
echo You can now refresh your browser!
echo Press any key to exit...
pause >nul
