export type CharId = "mirai" | "ren" | "sakura";
export type Mode = "review" | "date";
export type Msg = { role: "user" | "assistant"; content: string };
export type Log = { id: number; d: string; title: string; summary: string; good: string; next: string };
export type Person = { id: number; name: string; memo: string };
export type PersonDetail = Person & { review: Msg[]; date: Msg[]; log: Log[] };
export type AppState = { people: Person[]; myline: string; character: string; current: number | null };

const ERR = "\u0000ERR:";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch("/api" + url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  state: () => req<AppState>("GET", "/state"),
  settings: (s: Partial<Record<"myline" | "character" | "current", string | number>>) =>
    req("PUT", "/settings", s),
  person: (id: number) => req<PersonDetail>("GET", `/people/${id}`),
  addPerson: (name: string) => req<Person>("POST", "/people", { name }),
  updatePerson: (id: number, f: { name?: string; memo?: string }) =>
    req("PATCH", `/people/${id}`, f),
  deletePerson: (id: number) => req("DELETE", `/people/${id}`),
  saveLog: (id: number) => req("POST", `/people/${id}/logs`),
  deleteLog: (id: number) => req("DELETE", `/logs/${id}`),
  extractShops: (text: string) => req<string[]>("POST", "/extract-shops", { text }),
  import: (data: unknown) => req<{ count: number }>("POST", "/import", data),
};

// テキストを少しずつ受け取りながら表示する。エラーは例外にする
export async function streamPost(
  url: string,
  body: unknown,
  onText: (full: string) => void,
): Promise<string> {
  const r = await fetch("/api" + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    // エラー区切りが来たら、受信が終わってから例外にする
    if (!full.includes(ERR)) onText(full);
  }
  full += dec.decode();
  const i = full.indexOf(ERR);
  if (i >= 0) throw new Error(full.slice(i + ERR.length));
  return full;
}
