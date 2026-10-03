@echo off
rem Double-click to update and start. Closing this window stops the app.
rem Everything runs inside one block so that git pull can safely update this file.
chcp 65001 > nul
cd /d "%~dp0" && (echo Updating... & git pull --ff-only & call scripts\run.bat & pause & exit /b)
