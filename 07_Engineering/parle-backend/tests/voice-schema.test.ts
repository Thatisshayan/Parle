import { describe, it, expect, setDefaultTimeout } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

setDefaultTimeout(60_000);
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
type Take = { ok: boolean; ticket_id?: string; used: number; again?: boolean };
async function take(user: string, kind: string, day: string, limit: number, ref = ""): Promise<Take> {
  const { data, error } = await service().rpc("voice_take", { p_user: user, p_kind: kind, p_day: day, p_limit: limit, p_ref: ref });
  if (error) throw new Error(error.message);
  return data as Take;
}
const DAY = "2026-10-16";

describe("voice schema (Plan 9)", () => {
  it("the four tables are server-only: row-level security on, a learner reads nothing", async () => {
    for (const t of ["voice_use", "speaking_result", "voice_preference", "listening_audio"]) {
      expect(`${t}: ${psql(`select relrowsecurity from pg_class where relname = '${t}' and relnamespace = 'public'::regnamespace`)}`).toBe(`${t}: t`);
    }
    const u = await makeUser("learner");
    await take(u.id, "message", DAY, 5);
    const { data } = await u.client.from("voice_use").select("id");
    expect(data ?? []).toEqual([]);
  });
  it("counts up to the limit, per kind and per day; a given-back use does not count", async () => {
    const u = await makeUser("learner");
    expect((await take(u.id, "answer", DAY, 2)).ok).toBe(true);
    const second = await take(u.id, "answer", DAY, 2);
    expect(second).toMatchObject({ ok: true, used: 2 });
    expect(await take(u.id, "answer", DAY, 2)).toEqual({ ok: false, used: 2 });
    expect((await take(u.id, "answer", "2026-10-17", 2)).ok).toBe(true);
    expect((await take(u.id, "message", DAY, 5)).ok).toBe(true);
    await service().from("voice_use").update({ status: "void", void_reason: "too_short" }).eq("id", second.ticket_id!);
    expect((await take(u.id, "answer", DAY, 2)).ok).toBe(true);
  });
  it("answers and placement recordings start pending; messages and replies are counted at once", async () => {
    const u = await makeUser("learner");
    const ids = [await take(u.id, "answer", DAY, 2), await take(u.id, "placement", DAY, 6, "run-a"), await take(u.id, "message", DAY, 5), await take(u.id, "reply", DAY, 20, "m-1")].map((r) => r.ticket_id!);
    const { data } = await service().from("voice_use").select("id, status").in("id", ids);
    expect(ids.map((id) => data!.find((r) => r.id === id)!.status)).toEqual(["pending", "pending", "counted", "counted"]);
  });
  it("a reply is counted once per day however often it is taken", async () => {
    const u = await makeUser("learner");
    const a = await take(u.id, "reply", DAY, 20, "m-1");
    const b = await take(u.id, "reply", DAY, 20, "m-1");
    expect(b).toMatchObject({ ok: true, again: true, ticket_id: a.ticket_id, used: 1 });
    expect((await take(u.id, "reply", "2026-10-17", 20, "m-1")).again).toBe(false);
  });
  it("placement recordings are limited per placement run, not per day", async () => {
    const u = await makeUser("learner");
    expect((await take(u.id, "placement", DAY, 2, "run-1")).ok).toBe(true);
    expect((await take(u.id, "placement", "2026-10-17", 2, "run-1")).ok).toBe(true);
    expect((await take(u.id, "placement", "2026-10-18", 2, "run-1")).ok).toBe(false);
    expect((await take(u.id, "placement", DAY, 2, "run-2")).ok).toBe(true);
  });
  it("five uses at once never pass a limit of two", async () => {
    const u = await makeUser("learner");
    const results = await Promise.all(Array.from({ length: 5 }, () => take(u.id, "message", DAY, 2)));
    expect(results.filter((r) => r.ok).length).toBe(2);
  });
  it("listening audio is claimed once: the first request makes it, the next waits, then everyone gets the file", async () => {
    const key = `question_item:${crypto.randomUUID()}:abc`;
    const claim = async () => (await service().rpc("listening_claim", { p_key: key, p_kind: "question_item", p_item: "x", p_owner: null, p_hash: "abc" })).data;
    expect(await claim()).toEqual({ state: "claimed" });
    expect(await claim()).toEqual({ state: "busy" });
    await service().from("listening_audio").update({ status: "ready", path: "bank/x/abc.mp3" }).eq("cache_key", key);
    expect(await claim()).toEqual({ state: "ready", path: "bank/x/abc.mp3" });
    psql(`update public.listening_audio set status = 'pending', claimed_at = now() - interval '2 minutes' where cache_key = '${key}'`);
    expect(await claim()).toEqual({ state: "claimed" });
  });
  it("a deleted login takes its voice rows, speaking results and preference with it", async () => {
    const u = await makeUser("learner");
    const t = await take(u.id, "answer", DAY, 2);
    const r = await service().from("speaking_result").insert({ user_id: u.id, source: "task", task_id: "t", ticket_id: t.ticket_id, transcript: "Bonjour", criteria: { task_completion: 1, vocabulary: 1, grammar: 1, coherence_fluency: 1 }, level: "A1" });
    expect(r.error).toBeNull();
    expect((await service().from("voice_preference").insert({ user_id: u.id, read_aloud: true })).error).toBeNull();
    await service().auth.admin.deleteUser(u.id);
    for (const table of ["voice_use", "speaking_result", "voice_preference"]) {
      expect(`${table}: ${psql(`select count(*) from public.${table} where user_id = '${u.id}'`)}`).toBe(`${table}: 0`);
    }
  });
  it("the listening-audio bucket is private and takes only MP3; speaking estimates accept their new source", () => {
    expect(psql("select public, allowed_mime_types from storage.buckets where id = 'listening-audio'")).toBe("f|{audio/mpeg}");
    expect(psql("select pg_get_constraintdef(oid) from pg_constraint where conname = 'skill_estimate_source_check'")).toContain("speaking_task");
  });
});
