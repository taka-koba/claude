import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

const client = new Anthropic();
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// 安全分類器に断られたとき、サーバー側で推奨モデルに自動で切り替える
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export class RefusalError extends Error {}

// fallback ブロック以降のテキストだけを返す（断られた側の途中出力は捨てる）
function finalText(content: Anthropic.Beta.BetaContentBlock[]): string {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  return content
    .slice(lastFallback + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function streamText(
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  onText: (delta: string) => void | Promise<void>,
): Promise<string> {
  const stream = client.beta.messages.stream({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    system,
    messages,
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      await onText(ev.delta.text);
    }
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new RefusalError("refusal");
  return finalText(msg.content);
}

export async function parseJson<T extends z.ZodType>(
  schema: T,
  instruction: string,
  text: string,
): Promise<z.infer<T>> {
  const msg = await client.beta.messages.parse({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: instruction + "\n\n" + text }],
  });
  if (msg.stop_reason === "refusal") throw new RefusalError("refusal");
  if (msg.parsed_output == null) throw new Error("parse failed");
  return msg.parsed_output as z.infer<T>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof RefusalError) return "その内容にはうまく答えられなかった。言い方を変えてみてね";
  if (e instanceof Anthropic.AuthenticationError) return "APIキーが正しくないみたい（.env を確認してね）";
  if (e instanceof Anthropic.RateLimitError) return "混み合ってるみたい。少し待ってからもう一度";
  if (e instanceof Anthropic.APIConnectionError) return "AIに接続できなかった。ネット接続を確認してね";
  if (e instanceof Anthropic.APIError) return `AIの呼び出しでエラー（${e.status}）`;
  return "うまく返せなかった";
}
