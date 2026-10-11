@echo off
rem Restart the background app with the latest version.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\autostart.ps1 restart
pause
