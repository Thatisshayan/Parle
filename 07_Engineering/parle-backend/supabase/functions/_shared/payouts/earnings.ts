import type { LessonContext } from "../lessons/actions.ts";
import { LessonError } from "../lessons/errors.ts";
import { lessonSettings } from "../lessons/settings.ts";
import { person, tutorInfo } from "../lessons/store.ts";
import { accountState, earningsView, type EarningPayout } from "./rules.ts";
import { applyAccountUpdate, loadAccount, tutorCountry } from "./accounts.ts";

const STATUSES = ["confirmed", "completed", "learner_no_show", "disputed", "cancelled_learner"];
const isoOrNull = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);

/** The Earnings page (spec section 7): the payout account, every lesson's share and state, and monthly totals. */
export async function tutorEarnings(ctx: LessonContext): Promise<Record<string, unknown>> {
  if (ctx.caller.role !== "tutor") throw new LessonError("TUTOR_ONLY", 403, "Tutors only.");
  let account = await loadAccount(ctx.db, ctx.caller.id);
  if (ctx.body.refresh === true && account?.stripe_account_id) {
    // back from Stripe's onboarding: ask Stripe now rather than wait for account.updated
    try {
      await applyAccountUpdate(ctx.db, await ctx.payments.getConnectAccount(account.stripe_account_id), ctx.now);
      account = await loadAccount(ctx.db, ctx.caller.id);
    } catch (e) {
      console.warn("payout account refresh failed; account.updated will update it", e instanceof Error ? e.name : "unknown");
    }
  }
  const [country, settings, me] = await Promise.all([tutorCountry(ctx.db, ctx.caller.id), lessonSettings(ctx.db), tutorInfo(ctx.db, ctx.caller.id)]);
  const { data, error } = await ctx.db.from("booking").select("id, start_at, minutes, status, late_cancel, price_cents, commission_pct, learner_id")
    .eq("tutor_id", ctx.caller.id).in("status", STATUSES).order("start_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const bookings = (data ?? []) as Array<{ id: string; start_at: string; minutes: number; status: string; late_cancel: boolean; price_cents: number; commission_pct: number; learner_id: string | null }>;
  const payouts = new Map<string, EarningPayout>();
  for (let i = 0; i < bookings.length; i += 200) {
    const { data: rows, error: payoutError } = await ctx.db.from("payout")
      .select("booking_id, status, amount_cents, commission_cents, release_at, hold_reason, paid_at, stripe_transfer_id, reversed_cents, transfer_cents")
      .in("booking_id", bookings.slice(i, i + 200).map((b) => b.id));
    if (payoutError) throw new Error(payoutError.message);
    for (const p of rows ?? []) payouts.set(p.booking_id, p as EarningPayout);
  }
  const names = new Map<string, string>();
  for (const id of new Set(bookings.map((b) => b.learner_id).filter((v): v is string => Boolean(v)))) {
    names.set(id, (await person(ctx.db, id))?.firstName || "Learner");
  }
  const zone = me?.timeZone ?? "UTC";
  const view = earningsView(bookings.map((b) => ({
    booking_id: b.id, start_at: b.start_at, minutes: b.minutes, status: b.status, late_cancel: b.late_cancel, price_cents: b.price_cents,
    commission_pct: Number(b.commission_pct), learner_name: b.learner_id ? names.get(b.learner_id) ?? "Learner" : "Former learner",
    payout: payouts.get(b.id) ?? null,
  })), zone);
  return {
    time_zone: zone,
    payout_delay_hours: settings.payout_delay_hours,
    account: {
      state: accountState({ account, countryStatus: country.status }),
      country: account?.country ?? country.code, country_name: country.name,
      payouts_enabled: account?.payouts_enabled === true, details_submitted: account?.details_submitted === true,
      waitlisted_at: isoOrNull(account?.waitlisted_at),
    },
    lessons: view.lines,
    months: view.months,
  };
}
