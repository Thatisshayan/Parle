import { escapeHtml, formatWhen, money, type MailContext, type OutgoingMail } from "../lessons/mail-copy.ts";

/** Spec section 5: every refund is emailed to the learner; this one follows an administrator's decision. */
export function adminRefundMail(c: MailContext, refundCents: number): OutgoingMail {
  const when = formatWhen(c.lesson.startAt, c.learner.timeZone);
  return {
    to: c.learner.email,
    subject: `We refunded ${money(refundCents)} for your lesson with ${c.tutor.name}`,
    html: `<p>Hello ${escapeHtml(c.learner.name)},</p>`
      + `<p>We looked into your lesson with ${escapeHtml(c.tutor.name)} on ${escapeHtml(when)} and refunded ${money(refundCents)} to your card. It can take 5 to 10 days to appear.</p>`
      + `<p><a href="${c.appUrl}/learner/lessons">See your lessons</a></p><p>Parle</p>`,
  };
}
