@echo off
rem Called by background.bat (output already goes to data\server.log). Restarts the server if it stops.
call npm install --no-audit --no-fund --loglevel=error
call npx vite build
:loop
echo [%date% %time%] server start
call npx tsx server/index.ts --prod
echo [%date% %time%] server stopped, restarting in 10s
ping -n 11 127.0.0.1 > nul
goto loop
