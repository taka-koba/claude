# Always-on mode: run the app in the background from Windows sign-in, without a window.
#   on      register the sign-in task and start it now
#   off     stop the app and remove the task
#   restart stop the app and start it again (pulls the latest version first)
#   stop    stop the app (it starts again at the next sign-in)
param([Parameter(Mandatory)][ValidateSet("on", "off", "restart", "stop")][string]$Action)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$name = "KonkatsuAgent"
$bat = Join-Path $root "scripts\background.bat"

$port = 8787
if ($env:PORT) { $port = [int]$env:PORT }
elseif (Test-Path (Join-Path $root ".env")) {
  $m = Select-String -Path (Join-Path $root ".env") -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

function Stop-App {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $name }
  # The task's child processes (cmd -> npx -> node) can outlive the task, so end them by command line and port
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like "*serve-loop.bat*" -or $_.CommandLine -like "*background.bat*" } |
    ForEach-Object { taskkill /T /F /PID $_.ProcessId 2>$null | Out-Null }
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /T /F /PID $_.OwningProcess 2>$null | Out-Null }
  Write-Host "Stopped."
}

function Wait-Up {
  Write-Host "Starting (the first start can take a minute)..."
  for ($i = 0; $i -lt 180; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/api/state" | Out-Null
      Write-Host "Running: http://localhost:$port"
      return
    } catch { Start-Sleep 1 }
  }
  Write-Host "Did not start within 3 minutes. See data\server.log"
}

switch ($Action) {
  "on" {
    Stop-App
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $root `
      -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '$bat'`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
      -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force `
      -Description "Konkatsu agent: start in the background at sign-in" | Out-Null
    Write-Host "Registered: the app now starts automatically at sign-in."
    Start-ScheduledTask -TaskName $name
    Wait-Up
  }
  "off" {
    Stop-App
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $name -Confirm:$false
    }
    Write-Host "Always-on mode is off. Use start.bat to run the app when needed."
  }
  "restart" {
    Stop-App
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
      Start-ScheduledTask -TaskName $name
    } else {
      Start-Process -WindowStyle Hidden -FilePath $bat -WorkingDirectory $root
    }
    Wait-Up
  }
  "stop" { Stop-App }
}
