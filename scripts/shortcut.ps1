# デスクトップに「婚活エージェント」のショートカットを作る（すでにあれば何もしない）
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '婚活エージェント.lnk'
if (Test-Path $lnk) { exit 0 }
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = Join-Path $root 'start.bat'
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root 'scripts\icon.ico') + ',0'
$s.Description = '婚活エージェントを起動'
$s.Save()
Write-Host "Created desktop shortcut: $lnk"
