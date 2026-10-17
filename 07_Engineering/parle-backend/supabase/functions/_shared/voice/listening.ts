import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { takeRateLimit } from "../rate-limit.ts";
import { VoiceError, type VoiceContext } from "./context.ts";

export const LISTENING_BUCKET = "listening-audio";
type Kind = "question_item" | "learner_task";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SCRIPT = 3000;
/** Cache keys per lookup request: 200 made the request address too long for the API gateway (Plan 13). */
const KEY_BATCH = 50;
const notFound = () => new VoiceError("ITEM_NOT_FOUND", 404, "This listening item was not found.");

export const normalizeScript = (text: unknown) => String(text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
export async function scriptHash(script: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
/** Keyed by the item and its script (spec 5), never by demo_code: works for real bank items (R94). */
export const cacheKey = (kind: string, id: string, hash: string) => `${kind}:${id}:${hash}`;
export const audioPath = (kind: string, id: string, owner: string | null, hash: string) => (kind === "learner_task" ? `task/${owner}/${id}/${hash}.mp3` : `bank/${id}/${hash}.mp3`);

async function item(ctx: VoiceContext, kind: Kind, id: string): Promise<{ script: string; owner: string | null; recording: string }> {
  if (!UUID.test(id)) throw notFound();
  if (kind === "question_item") {
    const { data, error } = await ctx.db.from("question_item").select("transcript, audio_url, skill, status").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.skill !== "listening" || data.status !== "approved") throw notFound();
    return { script: normalizeScript(data.transcript), owner: null, recording: typeof data.audio_url === "string" ? data.audio_url.trim() : "" };
  }
  if (kind === "learner_task") {
    const { data, error } = await ctx.db.from("learner_task").select("content_json, type, owner_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.type !== "listening_exercise" || (data.owner_id !== ctx.caller.id && ctx.caller.role !== "admin")) throw notFound();
    let text: unknown = "";
    try { text = JSON.parse(String(data.content_json ?? "{}")).text; } catch { text = ""; }
    return { script: normalizeScript(text), owner: String(data.owner_id), recording: "" };
  }
  throw new VoiceError("INVALID_INPUT", 400);
}

/** A link the browser can play for one hour; the local stack's internal address is swapped for the public one. */
export async function signedAudioUrl(db: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await db.storage.from(LISTENING_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "no signed link");
  const pub = Deno.env.get("PUBLIC_SUPABASE_URL");
  if (!pub) return data.signedUrl;
  const url = new URL(data.signedUrl), target = new URL(pub);
  url.protocol = target.protocol;
  url.host = target.host;
  return url.toString();
}

/**
 * Plan 13: which listening items already have audio made for their current script, and where the file is (no signing:
 * cheap enough to check a whole bank). Items without ready audio are left out.
 */
export async function readyAudioPaths(db: SupabaseClient, kind: Kind, items: Array<{ id: string; script: unknown }>): Promise<Map<string, string>> {
  const keyed = await Promise.all(items.filter((i) => normalizeScript(i.script)).map(async (i) => ({ id: i.id, key: cacheKey(kind, i.id, await scriptHash(normalizeScript(i.script))) })));
  const out = new Map<string, string>();
  for (let i = 0; i < keyed.length; i += KEY_BATCH) {
    const batch = keyed.slice(i, i + KEY_BATCH);
    const { data, error } = await db.from("listening_audio").select("cache_key, path").eq("status", "ready").in("cache_key", batch.map((k) => k.key));
    if (error) throw new Error(error.message);
    const byKey = new Map((data ?? []).map((r: any) => [String(r.cache_key), String(r.path)]));
    for (const k of batch) {
      const path = byKey.get(k.key);
      if (path) out.set(k.id, path);
    }
  }
  return out;
}

/** Signed, playable addresses for the given files (id to path), for the questions actually shown. */
export async function signAudioPaths(db: SupabaseClient, paths: Map<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [id, path] of paths) out.set(id, await signedAudioUrl(db, path));
  return out;
}

/**
 * Plan 13: playable addresses for listening items whose audio is already made (the file for the item's current script),
 * so a listening question can be played without its transcript ever reaching the browser. Items without ready audio
 * are left out (the learner presses Listen to have it made, or the public check skips them).
 */
export async function preparedAudioUrls(db: SupabaseClient, kind: Kind, items: Array<{ id: string; script: unknown }>): Promise<Map<string, string>> {
  return signAudioPaths(db, await readyAudioPaths(db, kind, items));
}

/** As preparedAudioUrls, but a lookup failure means "no prepared audio" (the Listen button still works), never an error. */
export async function safePreparedAudioUrls(db: SupabaseClient, kind: Kind, items: Array<{ id: string; script: unknown }>): Promise<Map<string, string>> {
  try {
    return await preparedAudioUrls(db, kind, items);
  } catch (e) {
    console.warn("prepared audio lookup failed", (e as Error)?.name ?? "unknown");
    return new Map();
  }
}

/** Relay: the cached file, or the right to make it now (one maker at a time). Never counted (spec 6). */
export async function listeningClaim(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const kind = String(ctx.body.item_kind ?? "") as Kind, id = String(ctx.body.item_id ?? "");
  const found = await item(ctx, kind, id);
  if (found.recording) return { state: "recording", url: found.recording }; // items with a real recording keep it
  if (!found.script) throw new VoiceError("NO_SCRIPT", 404, "This item has no text to read.");
  if (found.script.length > MAX_SCRIPT) throw new VoiceError("SCRIPT_TOO_LONG", 422, "This text is too long to read aloud.");
  const hash = await scriptHash(found.script), key = cacheKey(kind, id, hash);
  const { data, error } = await ctx.db.rpc("listening_claim", { p_key: key, p_kind: kind, p_item: id, p_owner: kind === "learner_task" ? found.owner : null, p_hash: hash });
  if (error) throw new Error(error.message);
  const claim = data as { state: string; path?: string };
  if (claim.state === "ready") return { state: "ready", url: await signedAudioUrl(ctx.db, String(claim.path)) };
  if (claim.state === "busy") return { state: "busy" };
  if (!(await takeRateLimit(ctx.db, `voice:listen:${ctx.caller.id}`, 3600, ctx.caller.role === "admin" ? 2000 : 60))) {
    await ctx.db.from("listening_audio").delete().eq("cache_key", key).eq("status", "pending");
    throw new VoiceError("RATE_LIMITED", 429, "Try again later.");
  }
  return { state: "generate", cache_key: key, script: found.script };
}

/** Relay: store what it made (MP3) and answer a playable link. */
export async function listeningStore(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const key = String(ctx.body.cache_key ?? "");
  const { data: row, error } = await ctx.db.from("listening_audio").select("*").eq("cache_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "pending") throw new VoiceError("CLAIM_NOT_FOUND", 409, "This audio is not being made.");
  if (row.item_kind === "learner_task" && row.owner_id !== ctx.caller.id && ctx.caller.role !== "admin") throw notFound();
  const b64 = typeof ctx.body.audio_base64 === "string" ? ctx.body.audio_base64 : "";
  if (!b64 || b64.length > 11_000_000) throw new VoiceError("BAD_AUDIO", 400);
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const mp3 = (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
  if (!mp3) throw new VoiceError("BAD_AUDIO", 400);
  const path = audioPath(row.item_kind, row.item_id, row.owner_id, row.script_hash);
  const up = await ctx.db.storage.from(LISTENING_BUCKET).upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (up.error) throw new Error(up.error.message);
  const done = await ctx.db.from("listening_audio").update({ status: "ready", path, ready_at: ctx.now.toISOString() }).eq("cache_key", key);
  if (done.error) throw new Error(done.error.message);
  return { url: await signedAudioUrl(ctx.db, path) };
}

/** Relay: generation failed, so the claim goes and the next request may try again (Plan 11, A89, R97). */
export async function listeningRelease(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const key = String(ctx.body.cache_key ?? "");
  if (!key || key.length > 200) return { released: false };
  const { data: row, error } = await ctx.db.from("listening_audio").select("status, item_kind, owner_id").eq("cache_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "pending") return { released: false };
  if (row.item_kind === "learner_task" && row.owner_id !== ctx.caller.id && ctx.caller.role !== "admin") return { released: false };
  const del = await ctx.db.from("listening_audio").delete().eq("cache_key", key).eq("status", "pending");
  if (del.error) throw new Error(del.error.message);
  return { released: true };
}

/** Admin: approved listening items with a script and no audio yet ("prepare audio", spec 5). */
export async function adminListeningMissing(ctx: VoiceContext): Promise<Record<string, unknown>> {
  if (ctx.caller.role !== "admin") throw new VoiceError("ADMIN_REQUIRED", 403, "Administrators only.");
  const { data, error } = await ctx.db.from("question_item").select("id, transcript, audio_url").eq("skill", "listening").eq("status", "approved").limit(2000);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []).filter((r: any) => !(typeof r.audio_url === "string" && r.audio_url.trim()) && normalizeScript(r.transcript) && normalizeScript(r.transcript).length <= MAX_SCRIPT);
  const keyed = await Promise.all(candidates.map(async (r: any) => ({ id: String(r.id), key: cacheKey("question_item", String(r.id), await scriptHash(normalizeScript(r.transcript))) })));
  const ready = new Set<string>();
  for (let i = 0; i < keyed.length; i += KEY_BATCH) {
    const { data: rows, error: e } = await ctx.db.from("listening_audio").select("cache_key").eq("status", "ready").in("cache_key", keyed.slice(i, i + KEY_BATCH).map((k) => k.key));
    if (e) throw new Error(e.message);
    for (const r of rows ?? []) ready.add(String(r.cache_key));
  }
  return { total: candidates.length, missing: keyed.filter((k) => !ready.has(k.key)).map((k) => ({ item_kind: "question_item", item_id: k.id })) };
}
