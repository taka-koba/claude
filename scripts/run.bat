@echo off
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
call npm start
