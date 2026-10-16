import { cleanTranscript, countSpokenWords, MAX_SPEAK_CHARS, spokenTextIsFrom } from "../../_app/src/lib/voice-text.ts";
import { takeRateLimit } from "../rate-limit.ts";
import { learnerDay, MAX_PARTS, PLACEMENT_ATTEMPTS, planOf, voiceLimits, VoiceError, type VoiceContext, type VoiceKind } from "./context.ts";

const KINDS: VoiceKind[] = ["answer", "message", "reply", "placement"];
export const SPEAKING_TASK_TYPES = ["speaking_practice", "speaking_check"];
const OPEN = ["planned", "rolled"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PART_MS = 61_000; // 60 s parts, with a second of slack
const TOTAL_MS = 183_000; // 3 minutes (spec 3), with slack
const PART_REFUSED = () => new VoiceError("PART_REFUSED", 409, "This recording can no longer be added to. Record your answer again.");

function first<T = Record<string, any>>(r: { data: T[] | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(r.error.message);
  return r.data?.[0] ?? null;
}

/** The caller's own speaking task (any status), or null. */
export async function ownSpeakingTask(ctx: VoiceContext, taskId: string): Promise<Record<string, any> | null> {
  if (!UUID.test(taskId)) return null;
  const task = first(await ctx.db.from("learner_task").select("id, type, status, roadmap_id, content_json, topic, owner_id").eq("id", taskId).eq("owner_id", ctx.caller.id).limit(1));
  return task && SPEAKING_TASK_TYPES.includes(String(task.type)) ? task : null;
}

export async function ownTicket(ctx: VoiceContext, id: string): Promise<Record<string, any> | null> {
  if (!UUID.test(id)) return null;
  return first(await ctx.db.from("voice_use").select("*").eq("id", id).eq("user_id", ctx.caller.id).limit(1));
}

/** What the use is for must be the caller's own: an open speaking task, an open placement run, a tutor session, a tutor reply. */
async function checkRef(ctx: VoiceContext, kind: VoiceKind, ref: string, text: string): Promise<void> {
  if (kind === "answer") {
    const task = await ownSpeakingTask(ctx, ref);
    if (!task) throw new VoiceError("TASK_NOT_FOUND", 404, "This speaking task was not found.");
    if (!OPEN.includes(String(task.status))) throw new VoiceError("TASK_CLOSED", 409, "This task is already done.");
    return;
  }
  if (kind === "placement") {
    const run = UUID.test(ref) ? first(await ctx.db.from("placement_run").select("id").eq("id", ref).eq("owner_id", ctx.caller.id).eq("status", "open").limit(1)) : null;
    if (!run) throw new VoiceError("RUN_NOT_FOUND", 404, "This placement test was not found.");
    return;
  }
  if (kind === "message") {
    const session = UUID.test(ref) ? first(await ctx.db.from("ai_session").select("id").eq("id", ref).eq("owner_id", ctx.caller.id).limit(1)) : null;
    if (!session) throw new VoiceError("SESSION_NOT_FOUND", 404, "This tutor session was not found.");
    return;
  }
  if (!text || text.length > MAX_SPEAK_CHARS + 100) throw new VoiceError("INVALID_INPUT", 400, "Choose a shorter part of the reply.");
  const reply = UUID.test(ref) ? first(await ctx.db.from("ai_message").select("text, sender").eq("id", ref).eq("owner_id", ctx.caller.id).limit(1)) : null;
  if (!reply || reply.sender !== "tutor_ai") throw new VoiceError("REPLY_NOT_FOUND", 404, "This reply was not found.");
  if (!spokenTextIsFrom(text, String(reply.text ?? ""))) throw new VoiceError("TEXT_NOT_IN_REPLY", 403, "Only the tutor's own reply can be read aloud.");
}

/** A later part of an answer adds to the same ticket: in order, within 15 minutes, at most MAX_PARTS. No new count. */
async function continueAnswer(ctx: VoiceContext, kind: VoiceKind, ticketId: string, part: number) {
  const t = await ownTicket(ctx, ticketId);
  if (!t || t.kind !== kind || t.status !== "pending" || t.parts !== part - 1 || Date.parse(t.created_at) < ctx.now.getTime() - 15 * 60_000) throw PART_REFUSED();
  return { ticket_id: t.id, kind, plan: null, limit: null, used: null, remaining: null, again: true };
}

/** Relay: take one unit of the learner's daily limit before calling NVIDIA (spec 3). */
export async function voiceTake(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const kind = String(ctx.body.kind ?? "") as VoiceKind;
  if (!KINDS.includes(kind)) throw new VoiceError("INVALID_INPUT", 400);
  const ref = String(ctx.body.ref ?? "").slice(0, 200);
  const part = Number(ctx.body.part ?? 1);
  const multi = kind === "answer" || kind === "placement";
  if (!Number.isInteger(part) || part < 1 || part > (multi ? MAX_PARTS : 1)) throw PART_REFUSED();
  if (part > 1) return continueAnswer(ctx, kind, String(ctx.body.ticket_id ?? ""), part);
  await checkRef(ctx, kind, ref, typeof ctx.body.text === "string" ? ctx.body.text.trim() : "");
  const [plan, { day }, limits] = await Promise.all([planOf(ctx.db, ctx.caller.id), learnerDay(ctx.db, ctx.caller.id, ctx.now), voiceLimits(ctx.db)]);
  const limit = kind === "placement" ? PLACEMENT_ATTEMPTS : limits[kind][plan];
  const { data, error } = await ctx.db.rpc("voice_take", { p_user: ctx.caller.id, p_kind: kind, p_day: day, p_limit: limit, p_ref: ref });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; ticket_id?: string; used: number; again?: boolean };
  if (!r.ok) {
    throw kind === "placement"
      ? new VoiceError("PLACEMENT_ATTEMPTS_USED", 429, "You have used the recordings for this placement test.", { kind, plan, limit, used: r.used })
      : new VoiceError("LIMIT_REACHED", 429, "Today's voice limit is reached.", { kind, plan, limit, used: r.used });
  }
  // replaying a reply is free, but not unlimited: the relay must not become free text-to-speech (Review Focus 5)
  if (r.again && !(await takeRateLimit(ctx.db, `voice:again:${ctx.caller.id}`, 3600, 100))) throw new VoiceError("RATE_LIMITED", 429, "Try again later.", { kind });
  return { ticket_id: r.ticket_id, kind, plan, limit, used: r.used, remaining: kind === "placement" ? null : Math.max(0, limit - r.used), again: r.again === true };
}

/** Relay: save what Whisper heard. Messages keep nothing (the app shows the text); answers add the part in order. */
export async function voicePart(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const t = await ownTicket(ctx, String(ctx.body.ticket_id ?? ""));
  if (!t) throw new VoiceError("TICKET_NOT_FOUND", 404, "This recording was not found.");
  const part = Number(ctx.body.part ?? 1);
  const durationMs = Math.round(Number(ctx.body.duration_ms ?? 0));
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > PART_MS) throw new VoiceError("PART_TOO_LONG", 400, "A part may be at most 60 seconds.");
  const text = cleanTranscript(typeof ctx.body.transcript === "string" ? ctx.body.transcript.slice(0, 6000) : "");
  if (t.kind === "message") {
    if (!text) {
      const { error } = await ctx.db.from("voice_use").update({ status: "void", void_reason: "empty", settled_at: ctx.now.toISOString() }).eq("id", t.id).eq("status", "counted");
      if (error) throw new Error(error.message);
    }
    return { transcript: text, words: countSpokenWords(text), duration_ms: durationMs, total_ms: durationMs };
  }
  if (t.kind !== "answer" && t.kind !== "placement") throw new VoiceError("TICKET_NOT_FOUND", 404, "This recording was not found.");
  if (t.status !== "pending" || t.parts !== part - 1) throw PART_REFUSED();
  const total = Number(t.duration_ms) + durationMs;
  if (total > TOTAL_MS) throw new VoiceError("ANSWER_TOO_LONG", 400, "An answer may be at most 3 minutes.");
  const transcript = [t.transcript, text].filter(Boolean).join(" ").slice(0, 6000);
  const { data, error } = await ctx.db.from("voice_use").update({ parts: part, transcript, duration_ms: total }).eq("id", t.id).eq("status", "pending").eq("parts", part - 1).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw PART_REFUSED();
  return { transcript: text, words: countSpokenWords(transcript), duration_ms: durationMs, total_ms: total };
}

