import { parlePayoutService } from "@/functions";
import type { TranslationKey } from "@/lib/i18n";

export type AccountState = "none" | "country_missing" | "country_waitlist" | "waitlisted" | "onboarding" | "restricted" | "enabled";
export type EarningState = "upcoming" | "pending" | "held" | "paid" | "cancelled";
export type HoldReason = "dispute" | "tutor_no_show" | "chargeback" | "account_not_ready" | "transfer_failed";
export interface EarningLine {
  booking_id: string; start_at: string; minutes: number; learner_name: string; lesson_status: string; late_cancel: boolean;
  price_cents: number; commission_pct: number; commission_cents: number; payout_cents: number; state: EarningState;
  release_at: string | null; paid_at: string | null; hold_reason: HoldReason | null; transfer_id: string | null; reversed_cents: number;
}
export interface MonthTotal { month: string; lessons: number; earned_cents: number; paid_cents: number }
export interface PayoutAccount { state: AccountState; countryName: string; payoutsEnabled: boolean; detailsSubmitted: boolean; waitlistedAt: string | null }
export interface Earnings { timeZone: string; payoutDelayHours: number; account: PayoutAccount; lessons: EarningLine[]; months: MonthTotal[] }

const ACCOUNT_STATES: AccountState[] = ["none", "country_missing", "country_waitlist", "waitlisted", "onboarding", "restricted", "enabled"];
const EARNING_STATES: EarningState[] = ["upcoming", "pending", "held", "paid", "cancelled"];
const HOLD_REASONS: HoldReason[] = ["dispute", "tutor_no_show", "chargeback", "account_not_ready", "transfer_failed"];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
const str = (value: unknown, max = 2000) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const isoOrNull = (value: unknown): string | null => {
  const text = str(value, 40);
  const time = Date.parse(text);
  return text && Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const holdReason = (value: unknown): HoldReason | null => (HOLD_REASONS.includes(value as HoldReason) ? (value as HoldReason) : null);
function safeZone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return "UTC";
  }
}

function safeEarningLine(value: unknown): EarningLine | null {
  if (!isObject(value) || typeof value.booking_id !== "string" || !value.booking_id) return null;
  if (!EARNING_STATES.includes(value.state as EarningState)) return null;
  const start = isoOrNull(value.start_at);
  if (!start) return null;
  return {
    booking_id: str(value.booking_id, 64), start_at: start, minutes: num(value.minutes), learner_name: str(value.learner_name, 80),
    lesson_status: str(value.lesson_status, 30), late_cancel: value.late_cancel === true, price_cents: num(value.price_cents),
    commission_pct: num(value.commission_pct), commission_cents: num(value.commission_cents), payout_cents: num(value.payout_cents),
    state: value.state as EarningState, release_at: isoOrNull(value.release_at), paid_at: isoOrNull(value.paid_at),
    hold_reason: holdReason(value.hold_reason), transfer_id: typeof value.transfer_id === "string" ? value.transfer_id.slice(0, 64) : null,
    reversed_cents: num(value.reversed_cents),
  };
}

export function safeEarnings(value: unknown): Earnings {
  const r = isObject(value) ? value : {};
  const a = isObject(r.account) ? r.account : {};
  return {
    timeZone: safeZone(r.time_zone),
    payoutDelayHours: num(r.payout_delay_hours) || 72,
    account: {
      state: ACCOUNT_STATES.includes(a.state as AccountState) ? (a.state as AccountState) : "none",
      countryName: str(a.country_name, 80), payoutsEnabled: a.payouts_enabled === true, detailsSubmitted: a.details_submitted === true,
      waitlistedAt: isoOrNull(a.waitlisted_at),
    },
    lessons: Array.isArray(r.lessons) ? r.lessons.map(safeEarningLine).filter((l): l is EarningLine => l !== null) : [],
    months: Array.isArray(r.months)
      ? r.months.filter(isObject).filter((m) => /^\d{4}-\d{2}$/.test(str(m.month, 7))).map((m) => ({ month: str(m.month, 7), lessons: num(m.lessons), earned_cents: num(m.earned_cents), paid_cents: num(m.paid_cents) }))
      : [],
  };
}

