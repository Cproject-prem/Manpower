@echo off
echo =======================================================
echo     STARTING MANPOWER PORTAL (WITHOUT DOCKER)
echo =======================================================
echo.
echo To access the portal from your mobile phone or other 
echo computers on the network, we need your IP address.
echo.
echo Example: 192.168.0.155 or yourdomain.com
set /p SERVER_IP="Enter your IP address (or press Enter for localhost): "

IF "%SERVER_IP%"=="" SET SERVER_IP=localhost

echo.
echo [1] Updating Frontend Configuration...
echo REACT_APP_BACKEND_URL=http://%SERVER_IP%:8002 > frontend\.env

echo [2] Starting Backend Server...
start "Backend Server" cmd /k "cd backend && uvicorn server:app --host 0.0.0.0 --port 8002"

echo [3] Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && yarn start"

echo.
echo =======================================================
echo Servers are launching in separate windows!
echo You can access the website at: 
echo http://%SERVER_IP%:3001
echo =======================================================
pause
