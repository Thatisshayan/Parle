import { lessonIcs } from "./ics.ts";

/** Lesson email wording (pure; tests/lesson-mail.test.ts). Plain, warm, no em dashes; times in each person's zone. */
export type MailParty = { email: string; name: string; timeZone: string };
export type MailLesson = { id: string; startAt: string; endAt: string; minutes: number; priceCents: number; learnerMessage: string; rescheduleCount: number };
export type MailContext = { lesson: MailLesson; learner: MailParty; tutor: MailParty; meetingLink: string; appUrl: string; now: string };
export type OutgoingMail = { to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: string; contentType: string }> };
export type CancelInfo = { by: "learner" | "tutor" | "account_deleted" | "admin"; refundCents: number; deletedParty?: "learner" | "tutor"; pausedParty?: "learner" | "tutor" };
type When = { startAt: string; endAt: string; rescheduleCount: number };

export const ORGANIZER = "no-reply@parle.buzz";
export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const money = (cents: number) => `$${(cents / 100).toFixed(2)} CAD`; // lessons are in CAD (decision #55)
export const lessonUid = (id: string, rescheduleCount: number) => `parle-lesson-${id}-${rescheduleCount}@parle.buzz`;

/** "Sunday, November 1, 2026 at 10:00 AM EST" (ICU's narrow no-break space made a plain space). */
export function formatWhen(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" })
    .format(new Date(iso)).replace(/\u202f/g, " ");
}
const formatDay = (iso: string, zone: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }).format(new Date(iso));

const page = (parts: string[]) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1E3A8A">${parts.join("")}<p style="color:#6B7280;font-size:13px">Parle</p></div>`;
const p = (html: string) => `<p>${html}</p>`;
const a = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const strong = (text: string) => `<strong>${escapeHtml(text)}</strong>`;

function learnerLink(c: MailContext): string {
  return c.meetingLink ? p(`Join your lesson here: ${a(c.meetingLink, c.meetingLink)}`) : p("Your tutor will send you the meeting link before the lesson.");
}
function tutorLink(c: MailContext): string {
  return c.meetingLink
    ? p(`Your meeting link: ${a(c.meetingLink, c.meetingLink)}`)
    : p(`Your meeting link is missing. Add it on ${a(`${c.appUrl}/tutor/profile-pricing`, "Profile & Pricing")} so your learner can join.`);
}
const policy = (c: MailContext) => a(`${c.appUrl}/help/cancellations-refunds`, "How cancellations and refunds work");

function invite(c: MailContext, who: "learner" | "tutor", method: "REQUEST" | "CANCEL", when: When = { startAt: c.lesson.startAt, endAt: c.lesson.endAt, rescheduleCount: c.lesson.rescheduleCount }) {
  const other = who === "learner" ? c.tutor.name : c.learner.name;
  return {
    filename: method === "CANCEL" ? "lesson-cancelled.ics" : "lesson.ics",
    contentType: `text/calendar; charset=utf-8; method=${method}`,
    content: lessonIcs({
      uid: lessonUid(c.lesson.id, when.rescheduleCount), sequence: method === "CANCEL" ? 1 : 0, method,
      startIso: when.startAt, endIso: when.endAt, summary: `French lesson with ${other} (Parle)`,
      description: c.meetingLink ? `Join: ${c.meetingLink}` : "Your tutor will share the meeting link before the lesson.",
      location: c.meetingLink, organizerEmail: ORGANIZER, attendeeEmail: who === "learner" ? c.learner.email : c.tutor.email, now: c.now,
    }),
  };
}

