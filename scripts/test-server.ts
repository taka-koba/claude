// 動作確認用のサーバー（本番とは別のポート・別のデータ）
//   npm run test-server → http://localhost:8788 。データは data/test.db（TEST_DB で変更可）
// 画面は dist/ を使うので、画面を変えたら先に npx vite build
process.env.PORT = process.env.TEST_PORT || "8788";
process.env.DB_PATH = process.env.TEST_DB || "data/test.db";
console.log(`テスト用サーバー: port ${process.env.PORT}, データ ${process.env.DB_PATH}`);
await import("../server/index.js");
export {};
