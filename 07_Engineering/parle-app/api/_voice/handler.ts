import { AudioError, readWav } from "./wav.js";
import { encodeMp3 } from "./mp3.js";
import { ProviderError, providerFor, TTS_RATE, withTimeout, type Env, type VoiceProvider } from "./provider.js";
import { backendFor, type Backend } from "./backend.js";

const MAX_PART_BYTES = 2_400_000; // 60 s of 16 kHz 16-bit mono is 1.92 MB (Vercel's limit is 4.5 MB)
const MAX_PART_MS = 61_000;
const MAX_TEXT = 1100; // the app sends at most 1,000 characters (spec 3)
const PIECE = 400; // per NVIDIA call (ruling 5)
const PROVIDER_MS = 30_000; // spec 3
// Plan 11 (A90, R98): one budget for all pieces of a text, under Vercel's 60 s with room for the backend calls and the MP3
const BUDGET_MS = 50_000;
const BUSY = "Voice is busy. Try again in a moment.";
const PURPOSES = new Set(["answer", "message", "placement"]);

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const refuse = (code: string, status: number, extra: Record<string, unknown> = {}) => json({ error: code, error_code: code, ...extra }, status);

/** Sentence-sized pieces of at most `max` characters, in order (words are never cut). */
export function pieces(text: string, max = PIECE): string[] {
  const out: string[] = [];
  let current = "";
  const push = (s: string) => {
    if (!s) return;
    if (current && current.length + 1 + s.length <= max) { current = `${current} ${s}`; return; }
    if (current) out.push(current);
    current = s;
  };
  for (const sentence of text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…,;:])\s+/u)) {
    if (sentence.length <= max) { push(sentence); continue; }
    let rest = sentence;
    while (rest.length > max) {
      const space = rest.lastIndexOf(" ", max);
      const at = space > 0 ? space : max;
      push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    push(rest);
  }
  if (current) out.push(current);
  return out;
}

export async function synthesizeAll(provider: VoiceProvider, text: string, budgetMs = BUDGET_MS): Promise<Int16Array> {
  const deadline = Date.now() + budgetMs;
  const parts: Int16Array[] = [];
  for (const piece of pieces(text)) {
    const left = deadline - Date.now();
    if (left <= 0) throw new ProviderError("VOICE_BUSY");
    parts.push(await withTimeout(provider.synthesize(piece), Math.min(PROVIDER_MS, left)));
  }
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

async function transcribe(req: Request, url: URL, env: Env, backend: Backend): Promise<Response> {
  const purpose = url.searchParams.get("purpose") ?? "";
  const ref = url.searchParams.get("ref") ?? "";
  const ticket = url.searchParams.get("ticket") ?? "";
  const part = Number(url.searchParams.get("part") ?? "1");
  if (!PURPOSES.has(purpose) || !Number.isInteger(part) || part < 1 || part > (purpose === "message" ? 1 : 4)) return refuse("INVALID_INPUT", 400);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_PART_BYTES) return refuse("AUDIO_TOO_LARGE", 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_PART_BYTES) return refuse("AUDIO_TOO_LARGE", 413);
  let durationMs: number;
  try {
    durationMs = readWav(bytes).durationMs;
  } catch (e) {
    return refuse(e instanceof AudioError ? e.code : "BAD_AUDIO", 400);
  }
  if (durationMs > MAX_PART_MS) return refuse("PART_TOO_LONG", 400);
  const provider = await providerFor(env);
  const take = await backend("voice_take", { kind: purpose, ref, part, ...(ticket ? { ticket_id: ticket } : {}) });
  if (take.status !== 200) return json(take.body, take.status);
  const ticketId = String(take.body.ticket_id ?? "");
  let heard: string;
  try {
    heard = await withTimeout(provider.transcribe(bytes), PROVIDER_MS);
  } catch {
    await backend("voice_release", { ticket_id: ticketId });
    return refuse("VOICE_BUSY", 503, { message: BUSY });
  }
  const saved = await backend("voice_part", { ticket_id: ticketId, part, transcript: heard, duration_ms: durationMs });
  if (saved.status !== 200) return json(saved.body, saved.status);
  return json({
    ticket_id: ticketId, part, transcript: saved.body.transcript ?? "", words: saved.body.words ?? 0,
    duration_ms: saved.body.duration_ms ?? durationMs, total_ms: saved.body.total_ms ?? durationMs,
    remaining: take.body.remaining ?? null, plan: take.body.plan ?? null,
  });
}

async function speak(body: Record<string, unknown>, env: Env, backend: Backend): Promise<Response> {
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  const replyId = typeof body.reply_id === "string" ? body.reply_id : "";
  if (!text || text.length > MAX_TEXT || !replyId) return refuse("INVALID_INPUT", 400);
  const provider = await providerFor(env);
  const take = await backend("voice_take", { kind: "reply", ref: replyId, text });
  if (take.status !== 200) return json(take.body, take.status);
  let pcm: Int16Array;
  try {
    pcm = await synthesizeAll(provider, text);
  } catch {
    if (!take.body.again) await backend("voice_release", { ticket_id: take.body.ticket_id });
    return refuse("VOICE_BUSY", 503, { message: BUSY });
  }
  return new Response(encodeMp3(pcm, TTS_RATE), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice-Remaining": String(take.body.remaining ?? "") },
  });
}

async function listen(body: Record<string, unknown>, env: Env, backend: Backend): Promise<Response> {
  const itemKind = typeof body.item_kind === "string" ? body.item_kind : "";
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  if (!itemKind || !itemId) return refuse("INVALID_INPUT", 400);
  const provider = await providerFor(env);
  const claim = await backend("listening_claim", { item_kind: itemKind, item_id: itemId });
  if (claim.status !== 200) return json(claim.body, claim.status);
  if (claim.body.state === "ready" || claim.body.state === "recording") return json({ url: claim.body.url, generated: false });
  if (claim.body.state === "busy") return refuse("AUDIO_BEING_MADE", 409, { message: "The audio is being prepared. Try again in a few seconds." });
  // A89 (R97): a failed generation gives its claim back, so the next request makes the audio at once
  const release = () => backend("listening_release", { cache_key: claim.body.cache_key }).catch(() => null);
  let pcm: Int16Array;
  try {
    pcm = await synthesizeAll(provider, String(claim.body.script ?? ""));
  } catch (e) {
    await release();
    throw e;
  }
  const stored = await backend("listening_store", { cache_key: claim.body.cache_key, audio_base64: Buffer.from(encodeMp3(pcm, TTS_RATE)).toString("base64") });
  if (stored.status !== 200) {
    await release();
    return json(stored.body, stored.status);
  }
  return json({ url: stored.body.url, generated: true });
}

/** POST /api/voice (spec 3). Never stores or logs audio or text. */
export async function handleVoice(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return refuse("METHOD_NOT_ALLOWED", 405);
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return refuse("AUTH_REQUIRED", 401);
  const backend = backendFor(env, token);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  try {
    if (action === "transcribe") return await transcribe(req, url, env, backend);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return refuse("INVALID_INPUT", 400);
    if (action === "speak") return await speak(body as Record<string, unknown>, env, backend);
    if (action === "listen") return await listen(body as Record<string, unknown>, env, backend);
    return refuse("UNKNOWN_ACTION", 400);
  } catch (e) {
    if (e instanceof ProviderError) return refuse(e.code, 503, { message: BUSY });
    console.error("voice relay failed", { action, error: (e as Error)?.name ?? "unknown" });
    return refuse("VOICE_FAILED", 500);
  }
}
