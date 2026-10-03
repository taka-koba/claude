import { useEffect, useState } from "react";

// 端末に入っている読み上げ音声のうち、自然に聞こえやすいものを優先する
const RANK: [RegExp, number][] = [
  [/Natural|Neural/i, 50], // Edge のニューラル音声（Nanami など）
  [/Premium|プレミアム/i, 40], // iPhone で追加ダウンロードした高品質音声
  [/Enhanced|拡張/i, 30],
  [/Google/i, 20], // Chrome のオンライン音声
  [/Online/i, 10],
];
const score = (v: SpeechSynthesisVoice) => RANK.reduce((s, [re, n]) => (re.test(v.name) ? s + n : s), 0);

export function jaVoices(): SpeechSynthesisVoice[] {
  if (!window.speechSynthesis) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"))
    .sort((a, b) => score(b) - score(a));
}

// 音声の一覧は後から読み込まれることがあるので、変化を待つ
export function useJaVoices() {
  const [voices, setVoices] = useState(jaVoices);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const update = () => setVoices(jaVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

export const voiceLabel = (v: SpeechSynthesisVoice) =>
  v.name.replace(/^Microsoft\s+/, "").replace(/\s+-\s+Japanese.*$/, "");

// 絵文字や記号まで読み上げると機械っぽくなるので、読む前に取り除く
function speakable(t: string) {
  return t
    .replace(/\[表情:\w+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\*\*|__|`|[「」『』]/g, "")
    .replace(/^\s*(#+|>|[-*・]|\d+\.)\s*/gm, "")
    // 句読点のない改行（見出しや箇条書き）でも一呼吸おく
    .replace(/([^\s。！？!?、])[ \t]*\n/g, "$1。\n")
    .trim();
}

// 長文は途中で切れるブラウザがあるので、文ごとに区切って順に読む
function chunks(t: string) {
  const out: string[] = [];
  for (const s of t.split(/(?<=[。！？!?\n])/)) {
    const p = s.trim();
    if (!p) continue;
    if (out.length && out[out.length - 1].length + p.length < 80) out[out.length - 1] += p;
    else out.push(p);
  }
  return out;
}

export function speak(text: string, voiceName: string, on: { start: () => void; end: () => void }) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const voices = jaVoices();
  const voice = voices.find((v) => v.name === voiceName) ?? voices[0];
  const parts = chunks(speakable(text));
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = voice?.lang ?? "ja-JP";
    if (voice) u.voice = voice;
    if (i === 0) u.onstart = on.start;
    if (i === parts.length - 1) u.onend = on.end;
    u.onerror = on.end;
    speechSynthesis.speak(u);
  });
}
