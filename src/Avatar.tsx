import type { CharId } from "./api";

export type Face = "normal" | "happy" | "shy" | "worry";
export const FACES: Face[] = ["normal", "happy", "shy", "worry"];

// 試作版のインラインSVGイラストをそのまま移植（髪色・髪型だけキャラごとに違う）
const HC: Record<CharId, [string, "tw" | "sh" | "lg"]> = {
  mirai: ["#f08ab4", "tw"],
  ren: ["#3d4f7a", "sh"],
  sakura: ["#8b5a3c", "lg"],
};

export function avatarSvg(c: CharId, e: Face): string {
  const [h, t] = HC[c];
  const K = "#3a2a30";
  let s = '<svg viewBox="0 0 100 100" width="100%" height="100%">';
  if (t == "lg") s += '<rect x="16" y="30" width="68" height="70" rx="30" fill="' + h + '"/>';
  if (t == "tw")
    s +=
      '<ellipse cx="13" cy="62" rx="9" ry="24" fill="' + h + '"/><ellipse cx="87" cy="62" rx="9" ry="24" fill="' + h + '"/>';
  s +=
    '<ellipse cx="50" cy="54" rx="30" ry="32" fill="#ffe3d0"/><path d="M19 50Q20 12 50 12Q80 12 81 50Q66 30 50 37Q34 30 19 50Z" fill="' +
    h +
    '"/>';
  const eye = (x: number) =>
    e == "happy"
      ? '<path d="M' + (x - 6) + " 56Q" + x + " 47 " + (x + 6) + ' 56" stroke="' + K + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<ellipse cx="' + (e == "shy" ? x + 2 : x) + '" cy="55" rx="4.5" ry="6" fill="' + K + '"/><circle cx="' + (x + (e == "shy" ? 3.5 : 1.5)) + '" cy="53" r="1.8" fill="#fff"/>';
  s += eye(37) + eye(63);
  if (e == "worry") s += '<path d="M31 46L42 43M58 43L69 46" stroke="' + K + '" stroke-width="2" stroke-linecap="round"/>';
  if (t == "sh")
    s += '<g fill="none" stroke="#555" stroke-width="2"><circle cx="37" cy="55" r="9"/><circle cx="63" cy="55" r="9"/><path d="M46 55H54"/></g>';
  if (e == "happy" || e == "shy")
    s +=
      '<ellipse cx="29" cy="65" rx="6" ry="3.5" fill="#ff8aa0" opacity=".55"/><ellipse cx="71" cy="65" rx="6" ry="3.5" fill="#ff8aa0" opacity=".55"/>';
  const m =
    {
      normal: '<path d="M44 70Q50 75 56 70" stroke="#c0506a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      happy: '<path d="M41 68Q50 82 59 68Z" fill="#c0506a"/>',
      shy: '<path d="M46 72Q50 74 54 72" stroke="#c0506a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      worry: '<path d="M44 74Q50 68 56 74" stroke="#c0506a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    }[e] || "";
  return s + '<g class="sm">' + m + '</g><ellipse class="mo" cx="50" cy="71" rx="5" ry="4" fill="#c0506a"/></svg>';
}

export function Avatar({ ch, face, talking }: { ch: CharId; face: Face; talking: boolean }) {
  return (
    <div id="av" className={talking ? "talk" : ""} dangerouslySetInnerHTML={{ __html: avatarSvg(ch, face) }} />
  );
}
