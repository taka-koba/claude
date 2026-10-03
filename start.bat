@echo off
rem Double-click to start (closing this window stops the app)
chcp 65001 > nul
cd /d "%~dp0"
if not exist node_modules call npm install
call npm start
pause