export function confirmationMails(c: MailContext): OutgoingMail[] {
  return [
    {
      to: c.learner.email,
      subject: `Your French lesson with ${c.tutor.name} is booked`,
      html: page([
        p(`Your ${c.lesson.minutes}-minute lesson with ${escapeHtml(c.tutor.name)} is booked for ${strong(formatWhen(c.lesson.startAt, c.learner.timeZone))}.`),
        p(`You paid ${money(c.lesson.priceCents)}.`),
        learnerLink(c),
        p(`The calendar invite is attached. You can cancel or reschedule from ${a(`${c.appUrl}/learner/lessons`, "your lessons")}. ${policy(c)}.`),
      ]),
      attachments: [invite(c, "learner", "REQUEST")],
    },
    {
      to: c.tutor.email,
      subject: `New lesson booked: ${c.learner.name}, ${formatDay(c.lesson.startAt, c.tutor.timeZone)}`,
      html: page([
        p(`${escapeHtml(c.learner.name)} booked a ${c.lesson.minutes}-minute lesson with you for ${strong(formatWhen(c.lesson.startAt, c.tutor.timeZone))}.`),
        c.lesson.learnerMessage ? p(`Their message: "${escapeHtml(c.lesson.learnerMessage)}"`) : p("They did not add a message."),
        tutorLink(c),
        p(`The calendar invite is attached. Your lesson brief appears on ${a(`${c.appUrl}/tutor/lessons`, "your Lessons page")} 24 hours before the lesson.`),
      ]),
      attachments: [invite(c, "tutor", "REQUEST")],
    },
  ];
}

/** An administrator paused one person (Plan 8 spec 3.2): only the other person is told, and never why. */
function pausedCancellationMails(c: MailContext, info: CancelInfo): OutgoingMail[] {
  if (info.pausedParty === "tutor") {
    const when = formatWhen(c.lesson.startAt, c.learner.timeZone);
    return [{
      to: c.learner.email,
      subject: `Your lesson on ${formatDay(c.lesson.startAt, c.learner.timeZone)} is cancelled`,
      html: page([
        p(`${escapeHtml(c.tutor.name)} is not available for lessons on Parle right now, so your lesson on ${strong(when)} is cancelled. We are sorry for the change.`),
        p(info.refundCents > 0 ? `We refunded ${money(info.refundCents)} to your card. It can take 5 to 10 business days to appear.` : "No payment was taken for this lesson."),
        p(`You can choose another tutor on ${a(`${c.appUrl}/learner/tutors`, "Tutors")}. ${policy(c)}.`),
      ]),
      attachments: [invite(c, "learner", "CANCEL")],
    }];
  }
  const when = formatWhen(c.lesson.startAt, c.tutor.timeZone);
  return [{
    to: c.tutor.email,
    subject: `Lesson cancelled: ${c.learner.name}, ${formatDay(c.lesson.startAt, c.tutor.timeZone)}`,
    html: page([p(`Your lesson with ${escapeHtml(c.learner.name)} on ${strong(when)} was cancelled by Parle, and the learner has been refunded. The time is free again in your calendar.`)]),
    attachments: [invite(c, "tutor", "CANCEL")],
  }];
}

export function cancellationMails(c: MailContext, info: CancelInfo): OutgoingMail[] {
  if (info.by === "admin") return pausedCancellationMails(c, info);
  const learnerWhen = formatWhen(c.lesson.startAt, c.learner.timeZone);
  const tutorWhen = formatWhen(c.lesson.startAt, c.tutor.timeZone);
  const tutorName = escapeHtml(c.tutor.name), learnerName = escapeHtml(c.learner.name);
  const learnerOpening = info.by === "learner" ? `You cancelled your lesson with ${tutorName} on ${strong(learnerWhen)}.`
    : info.by === "tutor" ? `${tutorName} cancelled your lesson on ${strong(learnerWhen)}. We are sorry for the change.`
    : info.deletedParty === "tutor" ? `${tutorName} closed their Parle account, so your lesson on ${strong(learnerWhen)} is cancelled.`
    : `Your Parle account was deleted, so your lesson with ${tutorName} on ${strong(learnerWhen)} is cancelled.`;
  const refundLine = info.refundCents > 0
    ? `We refunded ${money(info.refundCents)} to your card. It can take 5 to 10 business days to appear.`
    : "This cancellation came less than 24 hours before the lesson, so it is not refunded.";
  const mails: OutgoingMail[] = [{
    to: c.learner.email,
    subject: `Your lesson on ${formatDay(c.lesson.startAt, c.learner.timeZone)} is cancelled`,
    html: page([p(learnerOpening), p(refundLine), p(`${policy(c)}.`)]),
    attachments: [invite(c, "learner", "CANCEL")],
  }];
  if (!(info.by === "account_deleted" && info.deletedParty === "tutor")) {
    const tutorOpening = info.by === "learner"
      ? `${learnerName} cancelled their lesson on ${strong(tutorWhen)}.${info.refundCents === 0 ? " It was less than 24 hours before the lesson, so you will still be paid for it." : ""}`
      : info.by === "tutor" ? `You cancelled your lesson with ${learnerName} on ${strong(tutorWhen)}. They have been refunded in full.`
      : `${learnerName} closed their Parle account, so their lesson on ${strong(tutorWhen)} is cancelled and refunded.`;
    mails.push({ to: c.tutor.email, subject: `Lesson cancelled: ${c.learner.name}, ${formatDay(c.lesson.startAt, c.tutor.timeZone)}`, html: page([p(tutorOpening)]), attachments: [invite(c, "tutor", "CANCEL")] });
  }
  return mails;
}

