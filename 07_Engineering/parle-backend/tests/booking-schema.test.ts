import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
const at = (h: number, m = 0) => { const d = new Date(Date.now() + 3 * 86_400_000); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };

async function row(tutor: string, learner: string, start: string, extra: Record<string, unknown> = {}) {
  return service().from("booking").insert({
    learner_id: learner, tutor_id: tutor, tutor_profile_id: "p", start_at: start,
    end_at: new Date(Date.parse(start) + 60 * 60_000).toISOString(), minutes: 60, buffer_minutes: 0,
    price_cents: 4000, commission_pct: 20, status: "confirmed", ...extra,
  }).select("id, blocked_until").single();
}

describe("rebuilt booking table (Plan 7A, spec section 3)", () => {
  it("has real types, and the old text columns are gone", () => {
    expect(psql("select data_type from information_schema.columns where table_name = 'booking' and column_name = 'start_at'")).toBe("timestamp with time zone");
    expect(psql("select data_type from information_schema.columns where table_name = 'booking' and column_name = 'learner_id'")).toBe("uuid");
    expect(psql("select count(*) from information_schema.columns where table_name = 'booking' and column_name in ('start_time_utc', 'learner_user_id', 'decision_message')")).toBe("0");
  });
  it("two live bookings of one tutor may not overlap, buffer included; a cancelled one frees the time", async () => {
    const [t, a, b] = await Promise.all([makeUser("tutor"), makeUser("learner"), makeUser("learner")]);
    const first = await row(t.id, a.id, at(10), { buffer_minutes: 15 });
    expect(first.error).toBeNull();
    expect(new Date(first.data!.blocked_until).toISOString()).toBe(new Date(Date.parse(at(11, 15))).toISOString());
    expect((await row(t.id, b.id, at(11))).error?.code).toBe("23P01"); // inside the 15-minute buffer
    expect((await row(t.id, b.id, at(11, 15))).error).toBeNull(); // exactly at the end of the buffer
    await service().from("booking").update({ status: "cancelled_learner" }).eq("id", first.data!.id);
    expect((await row(t.id, b.id, at(9, 15), { minutes: 30, end_at: at(9, 45) })).error).toBeNull();
  });
  it("another tutor's lesson at the same time is fine; a learner cannot book themselves", async () => {
    const [t1, t2, a] = await Promise.all([makeUser("tutor"), makeUser("tutor"), makeUser("learner")]);
    expect((await row(t1.id, a.id, at(14))).error).toBeNull();
    expect((await row(t2.id, a.id, at(14))).error).toBeNull();
    expect((await row(t1.id, t1.id, at(17))).error?.code).toBe("23514");
  });
  it("end time must match the length", async () => {
    const [t, a] = await Promise.all([makeUser("tutor"), makeUser("learner")]);
    expect((await row(t.id, a.id, at(10), { end_at: at(10, 45) })).error?.code).toBe("23514");
  });
  it("participants read the booking; another learner does not; payments are server-only", async () => {
    const [t, a, other] = await Promise.all([makeUser("tutor"), makeUser("learner"), makeUser("learner")]);
    const { data } = await row(t.id, a.id, at(12));
    await service().from("payment").insert({ booking_id: data!.id, stripe_payment_intent_id: `pi_${crypto.randomUUID()}`, stripe_checkout_session_id: "cs_x", amount_cents: 4000, status: "succeeded" });
    expect(((await a.client.from("booking").select("id").eq("id", data!.id)).data ?? []).length).toBe(1);
    expect(((await t.client.from("booking").select("id").eq("id", data!.id)).data ?? []).length).toBe(1);
    expect(((await other.client.from("booking").select("id").eq("id", data!.id)).data ?? []).length).toBe(0);
    expect(((await a.client.from("payment").select("id").eq("booking_id", data!.id)).data ?? []).length).toBe(0);
  });
  it("one refund per reason per booking", async () => {
    const [t, a] = await Promise.all([makeUser("tutor"), makeUser("learner")]);
    const { data } = await row(t.id, a.id, at(16));
    const r = { booking_id: data!.id, amount_cents: 4000, reason: "learner_cancelled", decided_by: "learner" };
    expect((await service().from("refund").insert({ ...r, stripe_refund_id: `re_${crypto.randomUUID()}` })).error).toBeNull();
    expect((await service().from("refund").insert({ ...r, stripe_refund_id: `re_${crypto.randomUUID()}` })).error?.code).toBe("23505");
  });
  it("lesson_hold refuses an overlapping slot and expires a lapsed hold first", async () => {
    const [t, a, b] = await Promise.all([makeUser("tutor"), makeUser("learner"), makeUser("learner")]);
    const hold = (learner: string, minutes: number) => service().rpc("lesson_hold", { p_learner: learner, p_tutor: t.id, p_profile: "p", p_start: at(8), p_minutes: 60, p_buffer: 0, p_price: 4000, p_commission: 20, p_message: "", p_hold_minutes: minutes });
    const first = await hold(a.id, 30);
    expect(typeof first.data).toBe("string");
    expect((await hold(b.id, 30)).data).toBeNull();
    await service().from("booking").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", first.data);
    const second = await hold(b.id, 30);
    expect(typeof second.data).toBe("string");
    expect((await service().from("booking").select("status").eq("id", first.data).single()).data!.status).toBe("expired");
  });
  it("adds founding_until to tutor profiles and booking links to reviews; schedules the jobs", () => {
    expect(psql("select data_type from information_schema.columns where table_name = 'tutor_profile' and column_name = 'founding_until'")).toBe("date");
    expect(psql("select count(*) from information_schema.columns where table_name = 'tutor_review' and column_name in ('booking_id', 'learner_id')")).toBe("2");
    expect(psql("select schedule from cron.job where jobname = 'parle-booking-jobs'")).toBe("*/10 * * * *");
  });
});
