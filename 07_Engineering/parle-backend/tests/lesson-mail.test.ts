import { describe, it, expect } from "bun:test";
import { lessonIcs } from "../supabase/functions/_shared/lessons/ics";
import { cancellationMails, confirmationMails, formatWhen, rescheduleMails, type MailContext } from "../supabase/functions/_shared/lessons/mail-copy";

const base: MailContext = {
  lesson: { id: "b1", startAt: "2026-11-01T15:00:00.000Z", endAt: "2026-11-01T16:00:00.000Z", minutes: 60, priceCents: 4000, learnerMessage: "J'ai un <examen>", rescheduleCount: 0 },
  learner: { email: "ana@example.test", name: "Ana", timeZone: "Asia/Tehran" },
  tutor: { email: "camille@example.test", name: "Camille T.", timeZone: "America/Toronto" },
  meetingLink: "https://meet.google.com/abc-defg-hij", appUrl: "https://app.example.test", now: "2026-10-20T12:00:00.000Z",
};
const ctx = (over: Partial<MailContext> = {}): MailContext => ({ ...base, ...over });

describe("times across the 2026-11-01 clock change", () => {
  it("shows each person's own local time, before and after the change", () => {
    expect(formatWhen("2026-11-01T15:00:00.000Z", "America/Toronto")).toContain("10:00 AM EST");
    expect(formatWhen("2026-10-31T14:00:00.000Z", "America/Toronto")).toContain("10:00 AM EDT");
    expect(formatWhen("2026-11-01T15:00:00.000Z", "America/Toronto")).toContain("November 1, 2026");
  });
});

describe("calendar invites", () => {
  it("are standard invites in UTC, with escaped text and folded lines", () => {
    const ics = lessonIcs({ uid: "parle-lesson-b1-0@parle.buzz", sequence: 0, method: "REQUEST", startIso: "2026-11-01T15:00:00.000Z", endIso: "2026-11-01T16:00:00.000Z", summary: "French lesson with Camille T., Paris; online", description: "Line one\nLine two", location: "https://meet.google.com/abc-defg-hij", organizerEmail: "no-reply@parle.buzz", attendeeEmail: "ana@example.test", now: "2026-10-20T12:00:00.000Z" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261101T150000Z\r\n");
    expect(ics).toContain("SUMMARY:French lesson with Camille T.\\, Paris\\; online");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });
});

describe("lesson emails", () => {
  it("confirmations show each person's time, the link and the invite; the tutor sees the escaped message", () => {
    const [toLearner, toTutor] = confirmationMails(ctx());
    expect(toLearner.to).toBe("ana@example.test");
    expect(toLearner.html).toContain(formatWhen("2026-11-01T15:00:00.000Z", "Asia/Tehran"));
    expect(toTutor.html).toContain("10:00 AM EST");
    expect(toLearner.html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(toTutor.html).toContain("&lt;examen&gt;");
    expect(toLearner.attachments?.[0].filename).toBe("lesson.ics");
    expect(toLearner.attachments?.[0].content).toContain("UID:parle-lesson-b1-0@parle.buzz");
  });
  it("a tutor without a meeting link gets a clear line, never a blank link (Review Focus 2)", () => {
    const [toLearner, toTutor] = confirmationMails(ctx({ meetingLink: "" }));
    expect(toLearner.html).toContain("Your tutor will send you the meeting link before the lesson.");
    expect(toTutor.html).toContain("Your meeting link is missing.");
    for (const mail of [toLearner, toTutor]) {
      expect(mail.html).not.toContain('href=""');
      expect(mail.html).not.toContain("undefined");
      expect(mail.attachments?.[0].content).not.toContain("LOCATION:");
    }
  });
  it("cancellations say whether money comes back, and attach a cancelled invite", () => {
    const [learnerFull] = cancellationMails(ctx(), { by: "learner", refundCents: 4000 });
    expect(learnerFull.html).toContain("We refunded $40.00 CAD");
    expect(learnerFull.attachments?.[0].content).toContain("METHOD:CANCEL");
    const [learnerLate, tutorLate] = cancellationMails(ctx(), { by: "learner", refundCents: 0 });
    expect(learnerLate.html).toContain("not refunded");
    expect(tutorLate.html).toContain("you will still be paid");
    expect(cancellationMails(ctx(), { by: "account_deleted", refundCents: 4000, deletedParty: "tutor" }).map((m) => m.to)).toEqual(["ana@example.test"]);
  });
  it("a reschedule cancels the old invite and sends a new one", () => {
    const moved = ctx({ lesson: { ...base.lesson, startAt: "2026-11-03T15:00:00.000Z", endAt: "2026-11-03T16:00:00.000Z", rescheduleCount: 1 } });
    const [toLearner] = rescheduleMails(moved, { startAt: "2026-11-01T15:00:00.000Z", endAt: "2026-11-01T16:00:00.000Z", rescheduleCount: 0 });
    expect(toLearner.attachments?.map((a) => a.filename)).toEqual(["lesson-cancelled.ics", "lesson.ics"]);
    expect(toLearner.attachments?.[0].content).toContain("UID:parle-lesson-b1-0@parle.buzz");
    expect(toLearner.attachments?.[1].content).toContain("UID:parle-lesson-b1-1@parle.buzz");
  });
});

describe("a lesson cancelled because an administrator paused one person (Plan 8 spec 3.2)", () => {
  it("only the other person is told, never why", () => {
    const toLearner = cancellationMails(ctx(), { by: "admin", refundCents: 4000, pausedParty: "tutor" });
    expect(toLearner.map((m) => m.to)).toEqual(["ana@example.test"]);
    expect(toLearner[0].html).toContain("Camille T. is not available for lessons on Parle right now");
    expect(toLearner[0].html).toContain("We refunded $40.00 CAD");
    expect(toLearner[0].attachments?.[0].filename).toBe("lesson-cancelled.ics");
    const toTutor = cancellationMails(ctx(), { by: "admin", refundCents: 4000, pausedParty: "learner" });
    expect(toTutor.map((m) => m.to)).toEqual(["camille@example.test"]);
    expect(toTutor[0].html).toContain("cancelled by Parle");
    for (const m of [...toLearner, ...toTutor]) {
      expect(m.html).not.toMatch(/paus|disabl|reason/i);
      expect(m.html).not.toContain("\u2014");
    }
  });
});
