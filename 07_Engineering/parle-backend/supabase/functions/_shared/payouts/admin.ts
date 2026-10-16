import type { LessonContext } from "../lessons/actions.ts";
import { LessonError } from "../lessons/errors.ts";
import { isUuid } from "../lessons/rules.ts";
import { loadBooking, person, tutorInfo, type BookingRow } from "../lessons/store.ts";
import { adminListDisputed } from "../lessons/after.ts";
import { mailContext } from "../lessons/notify.ts";
import { sendMail } from "../email.ts";
import { reversalCents, splitPayoutCents } from "./rules.ts";
import { recordPaid, sendClaimed } from "./send.ts";
import { auditPayout } from "./audit.ts";
import { adminRefundMail } from "./mail.ts";

type Decision = "release" | "refund" | "split" | "refund_after_payout";
type PayoutRow = {
  id: string; booking_id: string; tutor_id: string; amount_cents: number; commission_cents: number; status: string; hold_reason: string | null;
  release_at: string; paid_at: string | null; stripe_transfer_id: string | null; reversed_cents: number; transfer_attempt: number;
};
type PaymentRow = { stripe_payment_intent_id: string; amount_cents: number; refunded_cents: number; status: string };

const adminOnly = (ctx: LessonContext) => {
  if (ctx.caller.role !== "admin") throw new LessonError("ADMIN_REQUIRED", 403, "Administrators only.");
};
const NOT_FOUND = () => new LessonError("NOT_FOUND", 404, "Payout not found.");
const BUSY = () => new LessonError("PAYOUT_BUSY", 409, "This payout was just decided, or another decision is in progress. Reload the list.");
const AMOUNT = () => new LessonError("AMOUNT_INVALID", 400, "Enter an amount above $0 and below what the learner paid.");
const UNAVAILABLE = () => new LessonError("PAYOUT_ACTION_UNAVAILABLE", 503, "Stripe could not be reached. Nothing changed. Try again in a few minutes.");
const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);

async function load(ctx: LessonContext, id: unknown): Promise<{ payout: PayoutRow; booking: BookingRow; payment: PaymentRow }> {
  if (!isUuid(id)) throw NOT_FOUND();
  const { data: payout, error } = await ctx.db.from("payout").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!payout) throw NOT_FOUND();
  const booking = await loadBooking(ctx.db, payout.booking_id);
  const { data: payment, error: paymentError } = await ctx.db.from("payment").select("stripe_payment_intent_id, amount_cents, refunded_cents, status").eq("booking_id", payout.booking_id).maybeSingle();
  if (paymentError) throw new Error(paymentError.message);
  if (!booking || !payment) throw NOT_FOUND();
  return { payout: payout as PayoutRow, booking, payment: payment as PaymentRow };
}

async function item(ctx: LessonContext, id: string): Promise<Record<string, unknown>> {
  const { payout, booking, payment } = await load(ctx, id);
  const [tutor, learnerPerson] = await Promise.all([
    booking.tutor_id ? tutorInfo(ctx.db, booking.tutor_id) : null, booking.learner_id ? person(ctx.db, booking.learner_id) : null,
  ]);
  return {
    payout_id: payout.id, booking_id: booking.id, status: payout.status, hold_reason: payout.hold_reason, amount_cents: payout.amount_cents,
    commission_cents: payout.commission_cents, commission_pct: Number(booking.commission_pct), reversed_cents: payout.reversed_cents,
    release_at: iso(payout.release_at), paid_at: iso(payout.paid_at), transfer_id: payout.stripe_transfer_id, price_cents: booking.price_cents,
    paid_cents: payment.amount_cents, refunded_cents: payment.refunded_cents, payment_status: payment.status, lesson_status: booking.status,
    disputed_from: booking.disputed_from, dispute_kind: booking.dispute_kind, dispute_details: booking.dispute_details, start_at: iso(booking.start_at),
    tutor_name: tutor?.displayName ?? "Former tutor", learner_name: learnerPerson?.firstName || (booking.learner_id ? "Learner" : "Former learner"),
  };
}

const summary = (p: PayoutRow) => JSON.stringify({ status: p.status, hold_reason: p.hold_reason, amount_cents: p.amount_cents });

async function begin(ctx: LessonContext, id: string, kind: Decision): Promise<void> {
  const { data, error } = await ctx.db.rpc("payout_decision_begin", { p_payout: id, p_kind: kind, p_by: ctx.caller.email });
  if (error) throw new Error(error.message);
  if (data !== "claimed") throw BUSY();
}
async function abort(ctx: LessonContext, id: string, kind: Decision): Promise<void> {
  await ctx.db.rpc("payout_decision_abort", { p_payout: id, p_kind: kind });
}
async function decide(ctx: LessonContext, id: string, kind: Decision, amount: number | null = null, commission: number | null = null): Promise<void> {
  const { data, error } = await ctx.db.rpc("payout_decide", { p_payout: id, p_kind: kind, p_amount: amount, p_commission: commission, p_by: ctx.caller.email });
  if (error) throw new Error(error.message);
  if (data !== "decided") throw BUSY();
}
async function audit(ctx: LessonContext, action: string, p: PayoutRow, newValue: Record<string, unknown>): Promise<void> {
  await auditPayout(ctx.db, { actorId: ctx.caller.id, actorLabel: ctx.caller.email, action, payoutId: p.id, oldValue: summary(p), newValue: JSON.stringify(newValue), now: ctx.now });
}

