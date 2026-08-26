@echo off
title Start Manpower Portal via Docker
color 0A

echo ====================================================================
echo     BUILDING & LAUNCHING MANPOWER PORTAL (DOCKER COMPOSE)
echo ====================================================================
echo.

docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo Docker compose failed. Ensure Docker Desktop is installed and running.
    pause
    exit /b
)

echo.
echo ====================================================================
echo                 DOCKER CONTAINERS LAUNCHED!
echo ====================================================================
echo.
echo  Manpower Portal Web UI  : http://localhost:3001
echo  Backend FastAPI Swagger : http://localhost:8002/docs
echo  MongoDB Database Port  : 27017
echo.
echo ====================================================================
pause
