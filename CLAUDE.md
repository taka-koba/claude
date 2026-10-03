# 婚活エージェント — 開発メモ（Claude向け）

使い方・構成は README.md を参照。ここには開発・検証時の注意だけを書く。

## 本番データを守る

- `data/konkatsu.db` は本人の実データ（デート相手・振り返り・記録）。検証で書き込まない
- 動作確認は別DB・別ポートで: `PORT=8788 DB_PATH="$TEMP/konkatsu-verify/test.db" npx tsx server/index.ts --prod`
  （dotenv は既存の環境変数を上書きしないので、これで .env より優先される）
- 本人がふだん 8787 番でアプリを起動したままにしていることが多い。そのプロセスは止めない

## 更新の流れ

- `start.bat` は起動のたびに `git pull --ff-only` する。変更はコミットして origin に push しておく
  （PC 側に未コミット・未 push の変更が残ると、次回の pull が失敗することがある）
- `scripts/*.bat` は CRLF のまま保つ
- 変更後は `npm run typecheck`

## 検証のコツ

- Windows の Git Bash から `curl -d '日本語'` で送ると文字化けする。日本語を含むリクエストは Node の `fetch` で送る
- `localhost` は IPv6 で待たされることがあるので、curl では `127.0.0.1` を使う
- AI の応答確認: `/api/people/:id/chat`（review/date）、`/line`、`/logs`（要約）、`/api/extract-shops`