/**
 * Before a refund or a split: a transfer whose answer was lost may already have paid the tutor (Plan 7B review,
 * Important 1). If Stripe has one, it is recorded, the decision ends and the administrator is told to refund after payout.
 */
async function refuseIfAlreadyPaid(ctx: LessonContext, id: string, kind: Decision): Promise<void> {
  let found;
  try {
    found = await ctx.payments.findTransfer(id);
  } catch (e) {
    await abort(ctx, id, kind);
    console.warn("could not check for an earlier transfer", (e as Error).message);
    throw UNAVAILABLE();
  }
  if (!found) return;
  await recordPaid(ctx.db, id, found);
  await abort(ctx, id, kind);
  throw new LessonError("ALREADY_PAID", 409, "The tutor was already paid for this lesson. Use refund after payout instead.");
}

/** Refunds through Stripe once per booking and reason (idempotency key), records it, emails the learner. */
async function refundLearner(ctx: LessonContext, booking: BookingRow, payment: PaymentRow, cents: number, reason: "admin" | "admin_split" | "admin_after_payout"): Promise<void> {
  const refund = await ctx.payments.refund({ paymentIntentId: payment.stripe_payment_intent_id, amountCents: cents, idempotencyKey: `lesson-refund:${booking.id}:${reason}`, bookingId: booking.id, reason });
  const { error } = await ctx.db.rpc("lesson_record_refund", { p_booking: booking.id, p_amount: cents, p_refund_id: refund.id, p_reason: reason, p_by: ctx.caller.email, p_event: null });
  if (error) throw new Error(error.message);
  const c = await mailContext(ctx.db, booking);
  if (c) await sendMail({ ...adminRefundMail(c, cents), idempotencyKey: `lesson-mail:${booking.id}:${reason}` }).catch((e) => console.warn("refund email failed", (e as Error).message));
}

/** The Payouts screen (spec section 7): held payouts, paid ones now disputed, and tutors flagged for cancellations. */
export async function adminListPayouts(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const { data: held, error } = await ctx.db.from("payout").select("id").eq("status", "held").order("held_at", { ascending: true }).limit(100);
  if (error) throw new Error(error.message);
  const [{ data: disputedPayments }, { data: disputedLessons }] = await Promise.all([
    ctx.db.from("payment").select("booking_id").eq("status", "disputed").limit(200),
    ctx.db.from("booking").select("id").eq("status", "disputed").limit(200),
  ]);
  const ids = [...new Set([...(disputedPayments ?? []).map((r: any) => r.booking_id), ...(disputedLessons ?? []).map((r: any) => r.id)])];
  const { data: paid } = ids.length ? await ctx.db.from("payout").select("id").eq("status", "paid").in("booking_id", ids).limit(100) : { data: [] as Array<{ id: string }> };
  const items = async (rows: Array<{ id: string }> | null) => { const out = []; for (const r of rows ?? []) out.push(await item(ctx, r.id)); return out; };
  return { held: await items(held), after_payout: await items(paid), flagged_tutors: (await adminListDisputed(ctx)).flagged_tutors };
}

/** Release: pay the tutor now (a dispute ends in the tutor's favour; the lesson returns to what it was). */
export async function adminRelease(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const { payout } = await load(ctx, ctx.body.payout_id);
  if (payout.status !== "held" && payout.status !== "scheduled") throw BUSY();
  await begin(ctx, payout.id, "release");
  await decide(ctx, payout.id, "release");
  await audit(ctx, "payout.release", payout, { status: "scheduled", release: "now" });
  const sent = await sendClaimed(ctx.db, ctx.payments, payout.id);
  return { sent, payout: await item(ctx, payout.id) };
}

/** Refund the learner: what is left of the payment goes back, the payout is cancelled. On a chargeback, no Stripe refund. */
export async function adminRefund(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const { payout, booking, payment } = await load(ctx, ctx.body.payout_id);
  if (payout.status !== "held" && payout.status !== "scheduled") throw BUSY();
  await begin(ctx, payout.id, "refund");
  await refuseIfAlreadyPaid(ctx, payout.id, "refund");
  const chargeback = payment.status === "disputed";
  const remaining = payment.amount_cents - payment.refunded_cents;
  try {
    if (!chargeback && remaining > 0) await refundLearner(ctx, booking, payment, remaining, "admin");
  } catch (e) {
    await abort(ctx, payout.id, "refund");
    console.warn("administrator refund failed", (e as Error).message);
    throw new LessonError("REFUND_UNAVAILABLE", 503, "Stripe could not refund the learner. Nothing changed. Try again in a few minutes.");
  }
  await decide(ctx, payout.id, "refund");
  await audit(ctx, "payout.refund", payout, { status: "cancelled", learner_refunded_cents: chargeback ? 0 : remaining, chargeback });
  return { payout: await item(ctx, payout.id) };
}

