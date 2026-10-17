import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasTranslationKey } from "./i18n";
import { formatCadCents, groupLearnerLessons, groupTutorLessons, lengthsBelowMinimum, lessonErrorKey, lessonStatusKey, returnBanner, safeLesson, type ParleLesson } from "./parle-booking";

const raw = (over: Record<string, unknown> = {}) => ({
  id: "b1", tutor_profile_id: "p1", tutor_name: "Camille T.", learner_name: "Ana", start_at: "2026-11-05T10:00:00.000Z", end_at: "2026-11-05T11:00:00.000Z",
  minutes: 60, price_cents: 4000, status: "confirmed", learner_message: "", meeting_link: "https://meet.google.com/abc-defg-hij", reschedule_count: 0,
  hold_expires_at: null, cancelled_by: null, late_cancel: false, dispute_kind: null, can_cancel: true, cancel_refund_cents: 4000, can_reschedule: true,
  can_mark_attendance: false, can_report: false, can_review: false, review_stars: null, notes: null, can_write_notes: false, has_brief: false, ...over,
});

describe("lesson views from the server", () => {
  it("keeps a valid lesson and refuses unknown statuses or lengths", () => {
    assert.equal(safeLesson(raw())?.price_cents, 4000);
    assert.equal(safeLesson(raw({ status: "requested" })), null);
    assert.equal(safeLesson(raw({ minutes: 50 })), null);
    assert.deepEqual(safeLesson(raw({ notes: { skills: { writing: "struggling", cooking: "ok" }, notes: "n", homework: "h" } }))?.notes, { skills: { writing: "struggling" }, notes: "n", homework: "h" });
  });
  it("groups lessons for learners and tutors", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    const lessons = [
      raw({ id: "soon", start_at: "2026-11-06T10:00:00.000Z", end_at: "2026-11-06T11:00:00.000Z" }),
      raw({ id: "ended", can_mark_attendance: true }),
      raw({ id: "done", status: "completed", can_write_notes: true }),
      raw({ id: "gone", status: "cancelled_tutor" }),
    ].map((l) => safeLesson(l) as ParleLesson);
    const learner = groupLearnerLessons(lessons, now);
    assert.deepEqual(learner.upcoming.map((l) => l.id), ["soon"]);
    assert.deepEqual(learner.past.map((l) => l.id).sort(), ["done", "ended", "gone"]);
    const tutor = groupTutorLessons(lessons, now);
    assert.deepEqual(tutor.upcoming.map((l) => l.id), ["soon"]);
    assert.deepEqual(tutor.toDo.map((l) => l.id), ["ended", "done"]);
    assert.deepEqual(tutor.cancelled.map((l) => l.id), ["gone"]);
  });
  it("a cancel already in progress has its own message (Plan 11, A53)", () => {
    assert.equal(lessonErrorKey("CANCEL_IN_PROGRESS"), "lessons.error.cancelInProgress");
  });
  it("every refusal code the service sends has a message", () => {
    for (const code of ["SLOT_TAKEN", "NOTICE_TOO_SHORT", "HOLD_LIMIT", "RATE_LIMITED", "PAYMENT_UNAVAILABLE", "BOOKING_NOT_OPEN", "TUTOR_NOT_AVAILABLE", "HOLD_EXPIRED", "CANCEL_TERMS_CHANGED", "REFUND_UNAVAILABLE", "CANNOT_CANCEL", "RESCHEDULE_NOT_ALLOWED", "REPORT_CLOSED", "REVIEW_EXISTS", "ATTENDANCE_NOT_OPEN", "NOTES_INVALID", "ANYTHING_ELSE"]) {
      assert.equal(hasTranslationKey(lessonErrorKey(code)), true, code);
    }
  });
  it("names the lengths a tutor's rate puts under the $8 minimum", () => {
    assert.deepEqual(lengthsBelowMinimum([30, 45, 60], 1000, 800), [30, 45]);
    assert.deepEqual(lengthsBelowMinimum([30, 45, 60], 0, 800), []);
  });
});

describe("coming back from Stripe with the browser's Back button (final review)", () => {
  it("the tutor profile resets Book and pay when the page is restored from the back/forward cache", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../pages/LearnerTutorProfile.tsx", import.meta.url), "utf8");
    assert.match(src, /addEventListener\("pageshow"/);
    assert.match(src, /event\.persisted/);
    assert.match(src, /requestInFlight\.current = false/);
  });
});

describe("lesson money is shown in CAD (decision #55)", () => {
  it("formats cents as Canadian dollars, marked so nobody reads them as US dollars", () => {
    assert.equal(formatCadCents(1400), "CA$14.00");
    assert.equal(formatCadCents(0), "CA$0.00");
  });
});

describe("back from Stripe after a refund (Plan 11: A55, R63)", () => {
  it("a slot_lost refund shows the refunded banner; a confirmed lesson the confirmed one", () => {
    assert.equal(returnBanner(safeLesson(raw({ status: "expired", refund_reason: "slot_lost" }))!), "refunded");
    assert.equal(returnBanner(safeLesson(raw({ status: "confirmed" }))!), "confirmed");
    assert.equal(returnBanner(safeLesson(raw({ status: "pending_payment" }))!), null);
  });
});

describe("the label of a refunded lesson (Plan 11: A55)", () => {
  it("says Refunded, not Not paid, when the time could not be booked", () => {
    assert.equal(lessonStatusKey(safeLesson(raw({ status: "expired", refund_reason: "slot_lost" }))!), "lessons.status.refunded");
    assert.equal(lessonStatusKey(safeLesson(raw({ status: "expired" }))!), "lessons.status.expired");
    assert.equal(lessonStatusKey(safeLesson(raw({ status: "confirmed" }))!), "lessons.status.confirmed");
  });
});
