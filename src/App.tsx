import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamPost, type AppState, type CharId, type Mode, type Msg, type PersonDetail } from "./api";
import { Avatar, FACES, type Face } from "./Avatar";
import { speak, useJaVoices, voiceLabel } from "./speech";

const CHARS: Record<CharId, string> = {
  mirai: "ミライ（ノリのいい親友）",
  ren: "レン先生（辛口コーチ）",
  sakura: "さくら姉さん（優しい年上）",
};
const isChar = (c: string): c is CharId => c in CHARS;
type Tab = Mode | "line" | "log";
const TAG = /\[表情:(\w+)\]/;
// 表示用: 表情タグと、マークダウンの記号（**太字** や --- の区切り線）を取り除く
const strip = (t: string) =>
  t
    .replace(TAG, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*>\s?/gm, "｜ ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// 返信案の「> 」で始まる引用部分（そのまま送れる文面）を、案ごとに取り出す
function replyDrafts(t: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of t.split("\n")) {
    const m = line.match(/^\s*>\s?(.*)$/);
    if (m) cur.push(m[1]);
    else if (cur.length) {
      out.push(cur.join("\n").trim());
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join("\n").trim());
  return out.filter(Boolean);
}

function useLocal(key: string, init: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? init : s === "1";
    } catch {
      return init;
    }
  });
  const set = (x: boolean) => {
    setV(x);
    try {
      localStorage.setItem(key, x ? "1" : "0");
    } catch {}
  };
  return [v, set];
}

