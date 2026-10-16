import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasTranslationKey } from "./i18n";
import { groupLearnerLessons, groupTutorLessons, lengthsBelowMinimum, lessonErrorKey, safeLesson, type ParleLesson } from "./parle-booking";

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

