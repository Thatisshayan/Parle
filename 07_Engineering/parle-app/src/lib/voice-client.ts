import { parleVoiceService } from "@/functions";
import type { TranslationKey } from "@/lib/i18n";
import type { SpeakingAssessment } from "./placement-test";
import { encodeWav16, splitForUpload, UPLOAD_RATE } from "./voice-audio";
import { countSpokenWords } from "./voice-text";

/** Plan 9: calls to the voice relay (/api/voice) and to parle-voice-service. */
export class VoiceRequestError extends Error {
  code: string;
  info: { limit?: number; plan?: "free" | "premium" };
  constructor(code: string, info: { limit?: number; plan?: "free" | "premium" } = {}) {
    super(code);
    this.name = "VoiceRequestError";
    this.code = code;
    this.info = info;
  }
}
type Deps = { token: () => Promise<string | null>; fetch: (input: string, init: RequestInit) => Promise<Response>; wait: (ms: number) => Promise<void> };
const defaults: Deps = {
  token: async () => {
    const { supabase } = await import("@/lib/backend/client");
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  },
  fetch: (input, init) => fetch(input, init),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
let deps: Deps = defaults;
/** Tests replace the token, fetch and wait; null restores the defaults. */
export function setVoiceDeps(next: Partial<Deps> | null) { deps = next ? { ...defaults, ...next } : defaults; }

const isObject = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const infoOf = (b: Record<string, unknown>) => ({ limit: typeof b.limit === "number" ? b.limit : undefined, plan: b.plan === "premium" || b.plan === "free" ? (b.plan as "free" | "premium") : undefined });
/** Errors thrown by the functions proxy carry the answer body. */
export function voiceErrorFrom(error: unknown): VoiceRequestError {
  if (error instanceof VoiceRequestError) return error;
  const body = isObject((error as { body?: unknown })?.body) ? (error as { body: Record<string, unknown> }).body : {};
  return new VoiceRequestError(String(body.error_code ?? "REQUEST_FAILED"), infoOf(body));
}

async function relay(query: URLSearchParams, init: RequestInit): Promise<Response> {
  const token = await deps.token();
  if (!token) throw new VoiceRequestError("AUTH_REQUIRED");
  const r = await deps.fetch(`/api/voice?${query.toString()}`, { ...init, headers: { ...((init.headers ?? {}) as Record<string, string>), Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!r) throw new VoiceRequestError("VOICE_BUSY");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    throw new VoiceRequestError(String(body.error_code ?? (r.status === 429 ? "LIMIT_REACHED" : "VOICE_BUSY")), infoOf(body));
  }
  return r;
}

export type Transcription = { ticketId: string; transcript: string; words: number; durationMs: number; remaining: number | null };
export async function transcribe(samples: Float32Array, purpose: "answer" | "message" | "placement", ref: string): Promise<Transcription> {
  const parts = purpose === "message" ? [samples] : splitForUpload(samples, UPLOAD_RATE);
  let ticketId = "", transcript = "", durationMs = 0;
  let remaining: number | null = null;
  for (let i = 0; i < parts.length; i++) {
    const query = new URLSearchParams({ action: "transcribe", purpose, ref, part: String(i + 1) });
    if (ticketId) query.set("ticket", ticketId);
    const r = await relay(query, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: encodeWav16(parts[i], UPLOAD_RATE) });
    const body = (await r.json()) as Record<string, unknown>;
    if (i === 0) { ticketId = String(body.ticket_id ?? ""); remaining = typeof body.remaining === "number" ? body.remaining : null; }
    transcript = [transcript, String(body.transcript ?? "")].filter(Boolean).join(" ");
    durationMs += Number(body.duration_ms ?? 0);
  }
  return { ticketId, transcript, words: countSpokenWords(transcript), durationMs, remaining };
}

export async function speakChunk(text: string, replyId: string): Promise<Blob> {
  const r = await relay(new URLSearchParams({ action: "speak" }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, reply_id: replyId }) });
  return r.blob();
}

/** A playable link for a listening item; waits while another request is making the audio. */
export async function listeningUrl(kind: "question_item" | "learner_task", id: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await relay(new URLSearchParams({ action: "listen" }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_kind: kind, item_id: id }) });
      return String(((await r.json()) as Record<string, unknown>).url ?? "");
    } catch (error) {
      if (error instanceof VoiceRequestError && error.code === "AUDIO_BEING_MADE" && attempt < 5) { await deps.wait(3000); continue; }
      throw error;
    }
  }
  throw new VoiceRequestError("VOICE_BUSY");
}

async function service(action: string, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
  try {
    const r = await parleVoiceService({ action, ...body });
    return isObject(r) ? r : {};
  } catch (error) {
    throw voiceErrorFrom(error);
  }
}

