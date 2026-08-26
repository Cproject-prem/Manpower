@echo off
title Stop Manpower Portal Docker Containers
color 0C

echo ====================================================================
echo     STOPPING MANPOWER PORTAL DOCKER CONTAINERS
echo ====================================================================
echo.

docker compose down

echo.
echo ====================================================================
echo                ALL DOCKER CONTAINERS STOPPED!
echo ====================================================================
echo.
pause
