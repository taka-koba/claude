import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { exec } from "node:child_process";
import { streamText as honoStream } from "hono/streaming";
import { z } from "zod";
import * as store from "./db.js";
import { streamText, parseJson, errorMessage, MODEL } from "./ai.js";
import {
  chatSystem,
  lineSystem,
  lineUser,
  isCharId,
  SUMMARY_INSTRUCTION,
  SHOPS_INSTRUCTION,
  type Mode,
  type PersonCtx,
} from "./prompts.js";

const TAG = /\[表情:\w+\]/g;
// 1スレッドあたりAIに送る直近の発言数（長くなりすぎないように）
const HISTORY_LIMIT = 40;
// ストリーム途中でエラーになったとき、本文と区別するための区切り
const ERR = "\u0000ERR:";

const app = new Hono();
const api = new Hono();

const isMode = (m: unknown): m is Mode => m === "review" || m === "date";

function ctx(p: store.Person): PersonCtx {
  return { name: p.name, memo: p.memo, logs: store.getLogs(p.id) };
}

function personOr404(id: string) {
  return store.getPerson(Number(id));
}

api.get("/state", (c) =>
  c.json({
    people: store.listPeople(),
    myline: store.getSetting("myline") ?? "",
    character: store.getSetting("character") ?? "mirai",
    current: Number(store.getSetting("current") ?? 0) || null,
  }),
);

api.put("/settings", async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  for (const k of ["myline", "character", "current"] as const) {
    if (body[k] !== undefined) store.setSetting(k, String(body[k]));
  }
  return c.json({ ok: true });
});

api.post("/people", async (c) => {
  const { name } = (await c.req.json()) as { name?: string };
  if (!name?.trim()) return c.json({ error: "name required" }, 400);
  return c.json(store.addPerson(name.trim()));
});

api.patch("/people/:id", async (c) => {
  if (!personOr404(c.req.param("id"))) return c.notFound();
  const { name, memo } = (await c.req.json()) as { name?: string; memo?: string };
  store.updatePerson(Number(c.req.param("id")), { name: name?.trim() || undefined, memo });
  return c.json({ ok: true });
});

api.delete("/people/:id", (c) => {
  store.deletePerson(Number(c.req.param("id")));
  if (!store.listPeople().length) store.addPerson("相手1");
  return c.json({ ok: true });
});

api.get("/people/:id", (c) => {
  const p = personOr404(c.req.param("id"));
  if (!p) return c.notFound();
  return c.json({
    ...p,
    review: store.getMessages(p.id, "review"),
    date: store.getMessages(p.id, "date"),
    log: store.getLogs(p.id),
  });
});

