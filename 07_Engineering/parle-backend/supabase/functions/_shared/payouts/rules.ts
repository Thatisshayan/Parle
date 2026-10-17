/** Pure payout rules (spec section 7). No database, no network: unit-tested in tests/payout-rules.test.ts. */
export const HOLD_REASONS = ["dispute", "tutor_no_show", "chargeback", "account_not_ready", "transfer_failed"] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

/** The tutor's share: the frozen price minus the frozen commission, rounded half away from zero like SQL round(). */
export function payoutCents(priceCents: number, commissionPct: number): number {
  return priceCents - Math.round((priceCents * commissionPct) / 100);
}

/** Split: the learner gets refundCents back; the tutor gets their share of what the learner still pays. */
export function splitPayoutCents(paidCents: number, commissionPct: number, refundCents: number): number {
  return payoutCents(paidCents - refundCents, commissionPct);
}

/** After a payout, a refund takes back the tutor's proportional share, never more than is still with the tutor. */
export function reversalCents(i: { refundCents: number; payoutCents: number; priceCents: number; alreadyReversed: number }): number {
  if (i.priceCents <= 0) return 0;
  return Math.max(0, Math.min(i.payoutCents - i.alreadyReversed, Math.round((i.refundCents * i.payoutCents) / i.priceCents)));
}

