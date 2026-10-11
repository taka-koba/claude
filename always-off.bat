@echo off
rem Turn always-on mode off (stops the background app and removes the sign-in task).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\autostart.ps1 off
pause
