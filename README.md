# 婚活エージェント（個人用）

試作版 `konkatsu-agent.html`（claude.ai の Artifact）をローカルで動くように移植したもの。
キャラ設定・プロンプトのルール・画面の流れは試作版のまま。

- 画面: Vite + React + TypeScript（`src/`）
- サーバー: Node + Hono（`server/`）。Anthropic API はここからだけ呼ぶ（APIキーはブラウザに出ない）
- データ: SQLite（`data/konkatsu.db`、Gitには入らない）
- iPhone: Tailscale 経由の HTTPS でPCのサーバーにアクセス

## 初回セットアップ（Windows）

1. Node.js の LTS 版を https://nodejs.org からインストール（22.13 以上）
2. PowerShell で:
   ```powershell
   git clone https://github.com/taka-koba/claude.git $HOME\konkatsu
   cd $HOME\konkatsu
   git checkout claude/great-mendel-ym5vbn
   npm install
   copy .env.example .env
   notepad .env      # ANTHROPIC_API_KEY= の右にキーを貼って保存
   ```

WSL でも同じ手順で動く（`copy` → `cp`、`notepad` → `nano`）。
データ保存は Node.js 標準の SQLite を使うので、Python やビルドツールは不要。
起動時に出る `ExperimentalWarning: SQLite is an experimental feature` は無視してよい。

## 起動

- **`start.bat` をダブルクリック**（最新版に更新 → 必要な部品を入れる → APIキーが未設定ならメモ帳が開く → 起動してブラウザが開く）。黒い窓を閉じると止まる。すでに起動中ならブラウザを開くだけ
- 初回起動時にデスクトップへ「婚活エージェント」のショートカットが自動で作られる（消しても次回起動時にまた作られる）
- コマンドなら `npm start`（http://localhost:8787 ）
- 画面を作り直しながら開発するときは `npm run dev`（http://localhost:5173 、変更が即反映）

## iPhone から使う（Tailscale）

サーバーは `127.0.0.1` でしか待ち受けないので、そのままではLAN内の他の機器からも見えない。
Tailscale の `serve` で、自分のTailscaleネットワーク内だけにHTTPSで公開する。
（音声入力はHTTPSでないと動かないので、この方法が必要）

1. Tailscale を **Windows** と **iPhone** にインストールし、同じアカウントでログイン
2. 管理画面（https://login.tailscale.com/admin/dns ）で **MagicDNS** と **HTTPS Certificates** を有効にする
3. `start.bat` で起動しておく
4. Windows の PowerShell で:
   ```powershell
   tailscale serve --bg 8787
   ```
   表示された `https://<PC名>.<tailnet名>.ts.net/` を iPhone の Safari で開く
5. 共有ボタン →「ホーム画面に追加」でアプリのように起動できる

- 止めるとき: `tailscale serve reset`
- `tailscale funnel` は**使わない**（インターネット全体に公開されてしまう）
- PC がスリープ／電源オフのときは iPhone から使えない

## 試作版のデータを移す

試作版のデータは claude.ai 上のブラウザの localStorage にある。

1. claude.ai で試作版の Artifact を開き、開発者ツール（F12）の Console を開く
2. Console 上部のコンテキスト選択（`top` と書かれたプルダウン）で、Artifact の iframe を選ぶ
3. 次を貼って Enter（クリップボードにJSONがコピーされる）
   ```js
   copy(JSON.stringify({people: JSON.parse(localStorage.getItem("people")), myline: localStorage.getItem("myline") || ""}))
   ```
4. 新しいアプリの画面下「試作版のデータを取り込む」に貼り付けて「取り込む」

取り込みは追加のみ（既存データは消えない）。初期の「相手1」が不要なら削除してOK。

## 試作版から変わったところ

- AI 呼び出し: `window.claude.use("sample")` → サーバー経由で Anthropic API（モデルは `.env` の `CLAUDE_MODEL`、既定 `claude-opus-5-5`）
- 指示文は最初の発言に埋め込まず、API の `system` に分離
- 記録の要約・店名の抽出は構造化出力（JSONの形をAPI側で保証）
- AI に送る会話履歴は直近40発言まで
- 安全分類器で断られた場合、サーバー側で別モデルに自動で切り替える（`fallbacks: "default"`）
- データは SQLite に保存。「声で返す」の設定だけは端末ごと（ブラウザに保存）

## ファイル構成

```
server/index.ts    API（/api/...）と本番時の静的配信
server/ai.ts       Anthropic API 呼び出し
server/prompts.ts  キャラ設定・共通ルール（試作版から移植）
server/db.ts       SQLite
src/App.tsx        画面
src/Avatar.tsx     キャラのSVGイラスト（試作版から移植）
konkatsu-agent.html  試作版（参照用）
```