/** Split: part back to the learner, the tutor's share of the rest paid now. */
export async function adminSplit(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const refundCents = Number(ctx.body.refund_cents);
  const { payout, booking, payment } = await load(ctx, ctx.body.payout_id);
  const remaining = payment.amount_cents - payment.refunded_cents;
  if (!Number.isInteger(refundCents) || refundCents <= 0 || refundCents >= remaining) throw AMOUNT();
  if (payment.status === "disputed") throw new LessonError("CHARGEBACK_OPEN", 409, "The learner's bank disputed this payment: release the payout or refund the learner.");
  if (payout.status !== "held" && payout.status !== "scheduled") throw BUSY();
  await begin(ctx, payout.id, "split");
  await refuseIfAlreadyPaid(ctx, payout.id, "split");
  try {
    await refundLearner(ctx, booking, payment, refundCents, "admin_split");
  } catch (e) {
    await abort(ctx, payout.id, "split");
    console.warn("administrator split refund failed", (e as Error).message);
    throw new LessonError("REFUND_UNAVAILABLE", 503, "Stripe could not refund the learner. Nothing changed. Try again in a few minutes.");
  }
  const amount = splitPayoutCents(remaining, Number(booking.commission_pct), refundCents);
  const commission = remaining - refundCents - amount;
  await decide(ctx, payout.id, "split", amount, commission);
  await audit(ctx, "payout.split", payout, { learner_refunded_cents: refundCents, tutor_cents: amount, parle_cents: commission });
  const sent = await sendClaimed(ctx.db, ctx.payments, payout.id);
  return { sent, payout: await item(ctx, payout.id) };
}

/** After the tutor was paid: refund the learner, and take the tutor's share back or have Parle absorb it. */
export async function adminRefundAfterPayout(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const share = ctx.body.tutor_share === "reverse" ? "reverse" : ctx.body.tutor_share === "absorb" ? "absorb" : "";
  if (!share) throw new LessonError("CHOICE_REQUIRED", 400, "Choose whether to take the tutor's share back or have Parle absorb it.");
  const refundCents = Number(ctx.body.refund_cents);
  const { payout, booking, payment } = await load(ctx, ctx.body.payout_id);
  if (payout.status !== "paid" || !payout.stripe_transfer_id) throw new LessonError("NOT_PAID", 409, "This payout has not been sent: use release, refund or split.");
  const chargeback = payment.status === "disputed";
  // pressed again after a reversal failed: the refund already went through once, so the same amount is allowed
  // again and is not refunded twice (Plan 7B review, Important 3)
  const { data: earlier, error: earlierError } = await ctx.db.from("refund").select("amount_cents").eq("booking_id", booking.id).eq("reason", "admin_after_payout").maybeSingle();
  if (earlierError) throw new Error(earlierError.message);
  const limit = chargeback ? payment.amount_cents : payment.amount_cents - payment.refunded_cents + (earlier?.amount_cents ?? 0);
  if (!Number.isInteger(refundCents) || refundCents <= 0 || refundCents > limit) throw AMOUNT();
  if (earlier && earlier.amount_cents !== refundCents) throw AMOUNT();
  await begin(ctx, payout.id, "refund_after_payout");
  let reversed = 0;
  try {
    if (!chargeback && !earlier) await refundLearner(ctx, booking, payment, refundCents, "admin_after_payout");
    if (share === "reverse") {
      // computed from the reversals already recorded before this decision, so a retry asks Stripe for the same amount
      reversed = reversalCents({ refundCents, payoutCents: payout.amount_cents, priceCents: payment.amount_cents, alreadyReversed: earlier ? 0 : payout.reversed_cents });
      if (reversed > 0) {
        const r = await ctx.payments.reverseTransfer({ transferId: payout.stripe_transfer_id, amountCents: reversed, idempotencyKey: `payout-reversal:${payout.id}:admin_after_payout`, payoutId: payout.id });
        const { error } = await ctx.db.rpc("payout_record_reversal", { p_payout: payout.id, p_reversal: r.id, p_amount: r.totalReversedCents });
        if (error) throw new Error(error.message);
      }
    }
  } catch (e) {
    await abort(ctx, payout.id, "refund_after_payout");
    console.warn("refund after payout did not finish", (e as Error).message);
    throw new LessonError("PAYOUT_ACTION_UNAVAILABLE", 503, "Stripe could not finish this. What was already done stays done; press again in a few minutes to finish.");
  }
  await decide(ctx, payout.id, "refund_after_payout");
  await audit(ctx, "payout.refund_after_payout", payout, { learner_refunded_cents: chargeback ? 0 : refundCents, chargeback, tutor_share: share, reversed_cents: reversed });
  return { payout: await item(ctx, payout.id) };
}
