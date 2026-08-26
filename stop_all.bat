@echo off
:: Check for Administrative privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to stop all processes...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Stop All Manpower & FormForge Services
color 0C

echo ====================================================================
echo     STOPPING ALL MANPOWER & FORMFORGE PROCESSES
echo ====================================================================
echo.

echo [1/3] Terminating Node/React/Vite Frontend processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (echo [OK] Stopped Node frontend processes.) else (echo [INFO] No active Node processes found.)

echo.
echo [2/3] Terminating Python/Uvicorn Backend processes on ports 8001 and 8002...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001 ^| findstr LISTENING') do (
    echo Killing process on port 8001 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8002 ^| findstr LISTENING') do (
    echo Killing process on port 8002 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process on port 3000 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process on port 3001 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo Killing process on port 5173 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)

echo.
echo [3/3] Restarting MongoDB Database Service...
net stop MongoDB 2>nul
net start MongoDB 2>nul

echo.
echo ====================================================================
echo              ALL PROCESSES SUCCESSFULLY STOPPED!
echo ====================================================================
echo.
pause