/** Relay: the provider failed, so the use is given back (a reply's row is removed so it can be read later). */
export async function voiceRelease(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const t = await ownTicket(ctx, String(ctx.body.ticket_id ?? ""));
  if (!t || Date.parse(t.created_at) < ctx.now.getTime() - 10 * 60_000) return { released: false };
  if (t.kind === "reply") {
    const { error } = await ctx.db.from("voice_use").delete().eq("id", t.id);
    if (error) throw new Error(error.message);
    return { released: true };
  }
  const { data, error } = await ctx.db.from("voice_use").update({ status: "void", void_reason: "provider_failed", settled_at: ctx.now.toISOString() }).eq("id", t.id).in("status", ["pending", "counted"]).select("id");
  if (error) throw new Error(error.message);
  return { released: Boolean(data?.length) };
}

/** Learner: today's limits and uses, and the read-aloud switch. */
export async function voiceStatus(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const [plan, { day, zone }, limits, pref] = await Promise.all([
    planOf(ctx.db, ctx.caller.id),
    learnerDay(ctx.db, ctx.caller.id, ctx.now),
    voiceLimits(ctx.db),
    ctx.db.from("voice_preference").select("read_aloud").eq("user_id", ctx.caller.id).maybeSingle(),
  ]);
  const { data, error } = await ctx.db.from("voice_use").select("kind").eq("user_id", ctx.caller.id).eq("day", day).neq("status", "void");
  if (error) throw new Error(error.message);
  const entry = (kind: "answer" | "message" | "reply") => {
    const limit = limits[kind][plan];
    const used = (data ?? []).filter((r: { kind: string }) => r.kind === kind).length;
    return { limit, used, remaining: Math.max(0, limit - used) };
  };
  return { plan, day, time_zone: zone, answers: entry("answer"), messages: entry("message"), replies: entry("reply"), read_aloud: pref.data?.read_aloud === true };
}

/** Learner: "Read replies aloud", off by default, remembered per learner (spec 5). */
export async function setReadAloud(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const on = ctx.body.read_aloud === true;
  const { error } = await ctx.db.from("voice_preference").upsert({ user_id: ctx.caller.id, read_aloud: on, updated_at: ctx.now.toISOString() });
  if (error) throw new Error(error.message);
  return { read_aloud: on };
}