const time = (value: string | null, fallback: string) => Date.parse(value ?? fallback);
export function groupEarnings(lines: EarningLine[]) {
  const of = (state: EarningState) => lines.filter((l) => l.state === state);
  return {
    upcoming: of("upcoming").sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)),
    pending: of("pending").sort((a, b) => time(a.release_at, a.start_at) - time(b.release_at, b.start_at)),
    held: of("held").sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at)),
    paid: of("paid").sort((a, b) => time(b.paid_at, b.start_at) - time(a.paid_at, a.start_at)),
  };
}

/** Only Stripe's own Connect pages (onboarding, Express dashboard) are opened from Parle. */
export function safeStripeUrl(value: unknown): string {
  const url = str(value, 2000);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "connect.stripe.com" ? url : "";
  } catch {
    return "";
  }
}

/** Calls the payout service; a refusal becomes an Error whose message is the service's code (for payoutErrorKey). */
async function payouts(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const response = await parlePayoutService({ action, ...values });
    return isObject(response) ? response : {};
  } catch (error) {
    const body = isObject(error) && isObject((error as { body?: unknown }).body) ? (error as { body: Record<string, unknown> }).body : {};
    const fromMessage = error instanceof Error ? error.message.match(/API request failed: ([A-Z_]+)/)?.[1] : undefined;
    throw new Error(typeof body.error_code === "string" ? body.error_code : fromMessage ?? "REQUEST_FAILED");
  }
}

export const loadEarnings = async (refresh = false) => safeEarnings(await payouts("tutor_earnings", refresh ? { refresh: true } : {}));
export async function startPayoutSetup(): Promise<string> {
  const url = safeStripeUrl((await payouts("tutor_payout_onboarding")).onboarding_url);
  if (!url) throw new Error("PAYOUT_SETUP_UNAVAILABLE");
  return url;
}
export async function joinPayoutWaitlist(): Promise<void> {
  await payouts("tutor_payout_waitlist");
}
export async function openPayoutDashboard(): Promise<string> {
  const url = safeStripeUrl((await payouts("tutor_payout_dashboard")).dashboard_url);
  if (!url) throw new Error("PAYOUT_SETUP_UNAVAILABLE");
  return url;
}

/** The tutor's share after a split, as the server computes it (frozen commission on what the learner still pays). */
export function splitPayoutCents(paidCents: number, commissionPct: number, refundCents: number): number {
  const rest = paidCents - refundCents;
  return rest - Math.round((rest * commissionPct) / 100);
}

/** Cents from a dollar amount an administrator typed ("12.50"); null unless positive with at most 2 decimals. */
export function centsFromDollars(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return cents > 0 ? cents : null;
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  COUNTRY_MISSING: "payouts.error.countryMissing", PAYOUT_COUNTRY_WAITLIST: "payouts.error.countryWaitlist",
  PAYOUT_COUNTRY_SUPPORTED: "payouts.error.countrySupported", PAYOUT_SETUP_UNAVAILABLE: "payouts.error.setupUnavailable",
  NOT_APPROVED: "payouts.error.notApproved", PAYOUT_ACCOUNT_NOT_READY: "payouts.error.accountNotReady", RATE_LIMITED: "payouts.error.rateLimited",
  PAYOUT_BUSY: "payouts.error.busy", REFUND_UNAVAILABLE: "payouts.error.refundUnavailable", AMOUNT_INVALID: "payouts.error.amountInvalid",
  CHARGEBACK_OPEN: "payouts.error.chargebackOpen", NOT_PAID: "payouts.error.notPaid", CHOICE_REQUIRED: "payouts.error.choiceRequired",
  PAYOUT_ACTION_UNAVAILABLE: "payouts.error.actionUnavailable",
};
export function payoutErrorKey(code: string): TranslationKey {
  return ERROR_KEYS[code] ?? "payouts.error.generic";
}
