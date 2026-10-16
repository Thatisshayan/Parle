import { describe, it, expect, setDefaultTimeout } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { adminCall, adminUser, psql, resetWaitlist, joinWaitlist } from "./helpers/admin";
import { bookableTutor, clearFakeFailures, failNext, learner, refundCount, runJobs, seedConfirmed } from "./helpers/lessons";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { unsubscribeToken } from "../supabase/functions/_shared/waitlist/token";
import { functionsEnv } from "./helpers/functions-env";

setDefaultTimeout(60_000);
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };

describe("Plan 8 final review fixes", () => {
  it("a refund Stripe refused is retried with a new key, and refunds once (Important 1)", async () => {
    await clearFakeFailures();
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(30) });
    await failNext("refund_refused"); // Stripe answers with a refusal, and replays it for the same key for 24 h
    const r = await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Fraud review", cancel_lessons: true });
    expect(r.body.lessons).toEqual({ cancelled: 0, failed: 1 });
    expect((await adminCall(admin.token, "admin_cancel_paused_lessons", { user_id: tutor.id })).body.lessons).toEqual({ cancelled: 1, failed: 0 });
    expect(await refundCount(b.pi)).toBe(1);
  });

  it("a paused party's lesson that already started is listed, never auto-completed, and can be cancelled and refunded (Important 2)", async () => {
    await clearFakeFailures();
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const started = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-0.5) });
    const ended = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-60) });
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Did not show up", cancel_lessons: false })).status).toBe(200);
    const listed = (await adminCall(admin.token, "admin_paused_lessons")).body.lessons.map((l: any) => l.id);
    expect(listed).toContain(started.bookingId);
    expect(listed).toContain(ended.bookingId);
    await runJobs();
    expect(psql(`select status from public.booking where id = '${ended.bookingId}'`)).toBe("confirmed");
    expect(psql(`select count(*) from public.payout where booking_id = '${ended.bookingId}'`)).toBe("0");
    expect((await adminCall(admin.token, "admin_cancel_paused_lessons", { user_id: tutor.id })).body.lessons).toEqual({ cancelled: 2, failed: 0 });
    expect((await refundCount(started.pi)) + (await refundCount(ended.pi))).toBe(2);
  });

  it("many one-click unsubscribes from one mail provider's address are all recorded (Important 3)", async () => {
    resetWaitlist();
    psql("delete from public.rate_limit_hit where key like 'unsubscribe:%'");
    const people = Array.from({ length: 65 }, (_, i) => `gmail-user-${i}-${crypto.randomUUID().slice(0, 6)}@example.test`);
    for (const p of people) await joinWaitlist(p);
    const secret = functionsEnv().WAITLIST_UNSUBSCRIBE_SECRET;
    const statuses: number[] = [];
    for (const p of people) {
      const t = await unsubscribeToken(secret, p);
      const r = await fetch(`${LOCAL_URL}/functions/v1/parle-waitlist-unsubscribe?t=${encodeURIComponent(t)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
      statuses.push(r.status);
      await r.text();
    }
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    expect(Number(psql("select count(*) from public.waitlist_unsubscribe where email like 'gmail-user-%'"))).toBeGreaterThanOrEqual(65);
  });

  it("removing an administrator gives back the role they had before (Important 4)", async () => {
    const owner = await adminUser({ owner: true });
    const tutor = await makeUser("tutor");
    expect((await adminCall(owner.token, "admin_invite_admin", { email: tutor.email })).status).toBe(200);
    expect((await adminCall(owner.token, "admin_remove_admin", { user_id: tutor.id })).status).toBe(200);
    const { data } = await service().auth.admin.getUserById(tutor.id);
    expect((data.user?.app_metadata as any)?.role).toBe("tutor");
  });

  it("pausing again after a ban that never applied applies it, instead of answering 'already paused' (Minor 1, graded up)", async () => {
    const admin = await adminUser();
    const { u } = await learner();
    psql(`insert into public.account_status (user_id, status, reason, lessons_choice, changed_by) values ('${u.id}', 'disabled', 'half done', 'keep', 'test')`);
    const r = await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "Finish the pause", cancel_lessons: false });
    expect(r.status).toBe(200);
    const { data } = await service().auth.admin.getUserById(u.id);
    expect(new Date(String((data.user as any)?.banned_until ?? 0)).getTime()).toBeGreaterThan(Date.now());
  });

  it("the list cannot be deleted while launch emails failed and can still be retried (Minor 5, graded up)", async () => {
    resetWaitlist();
    await joinWaitlist(`failed-${crypto.randomUUID().slice(0, 6)}@example.test`);
    await service().rpc("waitlist_queue", { p_campaign: "launch", p_by: "a@x" });
    psql("update public.waitlist_send set status = 'failed', claimed_at = null where campaign = 'launch'");
    await service().rpc("waitlist_refresh_campaigns");
    const owner = await makeUser("admin");
    expect((await service().rpc("waitlist_delete_all", { p_actor: owner.id, p_label: owner.email })).data).toEqual({ status: "launch_not_finished" });
    expect(psql("select count(*) from public.waitlist_signup")).toBe("1");
  });
});

void callFunction;
