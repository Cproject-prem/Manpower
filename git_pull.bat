@echo off
setlocal enabledelayedexpansion
title Git Pull - Manpower

echo ===================================================
echo           Git Pull / Sync Utility (Manpower)
echo ===================================================
echo.
echo ---> Pulling Manpower...
cd /d "%~dp0"
git pull origin main

echo.
echo ===================================================
echo Git Pull completed!
echo ===================================================
pause
