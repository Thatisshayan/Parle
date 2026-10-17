import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import type { BookingRow } from "./store.ts";
import { priorRefunded, refundLesson } from "./refunds.ts";
import { sendCancellation } from "./notify.ts";
import { lessonSettings } from "./settings.ts";
import { settlePayoutsForDeletion } from "../payouts/deletion.ts";

const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

export type CancelCause = "account_deleted" | "admin";
class RefundStopped extends Error {}

/**
 * Ends a person's open holds and cancels every future confirmed lesson (as learner or tutor) with a full refund, and
 * emails the other person. Account deletion (decision #53) stops at the first refund Stripe refuses, so nothing
 * personal is removed. An administrator's pause (Plan 8 spec 3.2, reason "admin") counts a refused refund and goes on
 * with the others; the administrator retries later (Review Focus 1). Each refund has its idempotency key.
 */
/**
 * Ends a person's open payment holds (Plan 11, A59 and A80): marked with who ended them, so a payment that still lands
 * later is refunded (lesson_confirm_payment answers slot_lost for an expired hold with cancelled_by set), never confirmed.
 * Used by account deletion and by every administrator's pause, whether its lessons are kept or cancelled.
 */
export async function endOpenHolds(db: SupabaseClient, payments: LessonPayments, who: { id: string }, now: Date, cause: CancelCause): Promise<number> {
  const { data: holds, error } = await db.from("booking").select("id, stripe_checkout_session_id")
    .or(`learner_id.eq.${who.id},tutor_id.eq.${who.id}`).eq("status", "pending_payment");
  if (error) throw new Error(error.message);
  for (const hold of holds ?? []) {
    if (hold.stripe_checkout_session_id) await payments.expireCheckout(hold.stripe_checkout_session_id).catch(() => undefined);
    must(await db.from("booking").update({ status: "expired", cancelled_by: cause, status_changed_at: now.toISOString() }).eq("id", hold.id).eq("status", "pending_payment"));
  }
  return (holds ?? []).length;
}

export async function cancelFutureLessons(
  db: SupabaseClient, payments: LessonPayments, who: { id: string }, now: Date,
  opts: { cause: CancelCause; decidedBy: string; stopOnFailure: boolean; attempt?: number },
): Promise<{ cancelled: number; failed: number }> {
  const mine = `learner_id.eq.${who.id},tutor_id.eq.${who.id}`;
  await endOpenHolds(db, payments, who, now, opts.cause);
  // An administrator's pause also covers a lesson that already started or ended but was never marked: the paused
  // person cannot teach or attend it, and it must not be completed and paid later (Plan 8 review, Important 2).
  const base = db.from("booking").select("*").or(mine).eq("status", "confirmed");
  const { data: future, error } = await (opts.cause === "admin" ? base : base.gt("start_at", now.toISOString())).order("start_at");
  if (error) throw new Error(error.message);
  let cancelled = 0, failed = 0;
  for (const row of (future ?? []) as BookingRow[]) {
    const party = row.learner_id === who.id ? "learner" : "tutor";
    // A53 (R61): one cancel at a time per lesson; a lesson another cancel is handling is left to it
    const { data: claimed, error: claimError } = await db.rpc("lesson_claim_cancel", { p_booking: row.id });
    if (claimError) throw new Error(claimError.message);
    if (claimed !== true) {
      const { data: now2 } = await db.from("booking").select("status").eq("id", row.id).maybeSingle();
      if (now2?.status !== "confirmed") continue; // already cancelled by the other side
      if (opts.stopOnFailure) throw new RefundStopped();
      failed++;
      continue;
    }
    const refundedBeforeCents = await priorRefunded(db, row.id);
    let refund: { refundId: string; amountCents: number } | null;
    try {
      refund = await refundLesson(db, payments, row, opts.cause, opts.attempt ?? 0);
    } catch (e) {
      console.warn(`a lesson refund failed (${opts.cause})`, (e as Error).message);
      await db.from("booking").update({ cancel_claimed_at: null }).eq("id", row.id); // the retry may cancel it
      if (opts.stopOnFailure) throw new RefundStopped();
      failed++;
      continue;
    }
    const { data: result, error: cancelError } = await db.rpc("lesson_cancel", {
      p_booking: row.id, p_status: party === "learner" ? "cancelled_learner" : "cancelled_tutor", p_cancelled_by: opts.cause, p_late: false,
      p_refund_cents: refund?.amountCents ?? 0, p_refund_id: refund?.refundId ?? null, p_reason: opts.cause, p_decided_by: opts.decidedBy,
    });
    if (cancelError) throw new Error(cancelError.message);
    if (result === "cancelled") {
      cancelled++;
      const refundCents = refund?.amountCents ?? 0;
      const info = opts.cause === "admin" ? { by: "admin" as const, refundCents, pausedParty: party, refundedBeforeCents } : { by: "account_deleted" as const, refundCents, deletedParty: party, refundedBeforeCents };
      await sendCancellation(db, row.id, info).catch((e) => console.warn("cancellation email failed", (e as Error).message));
    }
  }
  return { cancelled, failed };
}

/**
 * Decision #53: before an account is deleted, its open holds end and every future lesson is cancelled and fully
 * refunded. A refund Stripe refuses stops here, so the caller removes nothing else and the person tries again later.
 */
export async function cancelLessonsForDeletion(db: SupabaseClient, payments: LessonPayments, caller: { id: string }, now: Date): Promise<{ blocked?: "LESSON_REFUND_FAILED" }> {
  try {
    await cancelFutureLessons(db, payments, caller, now, { cause: "account_deleted", decidedBy: "account_deleted", stopOnFailure: true });
  } catch (e) {
    if (e instanceof RefundStopped) return { blocked: "LESSON_REFUND_FAILED" };
    throw e;
  }
  // A deleted learner's briefs and notes go with them; the tutor keeps the lessons as "Former learner" (spec section 5).
  const { data: learned, error: learnedError } = await db.from("booking").select("id").eq("learner_id", caller.id);
  if (learnedError) throw new Error(learnedError.message);
  const ids = (learned ?? []).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    must(await db.from("lesson_brief").delete().in("booking_id", part));
    must(await db.from("lesson_notes").delete().in("booking_id", part));
    // the learner's own words (their message and any problem report) go too: "without your name or words" (final review)
    must(await db.from("booking").update({ learner_message: "", dispute_details: "" }).in("id", part));
  }
  // Plan 7B: a deleted tutor is still paid for lessons taught; the payout account is minimised (spec section 3)
  await settlePayoutsForDeletion(db, caller.id, await lessonSettings(db), now);
  return {};
}
