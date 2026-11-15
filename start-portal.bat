@echo off
title Lakes International School Fee Portal
echo ========================================================
echo Starting Lakes International School - Fee Payment System
echo ========================================================
echo.
timeout /t 2 >nul
start http://localhost:3000
node server.js
pause
