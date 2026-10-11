// データを1ファイルにまとめてバックアップする（起動中でも取れる）。別のPCへの引っ越しにも使う
//   npm run backup             → data/backup-YYYY-MM-DD.db
//   npm run backup -- 出力先.db
import "dotenv/config";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = process.env.DB_PATH || "data/konkatsu.db";
const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const out = process.argv[2] || `data/backup-${day}.db`;
fs.rmSync(out, { force: true });
new DatabaseSync(src).exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
console.log(`バックアップしました: ${out}`);
