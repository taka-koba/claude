# Production updater, started by serve-loop.bat on the always-on PC.
# Every 5 minutes:
#   - makes a daily backup of the database (keeps 14 days)
#   - if origin/<DEPLOY_BRANCH> (default: main) has a new commit, deploys it:
#     backup -> pause the server -> checkout -> npm install -> build -> start -> health check
#     and rolls back to the previous commit if any step fails.
# Log: data\updater.log
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force "data\backups" | Out-Null
$log = Join-Path $root "data\updater.log"
$lock = Join-Path $root "data\updating.lock"

function Get-EnvValue($key, $default) {
  if (Test-Path ".env") {
    $m = Select-String -Path ".env" -Pattern "^$key=(.+)$" | Select-Object -First 1
    if ($m) { return $m.Matches[0].Groups[1].Value.Trim() }
  }
  return $default
}
$branch = Get-EnvValue "DEPLOY_BRANCH" "main"
$port = [int](Get-EnvValue "PORT" "8787")

function Log($m) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 2MB) { Move-Item -Force $log "$log.old" }
  Add-Content -Encoding utf8 $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
}
# Run a native command, log its output, return $true on success
function Run($what, [scriptblock]$cmd) {
  $out = & $cmd 2>&1 | Out-String
  if ($out.Trim()) { Add-Content -Encoding utf8 $log $out.TrimEnd() }
  if ($LASTEXITCODE) { Log "$what failed (exit $LASTEXITCODE)"; return $false }
  return $true
}
function Healthy {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$port/api/state" | Out-Null; return $true }
  catch { return $false }
}
function Wait-Healthy($seconds) {
  for ($i = 0; $i -lt $seconds; $i += 3) { if (Healthy) { return $true }; Start-Sleep 3 }
  return $false
}
function Stop-Server {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /T /F /PID $_.OwningProcess 2>$null | Out-Null }
}
function Backup($file) {
  if (Run "backup" { npx tsx scripts/backup.ts $file }) { Log "backup: $file" }
}
function Prune($pattern, $keep) {
  Get-ChildItem "data\backups" -Filter $pattern | Sort-Object Name -Descending |
    Select-Object -Skip $keep | Remove-Item -Force
}

# Switch the working tree to $commit and rebuild while serve-loop.bat waits on the lock file
function Deploy($commit) {
  New-Item -ItemType File -Force $lock | Out-Null
  try {
    Stop-Server
    Start-Sleep 2
    if (-not (Run "checkout" { git checkout -q -B $branch $commit })) { return $false }
    if (-not (Run "npm install" { npm install --no-audit --no-fund --loglevel=error })) { return $false }
    if (-not (Run "build" { npx vite build })) { return $false }
  } finally {
    Remove-Item -Force $lock -ErrorAction SilentlyContinue
  }
  # serve-loop.bat starts the server again within about 10 seconds
  return (Wait-Healthy 120)
}

function Check-Update {
  if (-not (Run "fetch" { git fetch -q origin $branch })) { return }
  $cur = (git rev-parse HEAD).Trim()
  $new = (git rev-parse "origin/$branch").Trim()
  $curBranch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($cur -eq $new) {
    # Same code, only on a different branch name: switch without rebuilding
    if ($curBranch -ne $branch) { Run "switch branch" { git checkout -q -B $branch $new } | Out-Null; Log "now tracking $branch" }
    return
  }
  # npm install may rewrite package-lock.json (e.g. line endings); it is generated, so drop such edits
  git checkout -q -- package-lock.json 2>$null
  if (git status --porcelain --untracked-files=no) { Log "local changes in the working tree; update skipped"; return }
  Log "deploying $($new.Substring(0,7)) (was $($cur.Substring(0,7)))"
  Backup "data\backups\pre-deploy-$(Get-Date -Format 'yyyy-MM-dd_HHmmss').db"
  Prune "pre-deploy-*.db" 10
  if (Deploy $new) { Log "deployed $($new.Substring(0,7))"; return }
  Log "deploy failed; rolling back to $($cur.Substring(0,7))"
  if (Deploy $cur) { Log "rolled back" } else { Log "ROLLBACK FAILED - check server.log" }
}

Log "updater started (branch $branch, port $port)"
# Let serve-loop.bat finish its own first build before touching anything
# UPDATER_FIRST_DELAY / UPDATER_INTERVAL (seconds) are only for testing
$firstDelay = 120; if ($env:UPDATER_FIRST_DELAY) { $firstDelay = [int]$env:UPDATER_FIRST_DELAY }
$interval = 300; if ($env:UPDATER_INTERVAL) { $interval = [int]$env:UPDATER_INTERVAL }
Start-Sleep $firstDelay
while ($true) {
  try {
    $daily = "data\backups\daily-$(Get-Date -Format 'yyyy-MM-dd').db"
    if (-not (Test-Path $daily)) { Backup $daily; Prune "daily-*.db" 14 }
    Check-Update
  } catch { Log "error: $($_.Exception.Message)" }
  Start-Sleep $interval
}
