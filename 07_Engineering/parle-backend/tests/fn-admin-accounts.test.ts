import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { mailsTo } from "./helpers/mailpit";
import { adminCall, adminUser, psql } from "./helpers/admin";
import { book, bookableTutor, clearFakeFailures, failNext, learner, lesson, refundCount, seedConfirmed, slotAt } from "./helpers/lessons";

const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
/** An administrator's approval of the tutor's application (what Applications writes). */
const approve = (profileId: string, email: string) =>
  psql(`insert into public.tutor_application_review (profile_id, tutor_email, status, created_by) values ('${profileId}', '${email}', 'Approved', 'test')`);

describe("pausing and enabling accounts (spec 3.2)", () => {
  it("a paused learner is signed out everywhere and refused at sign-in; enabling restores sign-in", async () => {
    const admin = await adminUser();
    const owner = await adminUser({ owner: true });
    const { u, t } = await learner();
    const r = await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "Chargeback abuse", cancel_lessons: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ account_status: "disabled", lessons: { cancelled: 0, failed: 0 } });
    expect(psql(`select count(*) from auth.sessions where user_id = '${u.id}'`)).toBe("0");
    expect((await lesson(t, "learner_list_lessons")).status).toBe(401);
    const signIn = await anon().auth.signInWithPassword({ email: u.email, password: u.password });
    expect(signIn.error?.code).toBe("user_banned");
    expect(signIn.error?.message ?? "").toMatch(/banned/i); // the app turns this into "Your account is paused..." (Task 10)
    expect(psql(`select status || '|' || reason || '|' || lessons_choice || '|' || changed_by from public.account_status where user_id = '${u.id}'`)).toBe(`disabled|Chargeback abuse|keep|${admin.email}`);
    expect(psql(`select new_value from public.admin_audit_log where target_id = '${u.id}' and action = 'account.disabled'`)).toContain('"cancel_lessons":false');
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "again", cancel_lessons: false })).body.error_code).toBe("ALREADY_PAUSED");
    expect((await adminCall(owner.token, "admin_invite_admin", { email: u.email })).body.error_code).toBe("ACCOUNT_PAUSED");
    const e = await adminCall(admin.token, "admin_enable_account", { user_id: u.id });
    expect(e.body).toMatchObject({ account_status: "active", republished: 0 });
    expect(psql(`select count(*) from public.account_status where user_id = '${u.id}'`)).toBe("0");
    expect((await anon().auth.signInWithPassword({ email: u.email, password: u.password })).error).toBeNull();
    expect(psql(`select count(*) from public.admin_audit_log where target_id = '${u.id}' and action = 'account.enabled'`)).toBe("1");
    expect((await adminCall(admin.token, "admin_enable_account", { user_id: u.id })).body.error_code).toBe("NOT_PAUSED");
  }, 30000);

  it("refuses oneself, an administrator, a missing reason or lessons choice; learners cannot call it", async () => {
    const admin = await adminUser();
    const other = await adminUser();
    const { u, t } = await learner();
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: admin.id, reason: "Testing", cancel_lessons: false })).body.error_code).toBe("CANNOT_PAUSE_SELF");
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: other.id, reason: "Testing", cancel_lessons: false })).body.error_code).toBe("ADMIN_CANNOT_BE_PAUSED");
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "  ", cancel_lessons: false })).body.error_code).toBe("REASON_REQUIRED");
    expect((await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "Spam" })).body.error_code).toBe("LESSONS_CHOICE_REQUIRED");
    expect((await adminCall(t, "admin_disable_account", { user_id: u.id, reason: "Spam", cancel_lessons: false })).status).toBe(403);
    expect(psql(`select count(*) from public.account_status where user_id = '${u.id}'`)).toBe("0");
  }, 30000);

  it("a paused tutor's listing is unpublished and cannot be booked; lessons kept are listed; enabling republishes", async () => {
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    approve(profileId, tutor.email);
    const { u, t } = await learner();
    const kept = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(40) });
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.can_book).toBe(true);
    await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Off-platform payments", cancel_lessons: false });
    expect(psql(`select is_published from public.tutor_public_profile where profile_id = '${profileId}'`)).toBe("f");
    const refused = await lesson(t, "booking_options", { tutor_profile_id: profileId });
    expect(refused.status).toBe(404);
    expect(refused.body.message).toBe("This tutor is not taking bookings right now.");
    // a listing published again by another path still cannot be booked while the tutor is paused
    psql(`update public.tutor_public_profile set is_published = true where profile_id = '${profileId}'`);
    expect((await book(t, profileId, slotAt(3, 15))).body.error_code).toBe("TUTOR_NOT_AVAILABLE");
    psql(`update public.tutor_public_profile set is_published = false where profile_id = '${profileId}'`);
    expect(psql(`select status from public.booking where id = '${kept.bookingId}'`)).toBe("confirmed");
    const listed = (await adminCall(admin.token, "admin_paused_lessons")).body.lessons.find((l: any) => l.id === kept.bookingId);
    expect(listed).toMatchObject({ paused_party: "tutor", tutor_name: "Camille T." });
    const e = await adminCall(admin.token, "admin_enable_account", { user_id: tutor.id });
    expect(e.body.republished).toBe(1);
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.can_book).toBe(true);
  }, 60000);

  it("enabling does not republish a listing whose application is no longer approved (Review Focus 4)", async () => {
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    approve(profileId, tutor.email);
    await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Investigation", cancel_lessons: false });
    psql(`update public.tutor_application_review set status = 'Suspended' where profile_id = '${profileId}'`);
    expect((await adminCall(admin.token, "admin_enable_account", { user_id: tutor.id })).body.republished).toBe(0);
    expect(psql(`select is_published from public.tutor_public_profile where profile_id = '${profileId}'`)).toBe("f");
  }, 30000);

  it("'cancel and refund' cancels every upcoming lesson once, emails only the other person, keeps past lessons", async () => {
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    const a = await learner(), b = await learner();
    const since = new Date(Date.now() - 2000).toISOString();
    const next = await seedConfirmed({ learnerId: a.u.id, tutorId: tutor.id, profileId, start: hoursFromNow(30) });
    const later = await seedConfirmed({ learnerId: b.u.id, tutorId: tutor.id, profileId, start: hoursFromNow(50) });
    const past = await seedConfirmed({ learnerId: a.u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-30), status: "completed" });
    const r = await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Repeated no-shows", cancel_lessons: true });
    expect(r.body.lessons).toEqual({ cancelled: 2, failed: 0 });
    expect(psql(`select status || '|' || cancelled_by || '|' || late_cancel from public.booking where id = '${next.bookingId}'`)).toBe("cancelled_tutor|admin|false");
    expect(psql(`select reason || '|' || amount_cents from public.refund where booking_id = '${later.bookingId}'`)).toBe("admin|4000");
    expect(psql(`select status from public.booking where id = '${past.bookingId}'`)).toBe("completed");
    expect(await refundCount(next.pi)).toBe(1);
    expect((await mailsTo(a.u.email, since)).map((m) => m.subject)).toEqual([expect.stringMatching(/is cancelled$/)]);
    expect((await mailsTo(tutor.email, since)).length).toBe(0);
  }, 60000);

  it("a refund Stripe refuses does not stop the pause; the retry refunds once (Review Focus 1)", async () => {
    await clearFakeFailures();
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const first = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(30) });
    const second = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(60) });
    await failNext("refund");
    const r = await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "Fraud review", cancel_lessons: true });
    expect(r.body).toMatchObject({ account_status: "disabled", lessons: { cancelled: 1, failed: 1 } });
    expect(psql(`select count(*) from public.booking where id in ('${first.bookingId}', '${second.bookingId}') and status = 'confirmed'`)).toBe("1");
    const listed = (await adminCall(admin.token, "admin_paused_lessons")).body.lessons.filter((l: any) => [first.bookingId, second.bookingId].includes(l.id));
    expect(listed.map((l: any) => l.paused_party)).toEqual(["learner"]);
    expect((await adminCall(admin.token, "admin_cancel_paused_lessons", { user_id: u.id })).body.lessons).toEqual({ cancelled: 1, failed: 0 });
    expect((await refundCount(first.pi)) + (await refundCount(second.pi))).toBe(2);
    expect((await adminCall(admin.token, "admin_cancel_paused_lessons", { user_id: u.id })).body.lessons).toEqual({ cancelled: 0, failed: 0 });
  }, 60000);
});
