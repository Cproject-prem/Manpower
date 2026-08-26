@echo off
setlocal enabledelayedexpansion
title Git Push - Manpower

echo ===================================================
echo           Git Push / Upload Utility (Manpower)
echo ===================================================
echo.

set /p MSG="Enter commit message (Leave empty for default timestamp): "
if "%MSG%"=="" (
    set MSG=Update Manpower - %date% %time%
)

echo.
echo ---> Pushing Manpower...
cd /d "%~dp0"
git add .
git commit -m "%MSG%"
git push origin main

echo.
echo ===================================================
echo Git Push completed!
echo ===================================================
pause