function useLocalString(key: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const set = (x: string) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set];
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [cur, setCur] = useState<PersonDetail | null>(null);
  const [ch, setCh] = useState<CharId>("mirai");
  const [face, setFace] = useState<Face>("normal");
  const [talking, setTalking] = useState(false);
  const [tts, setTts] = useLocal("tts", false);
  // 読み上げの声（端末ごと）。空なら一番自然そうな声を自動で選ぶ
  const [voiceName, setVoiceName] = useLocalString("voice");
  const voices = useJaVoices();
  const [tab, setTab] = useState<Tab>("review");
  const [st, setSt] = useState("");
  const [busy, setBusy] = useState(false);
  // 送信中だけ表示する一時的な吹き出し（完了後はサーバーから取り直す）
  const [pending, setPending] = useState<Msg[] | null>(null);
  const [memo, setMemo] = useState("");
  const memoTimer = useRef<number>(0);

  const loadPerson = useCallback(async (id: number) => {
    const p = await api.person(id);
    setCur(p);
    setMemo(p.memo);
    return p;
  }, []);

  const reload = useCallback(
    async (prefer?: number) => {
      const s = await api.state();
      setState(s);
      if (isChar(s.character)) setCh(s.character);
      const id = [prefer, cur?.id, s.current].find((x) => x && s.people.some((p) => p.id === x)) ?? s.people[0].id;
      await loadPerson(id);
    },
    [cur?.id, loadPerson],
  );

  useEffect(() => {
    reload().catch((e) => setSt("サーバーに接続できない: " + e.message));
    // 初回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (t: string) => {
    if (!tts) return;
    speak(t, voiceName, { start: () => setTalking(true), end: () => setTalking(false) });
  };
  // iPhoneのSafariはタップ直後でないと読み上げが始まらないので、送信時に空発話で解錠しておく
  const unlockTts = () => {
    if (tts && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  };
  const showFace = (t: string) => {
    const m = t.match(TAG);
    setFace(m && FACES.includes(m[1] as Face) ? (m[1] as Face) : "normal");
  };

  if (!state || !cur) {
    return (
      <div className="w">
        <p className="hint">{st || "読み込み中…"}</p>
      </div>
    );
  }

  const selectPerson = async (id: number) => {
    window.speechSynthesis?.cancel();
    await api.settings({ current: id });
    await loadPerson(id);
    setPending(null);
  };

  // スマホで入力欄が並ぶと窮屈なので、名前はダイアログで聞く
  const addPerson = async () => {
    const n = window.prompt("追加する相手の名前")?.trim();
    if (!n) return;
    const p = await api.addPerson(n);
    await api.settings({ current: p.id });
    await reload(p.id);
    setSt("");
  };

  const renamePerson = async () => {
    const n = window.prompt("新しい名前", cur.name)?.trim();
    if (!n || n === cur.name) return;
    await api.updatePerson(cur.id, { name: n });
    await reload(cur.id);
    setSt("");
  };

  return (
    <div className="w">
      <div className="top">
        <Avatar ch={ch} face={face} talking={talking} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>婚活エージェント</b>
          <div className="row" style={{ marginTop: 2 }}>
          <select
            style={{ flex: 1, minWidth: 0 }}
            value={ch}
            onChange={(e) => {
              const c = e.target.value as CharId;
              setCh(c);
              setFace("normal");
              api.settings({ character: c });
            }}
          >
            {Object.entries(CHARS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            title="声で返す"
            className={tts ? "on" : ""}
            onClick={() => {
              if (tts) window.speechSynthesis?.cancel();
              setTts(!tts);
            }}
          >
            {tts ? "🔊" : "🔇"}
          </button>
          </div>
          {tts && voices.length > 0 && (
            <select
              title="読み上げの声"
              style={{ marginTop: 6, width: "100%" }}
              value={voices.some((v) => v.name === voiceName) ? voiceName : ""}
              onChange={(e) => {
                const name = e.target.value;
                setVoiceName(name);
                speak("こんにちは！今日のデート、どうだった？", name, {
                  start: () => setTalking(true),
                  end: () => setTalking(false),
                });
              }}
            >
              <option value="">声: 自動（{voiceLabel(voices[0])}）</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  声: {voiceLabel(v)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="row">
        <select style={{ flex: 1, minWidth: 0 }} value={cur.id} onChange={(e) => selectPerson(Number(e.target.value))}>
          {state.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button title="新しい相手を追加" onClick={addPerson}>
          ＋
        </button>
        <button title="名前変更" onClick={renamePerson}>
          ✏️
        </button>
        <DeleteButton
          name={cur.name}
          setSt={setSt}
          onDelete={async () => {
            await api.deletePerson(cur.id);
            await reload(-1);
          }}
        />
      </div>
      {/* メモは畳んでおけるように（スマホで会話欄を広く使うため）。空のときは最初から開く */}
      <details key={cur.id} className="memo" open={!cur.memo}>
        <summary>📝 メモ{memo ? "：" + memo.replace(/\s+/g, " ") : "（好み・職業・会った回数など）"}</summary>
        <textarea
          rows={3}
          placeholder="この人のメモ（好み・職業・会った回数など。相談時に参考にします）"
          value={memo}
          onChange={(e) => {
            const v = e.target.value;
            setMemo(v);
            clearTimeout(memoTimer.current);
            const id = cur.id;
            memoTimer.current = window.setTimeout(() => api.updatePerson(id, { memo: v }), 500);
          }}
        />
      </details>

      <div className="tabs">
        {(
          [
            ["review", "振り返り"],
            ["date", "デート相談"],
            ["line", "LINE"],
            ["log", "記録"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            className={tab === t ? "on" : ""}
            onClick={() => {
              setTab(t);
              setSt("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* お知らせは画面下だと見えないので、タブのすぐ下に出す */}
      {st && (
        <p className="st" onClick={() => setSt("")}>
          {st}
        </p>
      )}

      {(tab === "review" || tab === "date") && (
        <ChatPanel
          key={cur.id + tab}
          mode={tab}
          person={cur}
          ch={ch}
          busy={busy}
          pending={pending}
          setSt={setSt}
          onSend={async (text) => {
            setBusy(true);
            unlockTts();
            setPending([...cur[tab], { role: "user", content: text }, { role: "assistant", content: "…" }]);
            try {
              const full = await streamPost(`/people/${cur.id}/chat`, { mode: tab, character: ch, text }, (t) =>
                setPending([...cur[tab], { role: "user", content: text }, { role: "assistant", content: t }]),
              );
              await loadPerson(cur.id);
              setPending(null);
              showFace(full);
              say(full);
              return true;
            } catch (e) {
              setPending([
                ...cur[tab],
                { role: "user", content: text },
                { role: "assistant", content: "ごめん、うまく返せなかった（" + (e as Error).message + "）" },
              ]);
              return false;
            } finally {
              setBusy(false);
            }
          }}
          onSaveLog={async () => {
            setSt("記録をまとめてる…");
            try {
              await api.saveLog(cur.id);
              await loadPerson(cur.id);
              setSt("記録に保存したよ（記録タブで見れる）");
            } catch (e) {
              setSt((e as Error).message || "まとめられなかった");
            }
          }}
        />
      )}

      {tab === "line" && (
        <LinePanel
          key={cur.id}
          initialMine={state.myline}
          onGenerate={async (theirs, mine, onText) => {
            setState({ ...state, myline: mine });
            return streamPost(`/people/${cur.id}/line`, { character: ch, theirs, mine }, onText);
          }}
        />
      )}

      {tab === "log" && (
        <LogPanel
          person={cur}
          onDelete={async (id) => {
            await api.deleteLog(id);
            await loadPerson(cur.id);
          }}
        />
      )}

      <p className="hint">※ 音声入力はChrome/Safari推奨。iPhoneでは https のURL（Tailscale経由）で開いてね。</p>

      <ImportBox
        onDone={async (n) => {
          setSt(`${n}人分を取り込んだよ`);
          await reload();
        }}
      />
    </div>
  );
}

function DeleteButton({ name, setSt, onDelete }: { name: string; setSt: (s: string) => void; onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(0);
  return (
    <button
      title="削除"
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          setSt(name + "のスレッドが全部消えます。もう一度押すと削除");
          timer.current = window.setTimeout(() => {
            setArmed(false);
            setSt("");
          }, 3000);
          return;
        }
        clearTimeout(timer.current);
        setArmed(false);
        await onDelete();
        setSt("");
      }}
    >
      {armed ? "本当に？" : "🗑"}
    </button>
  );
}

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
};
const SRClass = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

function ChatPanel(props: {
  mode: Mode;
  person: PersonDetail;
  ch: CharId;
  busy: boolean;
  pending: Msg[] | null;
  setSt: (s: string) => void;
  onSend: (text: string) => Promise<boolean>;
  onSaveLog: () => void;
}) {
  const { mode, person, busy, pending, setSt } = props;
  const [inp, setInpState] = useState("");
  // 音声認識のコールバックから最新の入力内容を読むため、ref にも持っておく
  const inpRef = useRef("");
  const setInp = (v: string) => {
    inpRef.current = v;
    setInpState(v);
  };
  const [rec, setRec] = useState(false);
  // 録音中の認識器。null なら停止中（マイクボタンをもう一度押すまで null にしない）
  const recRef = useRef<SR | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgs = pending ?? person[mode];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs]);

  // タブや相手を切り替えたらマイクを止める
  useEffect(() => () => stopRec(), []);

  const send = async () => {
    const t = inp.trim();
    if (!t || busy) return;
    setInp("");
    // 録音中なら認識をやり直して、送った文が次の認識結果に混ざらないようにする
    recRef.current?.abort();
    if (!(await props.onSend(t))) setInp(t);
  };

  const stopRec = () => {
    const r = recRef.current;
    recRef.current = null;
    setRec(false);
    r?.stop();
  };

  // ブラウザは無音が続くと認識を自動で終えるので、止めるまで開始し直す
  const startRec = () => {
    const r = new SRClass!();
    r.lang = "ja-JP";
    r.interimResults = true;
    r.continuous = true;
    const base = inpRef.current;
    r.onresult = (e) => {
      if (recRef.current !== r) return;
      let s = "";
      for (const x of Array.from(e.results)) s += x[0].transcript;
      setInp(base + s);
    };
    r.onend = () => {
      if (recRef.current === r) startRec();
    };
    r.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(e.error)) {
        stopRec();
        setSt("マイクが使えなかった（ブラウザのマイク許可を確認してね）");
      }
    };
    recRef.current = r;
    try {
      r.start();
    } catch {
      stopRec();
    }
  };

  const mic = () => {
    if (!SRClass) return setSt("このブラウザは音声入力に未対応");
    if (recRef.current) return stopRec();
    setRec(true);
    startRec();
  };

  return (
    <div>
      {/* 会話欄を入力欄と間違えてタップしても、入力欄にカーソルが移るように */}
      <div id="log" ref={logRef} onClick={() => window.getSelection()?.isCollapsed && inputRef.current?.focus()}>
        {!msgs.length && (
          <div className="b assistant">
            {mode === "review"
              ? "今日の" + person.name + "とのデート、どうだった？ 話したことやした行動をそのまま、下の入力欄に書いてね。"
              : "どこで・いくらくらい・相手はどんな人？ ざっくりでOKだから、下の入力欄に書いてね。"}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"b " + m.role}>
            {strip(m.content)}
          </div>
        ))}
      </div>
      {/* スクロールしても入力欄が画面下に残るように */}
      <div className="row composer">
        <button title="音声入力" className={rec ? "rec" : ""} onClick={mic}>
          {rec ? "⏹" : "🎤"}
        </button>
        <textarea
          ref={inputRef}
          rows={2}
          placeholder={
            mode === "review"
              ? "デートの内容や、そのとき言ったこと・やったことを書くか、🎤で話す"
              : "例: 渋谷で1人5000円くらい、相手は映画好き（🎤でもOK）"
          }
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <button className="p" onClick={send} disabled={busy}>
          送信
        </button>
      </div>
      {mode === "review" && (
        <div className="row">
          <button
            style={{ flex: 1 }}
            onClick={() => (person.review.length < 2 ? setSt("振り返りの会話がまだないよ") : props.onSaveLog())}
          >
            💾 この振り返りを記録に保存
          </button>
        </div>
      )}
      {mode === "date" && <ShopLinks person={person} setSt={setSt} />}
    </div>
  );
}

function ShopLinks({ person, setSt }: { person: PersonDetail; setSt: (s: string) => void }) {
  const [area, setArea] = useState("");
  const [genre, setGenre] = useState("");
  const [shops, setShops] = useState<string[]>([]);
  const q = encodeURIComponent((area + " " + genre).trim());
  const findShops = async () => {
    const last = [...person.date].reverse().find((m) => m.role === "assistant");
    if (!last) return setSt("先にデート相談で店を提案してもらってね");
    setSt("店名を拾ってる…");
    try {
      setShops(await api.extractShops(last.content));
      setSt("");
    } catch {
      setSt("店名を拾えなかった");
    }
  };
  return (
    <div>
      <div className="row">
        <input placeholder="エリア（例: 恵比寿）" style={{ flex: 1, minWidth: 0 }} value={area} onChange={(e) => setArea(e.target.value)} />
        <input placeholder="ジャンル（例: イタリアン）" style={{ flex: 1, minWidth: 0 }} value={genre} onChange={(e) => setGenre(e.target.value)} />
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <a className="ab" target="_blank" rel="noopener" href={"https://www.google.com/maps/search/?api=1&query=" + q}>
          Googleマップ
        </a>
        <a
          className="ab"
          target="_blank"
          rel="noopener"
          href={"https://tabelog.com/rst/rstsearch/?sa=" + encodeURIComponent(area) + "&sw=" + encodeURIComponent(genre)}
        >
          食べログ
        </a>
        <a className="ab" target="_blank" rel="noopener" href={"https://www.hotpepper.jp/CSP/psh010/doSearch?FWT=" + q}>
          ホットペッパー
        </a>
        <button onClick={findShops}>📍 提案された店を地図で確認</button>
      </div>
      <div id="links">
        {shops.map((n) => (
          <a
            key={n}
            className="ab"
            target="_blank"
            rel="noopener"
            href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((area + " " + n).trim())}
          >
            📍{n}
          </a>
        ))}
      </div>
    </div>
  );
}

function LinePanel({
  initialMine,
  onGenerate,
}: {
  initialMine: string;
  onGenerate: (theirs: string, mine: string, onText: (t: string) => void) => Promise<string>;
}) {
  const [theirs, setTheirs] = useState("");
  const [mine, setMine] = useState(initialMine);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const outRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <label>相手から来たLINE（状況も一言）</label>
      <textarea rows={3} value={theirs} onChange={(e) => setTheirs(e.target.value)} />
      <details className="memo" open={!initialMine}>
        <summary>過去の自分のLINE（口調の参考にします）{mine ? "：保存済み" : ""}</summary>
        <textarea rows={5} placeholder="自分の発言だけ、改行区切りでOK" value={mine} onChange={(e) => setMine(e.target.value)} />
      </details>
      <div className="row">
        <button
          className="p"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={async () => {
            if (!theirs.trim()) return;
            setBusy(true);
            setOut("考え中…");
            // スマホではキーボードを閉じて、返信案が見える位置までスクロールする
            (document.activeElement as HTMLElement | null)?.blur();
            setTimeout(() => outRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
            try {
              setOut(await onGenerate(theirs, mine, setOut));
            } catch (e) {
              setOut("うまく作れなかった。もう一度試してね（" + (e as Error).message + "）");
            } finally {
              setBusy(false);
            }
          }}
        >
          返信案を出す
        </button>
      </div>
      <div id="out" ref={outRef} className={out ? "" : "hint"}>
        {out ? strip(out) : "ここに返信案が出ます"}
      </div>
      {out && !busy && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {/* 案ごとに、LINEにそのまま貼れる文面だけをコピーできるように */}
          {[...replyDrafts(out).map((d, i) => [`📋 案${i + 1}`, d]), ["📋 全部", strip(out)]].map(([label, text]) => (
            <button
              key={label}
              style={{ flex: 1 }}
              onClick={async () => {
                if (await copyText(text)) {
                  setCopied(label);
                  setTimeout(() => setCopied(""), 2000);
                }
              }}
            >
              {copied === label ? "コピーした ✓" : label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// クリップボードAPIは権限やブラウザによって失敗するので、昔ながらの方法でコピーする（iPhoneでも動く）
async function copyText(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.readOnly = true;
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  ta.remove();
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function LogPanel({ person, onDelete }: { person: PersonDetail; onDelete: (id: number) => void }) {
  if (!person.log.length) {
    return <div className="hint">まだ記録なし。「デート振り返り」で話したあと💾を押すと、ここに溜まるよ。</div>;
  }
  return (
    <div>
      {person.log.map((x) => (
        <div key={x.id} className="card">
          <b>
            {x.d} {x.title}
          </b>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {[x.summary, x.good && "👍 " + x.good, x.next && "➡️ " + x.next].filter(Boolean).join("\n")}
          </div>
          <button onClick={() => onDelete(x.id)}>削除</button>
        </div>
      ))}
    </div>
  );
}

function ImportBox({ onDone }: { onDone: (n: number) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <details>
      <summary>試作版のデータを取り込む</summary>
      <p className="hint">
        試作版で書き出したJSON（{"{"}"people": …, "myline": …{"}"}）を貼って「取り込む」。いまのデータは消えず、相手が追加されます。
      </p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button
          onClick={async () => {
            try {
              const data = JSON.parse(text);
              const r = await api.import(data);
              setText("");
              setMsg("");
              onDone(r.count);
            } catch (e) {
              setMsg("取り込めなかった: " + (e as Error).message);
            }
          }}
        >
          取り込む
        </button>
      </div>
      {msg && <p className="hint err">{msg}</p>}
    </details>
  );
}
