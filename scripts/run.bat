@echo off
rem If the app is already running, just open the browser instead of starting a second copy.
set PORT=8787
if exist .env for /f "tokens=2 delims==" %%a in ('findstr /b /c:"PORT=" .env') do set PORT=%%a
curl -s -o nul -m 3 http://127.0.0.1:%PORT%/api/state
if not errorlevel 1 (
  echo Already running. Opening the browser. To restart, close the other black window first.
  start "" http://localhost:%PORT%
  exit /b 0
)
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo npm install failed. Copy the messages above and send them to Claude.
  exit /b 1
)
if not exist .env copy .env.example .env > nul
findstr /r /c:"^ANTHROPIC_API_KEY=sk-" .env > nul
if errorlevel 1 (
  echo Paste your API key after ANTHROPIC_API_KEY= in Notepad, then save and close it.
  start /wait notepad .env
)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shortcut.ps1
call npm start
