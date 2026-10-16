import { describe, it, expect, beforeEach, setDefaultTimeout } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { joinWaitlist, psql, resetWaitlist, waitlistRows } from "./helpers/admin";

setDefaultTimeout(30_000);
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const MIGRATION = readFileSync(`${import.meta.dir}/../supabase/migrations/20261016000027_admin_waitlist.sql`, "utf8");

describe("Plan 8 tables and SQL (spec 3.1, 4.1, 4.6)", () => {
  beforeEach(() => resetWaitlist());

  it("new tables are server-only", async () => {
    const someone = await makeUser("learner");
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    for (const t of ["account_status", "waitlist_campaign", "waitlist_send", "waitlist_unsubscribe"]) {
      expect(psql(`select relrowsecurity from pg_class where relname = '${t}'`)).toBe("t");
      expect(((await someone.client.from(t).select("*")).data ?? []).length).toBe(0);
      expect(((await anon.from(t).select("*")).data ?? []).length).toBe(0);
    }
    expect(psql("select count(*) from public.waitlist_campaign")).toBe("2");
  });

  it("never alters the waitlist or join_waitlist(): no foreign key, trigger or rule points at them", () => {
    expect(psql("select count(*) from pg_constraint where confrelid = 'public.waitlist_signup'::regclass")).toBe("0");
    expect(psql("select count(*) from pg_trigger where tgrelid = 'public.waitlist_signup'::regclass and not tgisinternal")).toBe("0");
    expect(MIGRATION).not.toMatch(/alter\s+table\s+(public\.)?waitlist_signup/i);
    expect(MIGRATION).not.toMatch(/(create|drop|replace)\s+(or\s+replace\s+)?function\s+(public\.)?join_waitlist/i);
    expect(MIGRATION).not.toMatch(/references\s+(public\.)?waitlist_signup/i);
    // the one deletion is inside waitlist_delete_all (spec 4.6)
    expect(MIGRATION.match(/delete\s+from\s+public\.waitlist_signup/gi)?.length).toBe(1);
  });

  it("an administrator's cancellation is its own 'cancelled by'; the sending job runs every minute only while queued", () => {
    expect(psql("select pg_get_constraintdef(oid) from pg_constraint where conname = 'booking_cancelled_by_check'")).toContain("'admin'");
    expect(psql("select schedule from cron.job where jobname = 'parle-waitlist-jobs'")).toBe("* * * * *");
    expect(psql("select command from cron.job where jobname = 'parle-waitlist-jobs'")).toContain("where exists");
  });

  it("queues tutors for the founding-tutor email and everyone for the launch email; unsubscribed never; twice queues nothing new", async () => {
    await joinWaitlist("t1@example.test", "tutor");
    await joinWaitlist("l1@example.test", "learner", "immigration");
    await joinWaitlist("gone@example.test", "learner");
    expect((await service().rpc("waitlist_record_unsubscribe", { p_email: "GONE@example.test", p_source: "link" })).data).toBe("recorded");
    expect((await service().rpc("waitlist_queue", { p_campaign: "founding_tutor", p_by: "a@x" })).data).toBe(1);
    expect((await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" })).data).toBe(2);
    expect((await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" })).data).toBe(0);
    expect(waitlistRows("founding_tutor")).toEqual([{ email: "t1@example.test", status: "queued" }]);
    expect(waitlistRows("launch").map((r) => r.email)).toEqual(["l1@example.test", "t1@example.test"]);
    expect(psql("select goal || '|' || role || '|' || (joined_on = current_date) from public.waitlist_send where email = 'l1@example.test'")).toBe("immigration|learner|true");
  });

  it("one row per address whatever the case (Review Focus 3)", async () => {
    // production allows one row per address and role: the same person as a learner and as a tutor, in two spellings
    psql("insert into public.waitlist_signup (email, role) values ('Ana@Example.test', 'learner'), ('ana@example.test', 'tutor')");
    expect((await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" })).data).toBe(1);
    expect(waitlistRows("launch")).toEqual([{ email: "ana@example.test", status: "queued" }]);
    expect((await service().rpc("waitlist_record_unsubscribe", { p_email: "ANA@example.test", p_source: "admin" })).data).toBe("recorded");
    expect(waitlistRows("launch")).toEqual([{ email: "ana@example.test", status: "skipped_unsubscribed" }]);
    expect((await service().rpc("waitlist_record_unsubscribe", { p_email: "ana@example.test", p_source: "link" })).data).toBe("already");
    expect((await service().rpc("waitlist_record_unsubscribe", { p_email: "not an address", p_source: "link" })).data).toBe("invalid");
  });

  it("someone who joined as a learner and later as a tutor gets the founding-tutor email, and one launch email as a tutor", async () => {
    psql("insert into public.waitlist_signup (email, role, created_at) values ('both@example.test', 'learner', now() - interval '2 days'), ('both@example.test', 'tutor', now() - interval '1 day')");
    expect((await service().rpc("waitlist_queue", { p_campaign: "founding_tutor", p_by: "a@x" })).data).toBe(1);
    expect((await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" })).data).toBe(1);
    expect(psql("select role from public.waitlist_send where campaign = 'launch' and email = 'both@example.test'")).toBe("tutor");
  });

  it("a claim is taken once; the list cannot be deleted before the launch campaign has finished", async () => {
    await joinWaitlist("c1@example.test");
    await joinWaitlist("c2@example.test");
    await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" });
    const [a, b] = await Promise.all([service().rpc("waitlist_claim", { p_limit: 50 }), service().rpc("waitlist_claim", { p_limit: 50 })]);
    expect(((a.data ?? []) as unknown[]).length + ((b.data ?? []) as unknown[]).length).toBe(2);
    const owner = await makeUser("admin");
    expect((await service().rpc("waitlist_delete_all", { p_actor: owner.id, p_label: owner.email })).data).toEqual({ status: "launch_not_finished" });
    expect(psql("select count(*) from public.waitlist_signup")).toBe("2");
    psql("update public.waitlist_send set status = 'sent', claimed_at = null");
    expect((await service().rpc("waitlist_refresh_campaigns")).data).toBe(1);
    expect((await service().rpc("waitlist_delete_all", { p_actor: owner.id, p_label: owner.email })).data).toEqual({ status: "deleted", signups: 2, send_records_cleared: 2 });
    expect(psql("select count(*) from public.waitlist_signup")).toBe("0");
    expect(psql("select count(*) || '|' || count(email) from public.waitlist_send where campaign = 'launch'")).toBe("2|0");
    expect(psql(`select action from public.admin_audit_log where actor_user_id = '${owner.id}'`)).toBe("waitlist.deleted");
  });

  it("ends a person's sessions", async () => {
    const u = await makeUser("learner");
    expect(Number(psql(`select count(*) from auth.sessions where user_id = '${u.id}'`))).toBeGreaterThan(0);
    expect(((await service().rpc("account_end_sessions", { p_user: u.id })).data as number) > 0).toBe(true);
    expect(psql(`select count(*) from auth.sessions where user_id = '${u.id}'`)).toBe("0");
  });

  it("metrics counts come from the server for a date range", async () => {
    const { data, error } = await service().rpc("admin_metrics", { p_from: new Date(Date.now() - 7 * 86_400_000).toISOString(), p_to: new Date().toISOString() });
    expect(error).toBeNull();
    expect(Object.keys(data as object).sort()).toEqual(["active_learners_by_week", "ai_messages", "checkins_submitted", "lessons", "practice_completed", "premium", "signups_by_week"]);
    expect(Object.keys((data as any).lessons).sort()).toEqual(["booked", "booked_hours", "cancelled_by_learner", "cancelled_by_parle", "cancelled_by_tutor", "commission_cents", "completed", "refunded_cents", "revenue_cents"]);
  });
});
