import { describe, it, expect } from "bun:test";
import { adminCall, adminUser, psql } from "./helpers/admin";
import { bookableTutor, learner, seedConfirmed, service } from "./helpers/lessons";

const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
const band = (m: any, b: string) => m.demand_supply.find((r: any) => r.band === b);
const sum = (weeks: Array<{ learners?: number; tutors?: number }>, k: "learners" | "tutors") => weeks.reduce((s, w) => s + Number(w[k] ?? 0), 0);

describe("admin metrics (D24, spec 3.5)", () => {
  it("counts on the server what happened in the range; refuses other ranges and non-administrators", async () => {
    const admin = await adminUser();
    const before = (await adminCall(admin.token, "admin_metrics", { days: 7 })).body;
    const { tutor, profileId } = await bookableTutor();
    must(await service().from("availability_rule").insert({ owner_id: tutor.id, created_by: tutor.email, user_id: tutor.id, profile_id: profileId, day_of_week: 1, start_local: "18:00", end_local: "20:00", time_zone: "UTC" }));
    const { u, t } = await learner();
    const db = service();
    const own = { owner_id: u.id, created_by: u.email, user_id: u.id };
    must(await db.from("learner_profile").update({ tutor_windows: ["weekday_evening"] }).eq("user_id", u.id));
    must(await db.from("learner_task").insert({ ...own, status: "done", completed_at_utc: new Date().toISOString(), task_key: `p8m-${crypto.randomUUID()}` }));
    must(await db.from("checkin").insert({ ...own, status: "submitted", checkin_key: `p8m-${crypto.randomUUID()}` }));
    must(await db.from("ai_message").insert([{ ...own, sender: "learner", text: "Bonjour" }, { ...own, sender: "learner", text: "Merci" }, { ...own, sender: "tutor_ai", text: "De rien" }]));
    await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-2), status: "completed", bookedAt: new Date().toISOString() });
    const gone = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(50), status: "cancelled_learner", bookedAt: new Date().toISOString() });
    psql(`update public.booking set cancelled_by = 'learner' where id = '${gone.bookingId}'`);
    psql(`update public.payment set refunded_cents = 4000, status = 'refunded' where booking_id = '${gone.bookingId}'`);
    must(await db.from("refund").insert({ booking_id: gone.bookingId, amount_cents: 4000, reason: "learner_cancelled", stripe_refund_id: `re_p8m_${crypto.randomUUID()}`, decided_by: "learner" }));
    const after = (await adminCall(admin.token, "admin_metrics", { days: 7 })).body;

    expect(after.range.days).toBe(7);
    expect(sum(after.signups_by_week, "learners") - sum(before.signups_by_week, "learners")).toBe(1);
    expect(sum(after.signups_by_week, "tutors") - sum(before.signups_by_week, "tutors")).toBe(1);
    expect(after.practice_completed - before.practice_completed).toBe(1);
    expect(after.checkins_submitted - before.checkins_submitted).toBe(1);
    expect(after.ai_messages - before.ai_messages).toBe(2);
    expect(after.lessons.booked - before.lessons.booked).toBe(2);
    expect(after.lessons.completed - before.lessons.completed).toBe(1);
    expect(after.lessons.cancelled_by_learner - before.lessons.cancelled_by_learner).toBe(1);
    expect(after.lessons.refunded_cents - before.lessons.refunded_cents).toBe(4000);
    expect(after.lessons.revenue_cents - before.lessons.revenue_cents).toBe(4000);
    expect(after.lessons.commission_cents - before.lessons.commission_cents).toBe(800);
    expect(Number(after.lessons.booked_hours) - Number(before.lessons.booked_hours)).toBe(1);
    expect(band(after, "weekday_evening").learners - band(before, "weekday_evening").learners).toBe(1);
    expect(band(after, "weekday_evening").tutor_hours_per_week - band(before, "weekday_evening").tutor_hours_per_week).toBe(2);
    expect(after.tracks.find((r: any) => r.track === "immigration").learners - before.tracks.find((r: any) => r.track === "immigration").learners).toBe(1);
    expect((await adminCall(admin.token, "admin_metrics", { days: 14 })).body.error_code).toBe("RANGE_INVALID");
    expect((await adminCall(t, "admin_metrics", { days: 7 })).status).toBe(403);
  }, 60000);
});
