@echo off
rem Double-click once: the app then runs in the background from every Windows sign-in (no window).
chcp 65001 > nul
cd /d "%~dp0"
if not exist .env copy .env.example .env > nul
findstr /r /c:"^ANTHROPIC_API_KEY=sk-" .env > nul
if errorlevel 1 (
  echo Paste your API key after ANTHROPIC_API_KEY= in Notepad, then save and close it.
  start /wait notepad .env
)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\autostart.ps1 on
pause