export type PayoutCountry = { code: string | null; name: string; status: "supported" | "waitlist" | "missing" };
const token = (v: unknown) => (typeof v === "string" ? v.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") : "");

/** The tutor's application country against the payout country list (tutor_payout_country); unknown countries wait. */
export function payoutCountryFor(country: unknown, rows: Array<{ country_name?: unknown; country_code?: unknown; status?: unknown }>): PayoutCountry {
  const wanted = token(country);
  if (!wanted) return { code: null, name: "", status: "missing" };
  const row = rows.find((r) => token(r.country_name) === wanted || token(r.country_code) === wanted);
  const raw = typeof row?.country_code === "string" ? row.country_code.trim().toUpperCase() : "";
  const code = /^[A-Z]{2}$/.test(raw) ? raw : null;
  const name = typeof row?.country_name === "string" && row.country_name.trim() ? row.country_name.trim() : String(country).trim();
  return { code, name, status: row?.status === "supported" && code ? "supported" : "waitlist" };
}

export type AccountState = "none" | "country_missing" | "country_waitlist" | "waitlisted" | "onboarding" | "restricted" | "enabled";

export function accountState(i: {
  account: { stripe_account_id: string | null; payouts_enabled: boolean; details_submitted: boolean; waitlisted_at: string | null } | null;
  countryStatus: PayoutCountry["status"];
}): AccountState {
  const a = i.account;
  if (a?.stripe_account_id) return a.payouts_enabled ? "enabled" : a.details_submitted ? "restricted" : "onboarding";
  if (i.countryStatus === "missing") return "country_missing";
  if (i.countryStatus === "waitlist") return a?.waitlisted_at ? "waitlisted" : "country_waitlist";
  return "none";
}

export type EarningPayout = {
  status: string; amount_cents: number; commission_cents: number; release_at: string; hold_reason: string | null;
  paid_at: string | null; stripe_transfer_id: string | null; reversed_cents: number; transfer_cents?: number | null;
};
export type EarningRow = {
  booking_id: string; start_at: string; minutes: number; status: string; late_cancel: boolean; price_cents: number;
  commission_pct: number; learner_name: string; payout: EarningPayout | null;
};
export type EarningState = "upcoming" | "pending" | "held" | "paid" | "cancelled";
export type EarningLine = {
  booking_id: string; start_at: string; minutes: number; learner_name: string; lesson_status: string; late_cancel: boolean;
  price_cents: number; commission_pct: number; commission_cents: number; payout_cents: number; state: EarningState;
  release_at: string | null; paid_at: string | null; hold_reason: string | null; transfer_id: string | null; reversed_cents: number;
  sent_cents: number | null;
};
export type MonthTotal = { month: string; lessons: number; earned_cents: number; paid_cents: number };

const STATE_OF: Record<string, EarningState> = { scheduled: "pending", held: "held", paid: "paid", cancelled: "cancelled" };
const iso = (v: string) => new Date(v).toISOString();

/** "2026-10" for an instant, in the tutor's time zone. */
export function monthKey(isoValue: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(isoValue));
  const f = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${f.year}-${f.month}`;
}

/** The Earnings page (spec section 7): one line per lesson with its breakdown, and totals per month. */
export function earningsView(rows: EarningRow[], timeZone: string): { lines: EarningLine[]; months: MonthTotal[] } {
  const lines: EarningLine[] = [];
  for (const r of rows) {
    const p = r.payout;
    if (!p && r.status !== "confirmed") continue; // cancelled or refunded lessons without a payout earn nothing
    const pct = Number(r.commission_pct);
    const estimate = payoutCents(r.price_cents, pct);
    const reversed = p ? Number(p.reversed_cents) || 0 : 0;
    lines.push({
      booking_id: r.booking_id, start_at: iso(r.start_at), minutes: r.minutes, learner_name: r.learner_name, lesson_status: r.status,
      late_cancel: r.late_cancel, price_cents: r.price_cents, commission_pct: pct,
      commission_cents: p ? p.commission_cents : r.price_cents - estimate,
      payout_cents: p ? p.amount_cents - reversed : estimate,
      state: p ? STATE_OF[p.status] ?? "pending" : "upcoming",
      release_at: p ? iso(p.release_at) : null,
      paid_at: p?.paid_at ? iso(p.paid_at) : null,
      hold_reason: p?.status === "held" ? p.hold_reason : null,
      transfer_id: p?.stripe_transfer_id ?? null,
      reversed_cents: reversed,
      // A70 (R78): what Stripe actually sent, when it differs from the share (a payment in another currency, converted)
      sent_cents: p && p.transfer_cents != null && Number(p.transfer_cents) !== p.amount_cents - reversed ? Number(p.transfer_cents) : null,
    });
  }
  lines.sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at));
  const byMonth = new Map<string, MonthTotal>();
  for (const l of lines) {
    if (l.state === "upcoming" || l.state === "cancelled") continue;
    const key = monthKey(l.start_at, timeZone);
    const m = byMonth.get(key) ?? { month: key, lessons: 0, earned_cents: 0, paid_cents: 0 };
    m.lessons++;
    m.earned_cents += l.payout_cents;
    if (l.state === "paid") m.paid_cents += l.payout_cents;
    byMonth.set(key, m);
  }
  return { lines, months: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}

/**
 * Stripe's idempotency key for creating a tutor's Connect account. Stripe replays a refused answer for the same key
 * for 24 hours, so a key per tutor forever would block a retry after a fixable refusal (Plan 7B checks: "Accounts v1
 * support" was off). One key per tutor per UTC hour still turns a double click into one account.
 */
/**
 * Plan 11 (A65, R73): one key per creation attempt. A double click reuses it (one account); a refusal moves the tutor to
 * the next attempt, so a retry is not answered with Stripe's stored refusal and never makes a second account.
 */
/**
 * A101 (R109): Stripe refuses a transfer naming a transfer_group when its source charge already has one (a manual
 * transfer was made from it). Then the transfer goes without ours and is found later by its payout id.
 */
export function transferGroupFor(chargeGroup: string | null | undefined, payoutId: string): string | undefined {
  return chargeGroup ? undefined : `payout-${payoutId}`;
}

export function connectAccountKey(tutorId: string, attempt: number): string {
  return `connect-account:${tutorId}:${attempt}`;
}

/**
 * What a payout transfer sends (decision #55). Lessons are charged in CAD, so the share goes out as is. A lesson paid
 * in another currency settled into Parle's CAD balance: the share is converted at the rate Stripe used for that
 * payment, so Parle neither gains nor loses on the exchange.
 */
export function transferAmount(i: { shareCents: number; chargeCurrency: string; settlementCurrency: string; exchangeRate: number | null }): { currency: string; amountCents: number } {
  if (i.chargeCurrency === i.settlementCurrency) return { currency: i.settlementCurrency, amountCents: i.shareCents };
  if (!(typeof i.exchangeRate === "number" && i.exchangeRate > 0)) throw new Error("exchange rate missing for a converted payment");
  return { currency: i.settlementCurrency, amountCents: Math.round(i.shareCents * i.exchangeRate) };
}
