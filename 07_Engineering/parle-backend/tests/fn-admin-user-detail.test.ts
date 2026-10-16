import { describe, it, expect } from "bun:test";
import { adminCall, adminUser, psql } from "./helpers/admin";
import { bookableTutor, learner, seedConfirmed, service } from "./helpers/lessons";

const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

describe("user details (D19, spec 3.4)", () => {
  it("a learner: plan, goal, levels, this week, AI messages, lessons and refunds, status and recent audit", async () => {
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const db = service();
    const own = { owner_id: u.id, created_by: u.email, user_id: u.id };
    must(await db.from("Subscriber").insert({ ...own, email: u.email, stripe_status: "active", cancel_at_period_end: false, current_period_end: "2026-12-01T00:00:00.000Z", stripe_customer_id: "cus_test_p8", plan: "premium" }));
    must(await db.from("skill_estimate").insert([{ ...own, skill: "reading", value: 6, state: "assessed" }, { ...own, skill: "speaking", value: 4, state: "assessed" }]));
    const { data: plan } = await db.from("week_plan").insert({ ...own, status: "active", week_start_local: "2026-10-12", plan_key: `p8-${crypto.randomUUID()}` }).select("id").single();
    must(await db.from("learner_task").insert(["done", "planned", "planned", "suggested"].map((status, i) => ({ ...own, week_plan_id: plan!.id, status, task_key: `p8-${i}-${crypto.randomUUID()}` }))));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    must(await db.from("usage_counter").insert({ ...own, period: "day", period_key: today, ai_messages: 3 }));
    const up = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(40) });
    await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-40), status: "completed" });
    const gone = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(80), status: "cancelled_learner" });
    must(await db.from("refund").insert({ booking_id: gone.bookingId, amount_cents: 4000, reason: "learner_cancelled", stripe_refund_id: `re_p8_${crypto.randomUUID()}`, decided_by: "learner" }));
    await adminCall(admin.token, "admin_disable_account", { user_id: u.id, reason: "Check detail", cancel_lessons: false });

    const r = await adminCall(admin.token, "admin_user_detail", { user_id: u.id });
    expect(r.status).toBe(200);
    expect(r.body.account).toMatchObject({ id: u.id, role: "learner", owner: false, status: "disabled", email_verified: true });
    expect(r.body.account.paused).toMatchObject({ reason: "Check detail", by: admin.email, lessons_choice: "keep" });
    expect(r.body.learner.plan).toEqual({ name: "Premium", source: "stripe", renews_at: "2026-12-01T00:00:00.000Z", ends_at: null, stripe_customer_url: "https://dashboard.stripe.com/test/customers/cus_test_p8" });
    expect(r.body.learner).toMatchObject({ goal: "canada_immigration", track: "immigration" });
    expect(r.body.learner.levels).toMatchObject({ reading: 6, speaking: 4 });
    expect(r.body.learner.this_week).toEqual({ week_start: "2026-10-12", done: 1, planned: 3 });
    expect(r.body.learner.ai_messages.today).toBe(3);
    expect(r.body.learner.lessons).toMatchObject({ upcoming: 1, past: 1, cancelled: 1, refunded_cents: 4000 });
    expect(r.body.learner.lessons.items.find((l: any) => l.id === up.bookingId)).toMatchObject({ status: "confirmed", tutor_name: "Camille T." });
    expect(r.body.tutor).toBeNull();
    expect(r.body.recent_audit[0]).toMatchObject({ action: "account.disabled", by: admin.email });
  }, 60000);

  it("a tutor: application, rate, availability, founding date, lessons taught, rating and payout account (Plan 7B)", async () => {
    const admin = await adminUser();
    const { tutor, profileId } = await bookableTutor({ foundingUntil: "2027-04-30" });
    psql(`insert into public.tutor_application_review (profile_id, tutor_email, status, created_by) values ('${profileId}', '${tutor.email}', 'Approved', 'test')`);
    const db = service();
    must(await db.from("availability_rule").insert([
      { owner_id: tutor.id, created_by: tutor.email, user_id: tutor.id, profile_id: profileId, day_of_week: 2, start_local: "09:00", end_local: "12:00", time_zone: "UTC" },
      { owner_id: tutor.id, created_by: tutor.email, user_id: tutor.id, profile_id: profileId, day_of_week: 4, start_local: "18:00", end_local: "20:00", time_zone: "UTC" },
    ]));
    const { u } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-30), status: "completed" });
    must(await db.from("tutor_review").insert({ owner_id: u.id, created_by: u.email, profile_id: profileId, tutor_email: tutor.email, stars: 5, comment: "Great", is_test_review: false, is_visible: true, booking_id: done.bookingId, learner_id: u.id }));
    const r = await adminCall(admin.token, "admin_user_detail", { user_id: tutor.id });
    expect(r.body.account.role).toBe("tutor");
    expect(r.body.tutor).toMatchObject({ application_status: "Approved", hourly_rate_cents: 4000, founding_until: "2027-04-30", lessons_taught: 1, rating: { average: 5, count: 1 }, payout_account: "ready" });
    expect(r.body.tutor.availability).toEqual({ weekly_hours: 5, windows: ["Tue 09:00-12:00", "Thu 18:00-20:00"], time_zone: "UTC" });
    expect(r.body.learner).toBeNull();
    expect((await adminCall(admin.token, "admin_user_detail", { user_id: crypto.randomUUID() })).body.error_code).toBe("USER_NOT_FOUND");
  }, 60000);
});
