# 婚活エージェント: このPCで常時起動するためのセットアップ
# PowerShell に次の1行を貼って実行する:
#   irm https://raw.githubusercontent.com/taka-koba/claude/main/scripts/setup-pc.ps1 -OutFile $env:TEMP\setup-pc.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\setup-pc.ps1
# APIキー（konkatsu.env）とデータ（konkatsu.db）は、同じフォルダに置くか、元のPCから Tailscale で送ってもらう
# -NoStart: 動作確認用。常時起動の登録（6/6）をしない
param([switch]$NoStart)
$ErrorActionPreference = "Stop"
$dir = Join-Path $HOME "konkatsu"
$branch = "main"
$ts = "C:\Program Files\Tailscale\tailscale.exe"

function Check($what) { if ($LASTEXITCODE) { throw "$what に失敗しました" } }
function Step($m) { Write-Host ""; Write-Host "== $m" -ForegroundColor Cyan }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Need($cmd, $id, $label) {
  RefreshPath
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "$label : インストール済み"; return }
  Write-Host "$label をインストールします（確認が出たら許可してください）"
  winget install --id $id -e --source winget
  RefreshPath
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$label のインストールを確認できませんでした。PCを再起動してから、もう一度実行してください" }
}
# 受け取ったファイルを探す（同じフォルダ、受信フォルダ、ダウンロード）
function Find-Received($file) {
  foreach ($d in @($PSScriptRoot, $recv, (Join-Path $HOME "Downloads"))) {
    $p = Join-Path $d $file
    if ($d -and (Test-Path $p)) { return $p }
  }
  return $null
}

try {
  Step "1/6 必要なソフト"
  Need "node" "OpenJS.NodeJS.LTS" "Node.js"
  Need "git" "Git.Git" "Git"
  if (-not (Test-Path $ts)) {
    Write-Host "Tailscale をインストールします（確認が出たら許可してください）"
    winget install --id Tailscale.Tailscale -e --source winget
  } else { Write-Host "Tailscale : インストール済み" }
  if (-not (Test-Path $ts)) { throw "Tailscale のインストールを確認できませんでした" }

  Step "2/6 Tailscale にログイン"
  $st = & $ts status --json | ConvertFrom-Json
  if ($st.BackendState -ne "Running") {
    Write-Host "ブラウザが開いたら（またはURLが表示されたら）、元のPCと同じアカウントでログインしてください"
    & $ts up
    $st = & $ts status --json | ConvertFrom-Json
  }
  if ($st.BackendState -ne "Running") { throw "Tailscale にログインできませんでした" }
  $myName = $st.Self.HostName
  Write-Host "Tailscale: 接続済み（このPCの名前: $myName）"

  Step "3/6 アプリのダウンロード"
  if (Test-Path (Join-Path $dir ".git")) {
    git -C $dir fetch; Check "更新の確認"
  } else {
    git clone https://github.com/taka-koba/claude.git $dir; Check "ダウンロード"
  }
  git -C $dir checkout $branch; Check "ブランチの切り替え"
  git -C $dir pull --ff-only; Check "最新版への更新"

  Step "4/6 APIキーとデータ"
  $recv = Join-Path $env:TEMP "konkatsu-recv"
  New-Item -ItemType Directory -Force $recv | Out-Null
  $db = Join-Path $dir "data\konkatsu.db"
  $needDb = -not (Test-Path $db)
  $needEnv = -not (Test-Path (Join-Path $dir ".env"))
  if (($needEnv -and -not (Find-Received "konkatsu.env")) -or ($needDb -and -not (Find-Received "konkatsu.db"))) {
    Write-Host "元のPCから APIキーとデータを受け取ります。" -ForegroundColor Yellow
    Write-Host "Claude に「$myName に送って」と伝えてください。届くまで待ちます（Ctrl+C で中止）" -ForegroundColor Yellow
    while (($needEnv -and -not (Find-Received "konkatsu.env")) -or ($needDb -and -not (Find-Received "konkatsu.db"))) {
      # Windows PowerShell 5.1 は Stop のままだと stderr への出力で止まってしまう
      $ErrorActionPreference = "Continue"
      & $ts file get --conflict=overwrite $recv 2>&1 | Out-Null
      $ErrorActionPreference = "Stop"
      Start-Sleep 3
    }
  }
  if ($needEnv) { Copy-Item (Find-Received "konkatsu.env") (Join-Path $dir ".env"); Write-Host "APIキーを設定しました" }
  else { Write-Host ".env はすでにあるので、そのまま使います" }
  New-Item -ItemType Directory -Force (Join-Path $dir "data") | Out-Null
  if ($needDb) { Copy-Item (Find-Received "konkatsu.db") $db; Write-Host "データをコピーしました" }
  else { Write-Host "data\konkatsu.db がすでにあるので、上書きしません（データは消えません）" -ForegroundColor Yellow }
  # 受け取ったAPIキーとデータのコピーは残さない
  foreach ($f in "konkatsu.env", "konkatsu.db") {
    foreach ($d in @($recv, (Join-Path $HOME "Downloads"))) { Remove-Item (Join-Path $d $f) -ErrorAction SilentlyContinue }
  }

  Step "5/6 部品のインストール"
  Push-Location $dir
  npm install --no-audit --no-fund --loglevel=error; Check "npm install"
  Pop-Location

  if ($NoStart) { Write-Host "（-NoStart のため 6/6 は省略）"; return }
  Step "6/6 常時起動を開始"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "scripts\autostart.ps1") on
  Write-Host "iPhone 向けの公開設定をします（「Serve is not enabled」と出たら、表示されたURLを開いて有効にし、もう一度実行）"
  $job = Start-Job { & $using:ts serve --bg 8787 2>&1 }
  if (Wait-Job $job -Timeout 30) { Receive-Job $job } else { Receive-Job $job; Stop-Job $job }
  Remove-Job $job -Force

  $name = (& $ts status --json | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
  Write-Host ""
  Write-Host "完了しました！" -ForegroundColor Green
  Write-Host "iPhone で開くURL:  https://$name/" -ForegroundColor Green
  Write-Host ""
  Write-Host "最後に1つだけ: 設定 → システム → 電源 で、電源接続時のスリープを「なし」にしてください"
} catch {
  Write-Host ""
  Write-Host "止まりました: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "この画面の写真を Claude に送ってください"
}
