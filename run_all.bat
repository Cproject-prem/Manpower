@echo off
:: Check for Administrative privileges to start official MongoDB service with existing data
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to access official MongoDB database...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Launch Manpower & FormForge Platforms (Administrator)
color 0A

echo ====================================================================
echo     LAUNCHING MANPOWER PORTAL & FORMFORGE PLATFORMS (TABS)
echo ====================================================================
echo.
echo [0/3] Starting Official MongoDB Service (C:\Program Files\MongoDB)...
net start MongoDB
if %errorlevel% neq 0 (
    echo [Note] If MongoDB service status returned 2, it is already running.
)

echo.
echo To access these applications from mobile phones or other computers 
echo on your local network, enter your computer's IP address.
echo.
echo Example: 192.168.0.155 (or press Enter for localhost)
echo.
set /p SERVER_IP="Enter your IP address (default: localhost): "

IF "%SERVER_IP%"=="" SET SERVER_IP=localhost

echo.
echo ====================================================================
echo [1/2] Configuring Manpower Frontend...
echo REACT_APP_BACKEND_URL=http://%SERVER_IP%:8002 > "D:\Website\Manpower\frontend\.env"

echo [2/2] Opening services in Windows Terminal tabs...
echo.

"%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe" -w 0 nt --title "FormForge Backend (8001)" cmd /k "cd /d D:\Website\PDF Form\backend && call .venv\Scripts\activate && python -m uvicorn server:app --reload --host 0.0.0.0 --port 8001" ^; nt --title "FormForge Frontend (3000)" cmd /k "cd /d D:\Website\PDF Form\frontend && yarn start" ^; nt --title "Manpower Backend (8002)" cmd /k "cd /d D:\Website\Manpower\backend && python -m uvicorn server:app --reload --host 0.0.0.0 --port 8002" ^; nt --title "Manpower Frontend" cmd /k "cd /d D:\Website\Manpower\frontend && npm run dev"

if %errorlevel% neq 0 (
    echo.
    echo Windows Terminal tab creation failed. Opening in separate windows...
    start "FormForge Backend (8001)" cmd /k "cd /d D:\Website\PDF Form\backend && call .venv\Scripts\activate && python -m uvicorn server:app --reload --host 0.0.0.0 --port 8001"
    start "FormForge Frontend (3000)" cmd /k "cd /d D:\Website\PDF Form\frontend && yarn start"
    start "Manpower Backend (8002)" cmd /k "cd /d D:\Website\Manpower\backend && python -m uvicorn server:app --reload --host 0.0.0.0 --port 8002"
    start "Manpower Frontend" cmd /k "cd /d D:\Website\Manpower\frontend && npm run dev"
)

echo.
echo ====================================================================
echo                    ALL SERVICES LAUNCHED!
echo ====================================================================
echo.
echo  FormForge Website  : http://%SERVER_IP%:3000
echo  FormForge API      : http://%SERVER_IP%:8001/docs
echo.
echo  Manpower Website   : http://%SERVER_IP%:5173
echo  Manpower API      : http://%SERVER_IP%:8002/docs
echo.
echo ====================================================================
echo Press any key to exit this launcher window.
pause
