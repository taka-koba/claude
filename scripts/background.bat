@echo off
rem Runs the app without a window. Started at sign-in by the task that always-on.bat registers.
rem The update runs inside one block so that git pull can safely replace this file.
cd /d "%~dp0.."
if not exist data mkdir data
rem Keep the log from growing forever
for %%f in (data\server.log) do if %%~zf GTR 5000000 move /y data\server.log data\server.old.log > nul
(echo [%date% %time%] updating& git checkout -- package-lock.json & git pull --ff-only & call scripts\serve-loop.bat & exit /b) >> data\server.log 2>&1