api.post("/people/:id/chat", async (c) => {
  const p = personOr404(c.req.param("id"));
  if (!p) return c.notFound();
  const { mode, character, text } = (await c.req.json()) as {
    mode?: unknown;
    character?: unknown;
    text?: string;
  };
  if (!isMode(mode) || !isCharId(character) || !text?.trim()) {
    return c.json({ error: "bad request" }, 400);
  }
  const user = { role: "user" as const, content: text.trim() };
  let history = [...store.getMessages(p.id, mode), user].slice(-HISTORY_LIMIT);
  while (history.length && history[0].role !== "user") history = history.slice(1);

  return honoStream(c, async (s) => {
    try {
      const reply = await streamText(chatSystem(character, mode, ctx(p)), history, async (t) => {
        await s.write(t);
      });
      store.addMessages(p.id, mode, [user, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error(e);
      await s.write(ERR + errorMessage(e));
    }
  });
});

api.post("/people/:id/line", async (c) => {
  const p = personOr404(c.req.param("id"));
  if (!p) return c.notFound();
  const { character, theirs, mine } = (await c.req.json()) as {
    character?: unknown;
    theirs?: string;
    mine?: string;
  };
  if (!isCharId(character) || !theirs?.trim()) return c.json({ error: "bad request" }, 400);
  store.setSetting("myline", mine ?? "");
  return honoStream(c, async (s) => {
    try {
      await streamText(
        lineSystem(character, ctx(p)),
        [{ role: "user", content: lineUser(theirs.trim(), (mine ?? "").trim()) }],
        async (t) => {
          await s.write(t);
        },
      );
    } catch (e) {
      console.error(e);
      await s.write(ERR + errorMessage(e));
    }
  });
});

const LogSchema = z.object({
  title: z.string(),
  summary: z.string(),
  good: z.string(),
  next: z.string(),
});

api.post("/people/:id/logs", async (c) => {
  const p = personOr404(c.req.param("id"));
  if (!p) return c.notFound();
  const msgs = store.getMessages(p.id, "review");
  if (msgs.length < 2) return c.json({ error: "振り返りの会話がまだないよ" }, 400);
  const tr = msgs
    .map((m) => (m.role === "user" ? "本人: " : "AI: ") + m.content.replace(TAG, ""))
    .join("\n");
  try {
    const r = await parseJson(LogSchema, SUMMARY_INSTRUCTION, tr);
    const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    store.addLog(p.id, { d, ...r });
    return c.json({ ok: true });
  } catch (e) {
    console.error(e);
    return c.json({ error: errorMessage(e) }, 502);
  }
});

api.delete("/logs/:id", (c) => {
  store.deleteLog(Number(c.req.param("id")));
  return c.json({ ok: true });
});

const ShopsSchema = z.object({ names: z.array(z.string()) });

api.post("/extract-shops", async (c) => {
  const { text } = (await c.req.json()) as { text?: string };
  if (!text?.trim()) return c.json({ error: "bad request" }, 400);
  try {
    const r = await parseJson(ShopsSchema, SHOPS_INSTRUCTION, text.replace(TAG, ""));
    return c.json(r.names.slice(0, 8));
  } catch (e) {
    console.error(e);
    return c.json({ error: errorMessage(e) }, 502);
  }
});

// 試作版（localStorage の people / myline）からの取り込み
type OldPerson = {
  name?: string;
  memo?: string;
  review?: store.Msg[];
  date?: store.Msg[];
  log?: Partial<store.Log>[];
};
api.post("/import", async (c) => {
  const body = (await c.req.json()) as {
    people?: { list?: OldPerson[] };
    myline?: string;
  };
  const list = body.people?.list;
  if (!Array.isArray(list)) return c.json({ error: "people.list がありません" }, 400);
  const clean = (ms?: store.Msg[]) =>
    (ms ?? []).filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content !== "…" &&
        !m.content.startsWith("ごめん、うまく返せなかった"),
    );
  store.transaction(() => {
    for (const o of list) {
      const p = store.addPerson(o.name || "相手", o.memo || "");
      store.addMessages(p.id, "review", clean(o.review));
      store.addMessages(p.id, "date", clean(o.date));
      for (const l of [...(o.log ?? [])].reverse()) {
        store.addLog(p.id, {
          d: l.d ?? "",
          title: l.title ?? "",
          summary: l.summary ?? "",
          good: l.good ?? "",
          next: l.next ?? "",
        });
      }
    }
    if (typeof body.myline === "string" && body.myline) store.setSetting("myline", body.myline);
  })();
  return c.json({ ok: true, count: list.length });
});

app.route("/api", api);

// --prod: ビルド済みの画面（dist/）も配信する。--open: 起動後にブラウザを開く
if (process.argv.includes("--prod")) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT || 8787);
const hostname = process.env.HOST || "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY が未設定です。.env を作ってください（.env.example 参照）");
  }
  const url = `http://localhost:${port}`;
  console.log(`婚活エージェント: ${url}  (model: ${MODEL})`);
  if (process.argv.includes("--open")) {
    const cmd =
      process.platform === "win32" ? `start "" ${url}` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
    exec(cmd);
  }
});
