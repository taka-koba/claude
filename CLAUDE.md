# 婚活エージェント — 開発メモ（Claude向け）

使い方・構成は README.md を参照。ここには開発・検証時の注意だけを書く。

## どこで動いているか

- 本番はデスクトップPC（Tailscale名 `pc-g-taka`）で常時起動している。iPhone などは https://pc-g-taka.tail52ce93.ts.net/ を開く
- 開発はデスクトップPCでもノートPC（`ombk58`）でもする。ノートPCの `data/konkatsu.db` は引っ越し前の古いコピーなので、ノートPCでアプリを本番として起動しない
- デスクトップPCで開発するときは、同じPCで本番が 8787 番で動いている。止めない・本番DBに書き込まない（下記）

## 本番データを守る

- `data/konkatsu.db` は本人の実データ（デート相手・振り返り・記録）。検証で書き込まない
- 動作確認は別DB・別ポートで: `npm run test-server`（8788番、`data/test.db`）。本番とは別のデータなので自由に書き込んでよい
  （dotenv は既存の環境変数を上書きしないので、これで .env より優先される）
- 本人がふだん 8787 番でアプリを起動したままにしていることが多い。そのプロセスは止めない

## 更新の流れ

- `start.bat` は起動のたびに `git pull --ff-only` する。変更はコミットして origin に push しておく
  （PC 側に未コミット・未 push の変更が残ると、次回の pull が失敗することがある）
- ブランチ: **`dev` で開発 → 本人の確認・了承を得てから `main` に入れる（= 本番に出す）**。`main` に直接コミットしない
- 本番PCは `scripts/updater.ps1` が5分おきに `origin/main` を見て自動で更新する（更新前にバックアップ、失敗したら前の版に戻す）。
  `main` に push すると数分で本番に出るので、push する前に `npm run typecheck` と `npm run test-server` での確認を済ませる
- 本番PCの作業フォルダ（`C:\Users\umove\konkatsu`）は自動更新が書き換える。デスクトップPCで開発するなら別のフォルダに clone して使う
  （本番フォルダに未コミットの変更があると、自動更新は止まる）
- 両方のPCで開発するので、作業を始める前に `git pull` して、終わったら push する
- ノートPCの `.env` は `ROLE=dev`（start.bat が本番URLを開くだけになる）
- データベースの形を変えるとき（テーブルや列の追加など）は、既存の本番データを壊さないように db.ts の起動時処理で移行する。
  本番には更新前のバックアップ（`data/backups/pre-deploy-*.db`）がある
- `npx vite build` は本番が配信している `dist/` を上書きする。デスクトップPCでは、確認用のビルドも本番の画面にすぐ出る点に注意
  （確認だけなら `npm run dev` で http://localhost:5173 を使う。ただし API は 8787 の本番に向くので、書き込む操作は試さない）
- `scripts/autostart.ps1 stop` は `PORT` 環境変数のポートで待ち受けているプロセスを止める。検証で使うときは `PORT=8788` を付ける
- `*.bat` は CRLF のまま保つ。`package-lock.json` は LF 固定（`.gitattributes`）。npm install のたびに差分が出て pull が止まるのを防ぐため
- 変更後は `npm run typecheck`

## 検証のコツ

- Windows の Git Bash から `curl -d '日本語'` で送ると文字化けする。日本語を含むリクエストは Node の `fetch` で送る
- `localhost` は IPv6 で待たされることがあるので、curl では `127.0.0.1` を使う
- AI の応答確認: `/api/people/:id/chat`（review/date）、`/line`、`/logs`（要約）、`/api/extract-shops`
