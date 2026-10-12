@echo off
rem Called by background.bat (output already goes to data\server.log). Restarts the server if it stops.
call npm install --no-audit --no-fund --loglevel=error
call npx vite build
rem Auto-update and daily backups run alongside the server (see scripts\updater.ps1, log: data\updater.log)
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File scripts\updater.ps1
:loop
rem While the updater is installing a new version, wait instead of starting the server
if exist data\updating.lock (
  ping -n 4 127.0.0.1 > nul
  goto loop
)
echo [%date% %time%] server start
call npx tsx server/index.ts --prod
echo [%date% %time%] server stopped, restarting in 10s
ping -n 11 127.0.0.1 > nul
goto loop
