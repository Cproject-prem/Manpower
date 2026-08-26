@echo off
title Run Manpower Locally - Port 8002/3001

echo ===================================================
echo   Starting Manpower Portal Locally (Non-Docker)
echo ===================================================
echo.

cd /d "%~dp0"

if not exist "backend\.env" (
    if exist "backend\.env.example" copy "backend\.env.example" "backend\.env"
)
if not exist "frontend\.env" (
    if exist "frontend\.env.example" copy "frontend\.env.example" "frontend\.env"
)

start "Manpower Backend (Port 8002)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn server:app --port 8002 --reload"
start "Manpower Frontend (Port 3001)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Manpower launched:
echo - Backend:  http://localhost:8002
echo - Frontend: http://localhost:3001
pause
