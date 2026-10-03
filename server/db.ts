// Node.js 標準の SQLite（追加のビルド不要。Node 22.13 以上）
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Mode } from "./prompts.js";

const file = process.env.DB_PATH || "data/konkatsu.db";
fs.mkdirSync(path.dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// 入れ子で呼ばれたときは外側のトランザクションにまとめる
let depth = 0;
export function transaction<A extends unknown[]>(fn: (...a: A) => void) {
  return (...a: A) => {
    if (depth > 0) return fn(...a);
    depth++;
    db.exec("BEGIN");
    try {
      fn(...a);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      depth--;
    }
  };
}

db.exec(`
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('review','date')),
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_person ON messages(person_id, mode, id);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  d TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  good TEXT NOT NULL DEFAULT '',
  next TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export type Person = { id: number; name: string; memo: string };
export type Msg = { role: "user" | "assistant"; content: string };
export type Log = {
  id: number;
  d: string;
  title: string;
  summary: string;
  good: string;
  next: string;
};

export const listPeople = (): Person[] =>
  db.prepare("SELECT id, name, memo FROM people ORDER BY id").all() as unknown as Person[];

export const getPerson = (id: number): Person | undefined =>
  db.prepare("SELECT id, name, memo FROM people WHERE id = ?").get(id) as unknown as Person | undefined;

export const addPerson = (name: string, memo = ""): Person => {
  const r = db.prepare("INSERT INTO people (name, memo) VALUES (?, ?)").run(name, memo);
  return { id: Number(r.lastInsertRowid), name, memo };
};

export const updatePerson = (id: number, f: { name?: string; memo?: string }) => {
  if (f.name !== undefined) db.prepare("UPDATE people SET name = ? WHERE id = ?").run(f.name, id);
  if (f.memo !== undefined) db.prepare("UPDATE people SET memo = ? WHERE id = ?").run(f.memo, id);
};

export const deletePerson = (id: number) => db.prepare("DELETE FROM people WHERE id = ?").run(id);

export const getMessages = (personId: number, mode: Mode): Msg[] =>
  db
    .prepare("SELECT role, content FROM messages WHERE person_id = ? AND mode = ? ORDER BY id")
    .all(personId, mode) as unknown as Msg[];

const insMsg = db.prepare(
  "INSERT INTO messages (person_id, mode, role, content) VALUES (?, ?, ?, ?)",
);
export const addMessages = transaction((personId: number, mode: Mode, msgs: Msg[]) => {
  for (const m of msgs) insMsg.run(personId, mode, m.role, m.content);
});

export const getLogs = (personId: number): Log[] =>
  db
    .prepare(
      "SELECT id, d, title, summary, good, next FROM logs WHERE person_id = ? ORDER BY d DESC, id DESC",
    )
    .all(personId) as unknown as Log[];

export const addLog = (personId: number, l: Omit<Log, "id">) =>
  db
    .prepare(
      "INSERT INTO logs (person_id, d, title, summary, good, next) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(personId, l.d, l.title, l.summary, l.good, l.next);

export const deleteLog = (id: number) => db.prepare("DELETE FROM logs WHERE id = ?").run(id);

export const getSetting = (key: string): string | undefined =>
  (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as unknown as { value: string } | undefined)
    ?.value;

export const setSetting = (key: string, value: string) =>
  db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);

if (!listPeople().length) addPerson("相手1");