export function rescheduleMails(c: MailContext, old: When): OutgoingMail[] {
  return (["learner", "tutor"] as const).map((who) => {
    const zone = who === "learner" ? c.learner.timeZone : c.tutor.timeZone;
    const other = escapeHtml(who === "learner" ? c.tutor.name : c.learner.name);
    return {
      to: who === "learner" ? c.learner.email : c.tutor.email,
      subject: `Your lesson has moved to ${formatDay(c.lesson.startAt, zone)}`,
      html: page([
        p(`Your lesson with ${other} has moved from ${escapeHtml(formatWhen(old.startAt, zone))} to ${strong(formatWhen(c.lesson.startAt, zone))}.`),
        p("The new calendar invite is attached, and the old one is cancelled."),
        who === "learner" ? learnerLink(c) : tutorLink(c),
      ]),
      attachments: [invite(c, who, "CANCEL", old), invite(c, who, "REQUEST")],
    };
  });
}

export function slotLostMail(c: MailContext, refundCents: number): OutgoingMail {
  return {
    to: c.learner.email,
    subject: "Your payment was refunded",
    html: page([
      p(`The time you chose with ${escapeHtml(c.tutor.name)} was booked by someone else before your payment arrived, so we refunded ${money(refundCents)} in full.`),
      p(`Please choose another time on ${a(`${c.appUrl}/learner/tutors`, "Parle")}. It can take 5 to 10 business days for the refund to appear.`),
    ]),
  };
}

export function reminderMails(c: MailContext, kind: "24h" | "1h"): OutgoingMail[] {
  const soon = kind === "24h" ? "tomorrow" : "in about an hour";
  return [
    {
      to: c.learner.email,
      subject: kind === "24h" ? `Reminder: your French lesson with ${c.tutor.name} is tomorrow` : "Your French lesson starts in about an hour",
      html: page([p(`Your lesson with ${escapeHtml(c.tutor.name)} is ${soon}: ${strong(formatWhen(c.lesson.startAt, c.learner.timeZone))}.`), learnerLink(c)]),
    },
    {
      to: c.tutor.email,
      subject: kind === "24h" ? `Reminder: lesson with ${c.learner.name} tomorrow` : `Lesson with ${c.learner.name} in about an hour`,
      html: page([
        p(`Your lesson with ${escapeHtml(c.learner.name)} is ${soon}: ${strong(formatWhen(c.lesson.startAt, c.tutor.timeZone))}.`),
        tutorLink(c),
        ...(kind === "24h" ? [p(`Your lesson brief is ready: ${a(`${c.appUrl}/tutor/lessons?lesson=${c.lesson.id}`, "open the brief")}.`)] : []),
      ]),
    },
  ];
}

export function reviewRequestMail(c: MailContext): OutgoingMail {
  return {
    to: c.learner.email,
    subject: `How was your lesson with ${c.tutor.name}?`,
    html: page([
      p(`We hope your lesson with ${escapeHtml(c.tutor.name)} went well.`),
      p(`You can give 1 to 5 stars and a short comment on ${a(`${c.appUrl}/learner/lessons?review=${c.lesson.id}`, "your lessons")}. It takes a minute and helps other learners.`),
    ]),
  };
}
