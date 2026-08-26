@echo off
:: Check for Administrative privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to restart all services...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Clean Restart - Manpower & FormForge Platforms
color 0E

echo ====================================================================
echo     PERFORMING FRESH CLEAN RESTART OF ALL SERVICES
echo ====================================================================
echo.

echo Step 1: Stopping all active backend, frontend, and database connections...
call "%~dp0stop_all.bat"

echo.
echo Step 2: Launching fresh instance of all platforms...
timeout /t 2 /nobreak >nul
call "%~dp0run_all.bat"