export type VoiceAllowance = { limit: number; used: number; remaining: number };
export type VoiceStatus = { plan: "free" | "premium"; answers: VoiceAllowance; messages: VoiceAllowance; replies: VoiceAllowance; readAloud: boolean };
const allowance = (v: unknown): VoiceAllowance => ({ limit: Number(isObject(v) ? v.limit : 0) || 0, used: Number(isObject(v) ? v.used : 0) || 0, remaining: Number(isObject(v) ? v.remaining : 0) || 0 });
export async function loadVoiceStatus(): Promise<VoiceStatus> {
  const s = await service("voice_status");
  return { plan: s.plan === "premium" ? "premium" : "free", answers: allowance(s.answers), messages: allowance(s.messages), replies: allowance(s.replies), readAloud: s.read_aloud === true };
}
export async function saveReadAloud(on: boolean): Promise<boolean> {
  return (await service("voice_set_read_aloud", { read_aloud: on })).read_aloud === true;
}

export type SpeakingCorrection = { said: string; better: string; reason: string };
export type SpeakingResult = {
  id: string; mode: "spoken" | "typed"; transcript: string;
  criteria: { task_completion: number; vocabulary: number; grammar: number; coherence_fluency: number };
  level: string; nclc: string; corrections: SpeakingCorrection[]; tip: string; wordsPerMinute: number | null; durationMs: number;
};
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
export function safeSpeakingResult(v: unknown): SpeakingResult | null {
  if (!isObject(v) || !LEVELS.includes(String(v.level)) || !isObject(v.criteria)) return null;
  const c = v.criteria;
  const score = (n: unknown) => (Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 4 ? Number(n) : null);
  const criteria = { task_completion: score(c.task_completion), vocabulary: score(c.vocabulary), grammar: score(c.grammar), coherence_fluency: score(c.coherence_fluency) };
  if (Object.values(criteria).some((n) => n === null)) return null;
  return {
    id: str(v.id, 64), mode: v.mode === "typed" ? "typed" : "spoken", transcript: str(v.transcript, 6000), criteria: criteria as SpeakingResult["criteria"],
    level: String(v.level), nclc: str(v.nclc, 40), tip: str(v.tip, 600),
    corrections: (Array.isArray(v.corrections) ? v.corrections : []).filter(isObject).slice(0, 3).map((x) => ({ said: str(x.said, 300), better: str(x.better, 300), reason: str(x.reason, 300) })),
    wordsPerMinute: typeof v.words_per_minute === "number" ? v.words_per_minute : null, durationMs: Number(v.duration_ms ?? 0) || 0,
  };
}
export type ScoreOutcome = { status: "scored"; result: SpeakingResult } | { status: "too_short" | "not_french" };
export function safeOutcome(v: unknown): ScoreOutcome {
  const o = isObject(v) ? v : {};
  if (o.status === "too_short" || o.status === "not_french") return { status: o.status };
  const result = o.status === "scored" ? safeSpeakingResult(o.result) : null;
  if (!result) throw new VoiceRequestError("SCORE_FAILED");
  return { status: "scored", result };
}
/** Scores a transcribed answer; a second press while it is being scored waits for the same result (Review Focus 2). */
export async function scoreSpokenAnswer(ticketId: string, taskId: string): Promise<ScoreOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      return safeOutcome(await service("speaking_score", { ticket_id: ticketId, task_id: taskId }));
    } catch (error) {
      if (error instanceof VoiceRequestError && error.code === "SCORING_IN_PROGRESS" && attempt < 5) { await deps.wait(3000); continue; }
      throw error;
    }
  }
}
export const scoreTypedAnswer = async (taskId: string, text: string) => safeOutcome(await service("speaking_score_typed", { task_id: taskId, text }));
export const loadTaskSpeakingResult = async (taskId: string) => safeSpeakingResult((await service("speaking_result", { task_id: taskId })).result);
export async function loadListeningMissing(): Promise<{ total: number; missing: Array<{ item_kind: "question_item" | "learner_task"; item_id: string }> }> {
  const r = await service("admin_listening_missing");
  const missing = (Array.isArray(r.missing) ? r.missing : []).filter(isObject).map((m) => ({ item_kind: m.item_kind === "learner_task" ? "learner_task" as const : "question_item" as const, item_id: str(m.item_id, 64) })).filter((m) => m.item_id);
  return { total: Number(r.total ?? missing.length) || 0, missing };
}
export function resultFromAssessment(a: SpeakingAssessment): SpeakingResult {
  return { id: `placement-${a.prompt_id}`, mode: "spoken", transcript: a.transcript, criteria: a.rubric, level: a.spoken_level, nclc: a.nclc, corrections: a.corrections, tip: a.tip, wordsPerMinute: a.words_per_minute, durationMs: 0 };
}

export function voiceErrorKey(error: unknown, kind: "answer" | "message" | "reply" | "listening"): TranslationKey {
  const code = error instanceof VoiceRequestError ? error.code : "";
  if (code === "LIMIT_REACHED") return kind === "message" ? "voice.limit.messages" : kind === "reply" ? "voice.limit.replies" : "voice.limit.answers";
  if (code === "PLACEMENT_ATTEMPTS_USED") return "voice.placementAttempts";
  if (code === "SCORE_FAILED") return "voice.scoreFailed";
  if (kind === "listening") return "voice.listening.unavailable";
  if (["VOICE_BUSY", "VOICE_NOT_CONFIGURED", "AUDIO_BEING_MADE", "RATE_LIMITED", "SCORING_IN_PROGRESS", "REQUEST_FAILED"].includes(code)) return "voice.busy";
  return "voice.failed";
}
