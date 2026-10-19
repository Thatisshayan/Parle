import { describe, it, expect, afterAll } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { service } from "./helpers/voice";
import { audioPath, cacheKey, normalizeScript, scriptHash } from "../supabase/functions/_shared/voice/listening";
import { HAS_LOCAL_DEMO_FIXTURES } from "./helpers/migration-fixtures";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0]);
const madeKeys: string[] = [];
const madePaths: string[] = [];

/** Prepared audio for the local demo bank's listening items, written the way the relay stores it. */
async function prepareDemoListening() {
  const { data } = await service().from("question_item").select("id, transcript").eq("skill", "listening").eq("status", "approved").eq("is_test_data", true);
  for (const row of data ?? []) {
    const hash = await scriptHash(normalizeScript(row.transcript)), key = cacheKey("question_item", row.id, hash), path = audioPath("question_item", row.id, null, hash);
    const { data: have } = await service().from("listening_audio").select("cache_key").eq("cache_key", key).maybeSingle();
    if (have) continue;
    await service().storage.from("listening-audio").upload(path, MP3, { contentType: "audio/mpeg", upsert: true });
    const { error } = await service().from("listening_audio").insert({ cache_key: key, item_kind: "question_item", item_id: row.id, script_hash: hash, path, status: "ready", ready_at: new Date().toISOString() });
    if (error) throw error;
    madeKeys.push(key); madePaths.push(path);
  }
}
afterAll(async () => {
  if (madeKeys.length) await service().from("listening_audio").delete().in("cache_key", madeKeys);
  if (madePaths.length) await service().storage.from("listening-audio").remove(madePaths);
});

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("the public level check plays prepared audio (Plan 13)", () => {
  it("listening questions carry a playable address and never the transcript", async () => {
    await prepareDemoListening();
    // the public check is rate-limited per visitor; earlier local runs must not decide this one
    await service().from("rate_limit_hit").delete().like("key", "levelcheck:%");
    const r = await callFunction("parle-public-level-check", null, { action: "start" });
    expect([r.status, r.body.error]).toEqual([200, undefined]);
    const questions = (r.body.questions ?? r.body.result?.questions ?? r.body.publicProjection?.questions) as any[];
    const listening = questions.filter((q) => q.skill === "listening");
    expect(listening.length).toBe(5);
    for (const q of listening) {
      expect("transcript" in q).toBe(false);
      expect(String(q.audioUrl)).toMatch(/^https?:\/\//);
    }
    const audio = await fetch(listening[0].audioUrl);
    expect(audio.status).toBe(200);
  }, 60000);
});

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("the public check signs only what it shows (Plan 13 final review)", () => {
  it("finding ready audio signs nothing; signing is done for the chosen questions only", async () => {
    const { publicAudioHooks } = await import("../supabase/functions/_shared/voice/public-audio");
    await prepareDemoListening();
    const { data } = await service().from("question_item").select("id, transcript, audio_url, skill").eq("skill", "listening").eq("status", "approved").eq("is_test_data", true);
    const hooks = publicAudioHooks(service() as any);
    const ready = await hooks.ready(data ?? []);
    expect(ready.size).toBeGreaterThanOrEqual(5);
    expect([...ready.values()].some((v) => v.includes("token="))).toBe(false); // nothing signed yet
    const chosen = new Map([...ready.entries()].slice(0, 5));
    const signed = await hooks.sign(chosen);
    expect(signed.size).toBe(5);
    for (const url of signed.values()) expect(url).toMatch(/^https?:\/\/.*token=/);
  }, 60000);
});
