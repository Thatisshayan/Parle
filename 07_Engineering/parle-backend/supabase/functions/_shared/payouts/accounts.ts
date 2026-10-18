import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonContext } from "../lessons/actions.ts";
import { PaymentsUnavailable, type ConnectAccount } from "../lessons/payments.ts";
import { LessonError } from "../lessons/errors.ts";
import { allowedOrigins } from "../cors.ts";
import { takeRateLimit } from "../rate-limit.ts";
import { payoutCountryFor, type PayoutCountry } from "./rules.ts";
import { auditPayout } from "./audit.ts";

export type PayoutAccountRow = {
  tutor_id: string; stripe_account_id: string | null; payouts_enabled: boolean; details_submitted: boolean; disabled_reason: string;
  country: string | null; waitlisted_at: string | null; tutor_deleted_at: string | null; connect_attempt?: number;
};
const COLUMNS = "tutor_id, stripe_account_id, payouts_enabled, details_submitted, disabled_reason, country, waitlisted_at, tutor_deleted_at, connect_attempt";

/** Booking opens only for a tutor whose Stripe account can receive payouts (spec section 4, "Who can book"). */
export async function tutorCanReceivePayouts(db: SupabaseClient, tutorId: string): Promise<boolean> {
  const { data, error } = await db.from("tutor_payout_account").select("stripe_account_id, payouts_enabled, tutor_deleted_at").eq("tutor_id", tutorId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.stripe_account_id && data.payouts_enabled === true && !data.tutor_deleted_at);
}

export async function loadAccount(db: SupabaseClient, tutorId: string): Promise<PayoutAccountRow | null> {
  const { data, error } = await db.from("tutor_payout_account").select(COLUMNS).eq("tutor_id", tutorId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PayoutAccountRow | null) ?? null;
}

/** The country on the tutor's application, against the administrators' payout country list. */
export async function tutorCountry(db: SupabaseClient, tutorId: string): Promise<PayoutCountry> {
  const [{ data: profiles }, { data: rows }] = await Promise.all([
    db.from("tutor_profile").select("country").eq("user_id", tutorId).order("created_at").limit(1),
    db.from("tutor_payout_country").select("country_name, country_code, status").limit(300),
  ]);
  return payoutCountryFor(profiles?.[0]?.country, rows ?? []);
}

const tutorOnly = (ctx: LessonContext) => {
  if (ctx.caller.role !== "tutor") throw new LessonError("TUTOR_ONLY", 403, "Tutors only.");
};
const UNAVAILABLE = () => new LessonError("PAYOUT_SETUP_UNAVAILABLE", 503, "Stripe could not start your payout setup. Please try again.");

async function approvedListing(db: SupabaseClient, tutorId: string): Promise<boolean> {
  const { data, error } = await db.from("tutor_public_profile").select("profile_id").eq("tutor_user_id", tutorId).eq("is_published", true).limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

/**
 * Stripe's latest word on an account (account.updated, or the tutor's return from onboarding). When the account can
 * receive payouts, payouts held only for that reason are released, audited as the system (design choice 6).
 */
export async function applyAccountUpdate(db: SupabaseClient, a: ConnectAccount, now: Date): Promise<{ tutorId: string; enabled: boolean; released: number } | null> {
  const { data: before, error: readError } = await db.from("tutor_payout_account").select("tutor_id, tutor_deleted_at").eq("stripe_account_id", a.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) return null; // not a Parle tutor's account
  const country = !before.tutor_deleted_at && /^[A-Z]{2}$/.test(a.country) ? { country: a.country } : {};
  const { error } = await db.from("tutor_payout_account").update({
    payouts_enabled: a.payoutsEnabled, details_submitted: a.detailsSubmitted, disabled_reason: a.disabledReason, ...country, updated_at: now.toISOString(),
  }).eq("tutor_id", before.tutor_id);
  if (error) throw new Error(error.message);
  let released = 0;
  if (a.payoutsEnabled) {
    const { data: freed, error: freeError } = await db.from("payout").update({ status: "scheduled", hold_reason: null, held_at: null, updated_at: now.toISOString() })
      .eq("tutor_id", before.tutor_id).eq("status", "held").eq("hold_reason", "account_not_ready").is("decision", null).select("id");
    if (freeError) throw new Error(freeError.message);
    for (const p of freed ?? []) {
      await auditPayout(db, { actorId: null, actorLabel: "system", action: "payout.auto_release", payoutId: p.id, oldValue: "held: account_not_ready", newValue: "scheduled: the payout account can receive payouts again", now });
    }
    released = (freed ?? []).length;
  }
  return { tutorId: before.tutor_id, enabled: a.payoutsEnabled, released };
}

/** "Set up payouts" (spec section 7): one Express account per tutor, then Stripe's own onboarding (identity included, #25). */
export async function startOnboarding(ctx: LessonContext): Promise<Record<string, unknown>> {
  tutorOnly(ctx);
  const { db, caller, payments, now } = ctx;
  if (!(await approvedListing(db, caller.id))) throw new LessonError("NOT_APPROVED", 403, "Payouts open once your tutor profile is approved.");
  if (!allowedOrigins().includes(ctx.origin)) throw new LessonError("ORIGIN_NOT_ALLOWED", 400, "Open Parle from its usual address and try again.");
  if (!(await takeRateLimit(db, `connect:${caller.id}`, 3600, 20))) throw new LessonError("RATE_LIMITED", 429, "Too many attempts. Please try again in an hour.");
  let account = await loadAccount(db, caller.id);
  if (!account?.stripe_account_id) {
    const country = await tutorCountry(db, caller.id);
    if (country.status === "missing") throw new LessonError("COUNTRY_MISSING", 409, "Add your country to your tutor application first.");
    if (country.status === "waitlist") throw new LessonError("PAYOUT_COUNTRY_WAITLIST", 409, `Stripe cannot pay tutors in ${country.name} yet. Join the waitlist and we will let you know when payouts open there.`);
    let created: ConnectAccount;
    try {
      const platform = await payments.platformCountry();
      created = await payments.createConnectAccount({ tutorId: caller.id, email: caller.email, country: country.code!, recipient: country.code !== platform, attempt: account?.connect_attempt ?? 0 });
    } catch (e) {
      console.warn("Connect account could not be created", e instanceof Error ? e.name : "unknown");
      // a refusal moves the next try to a new attempt key (A65); a timeout or a 5xx keeps the key, so Stripe replays an
      // account it made before the answer was lost (R124). A failure to count only means the next try may be refused again.
      if (e instanceof PaymentsUnavailable && e.refused) {
        const counted = await db.rpc("payout_account_connect_failed", { p_tutor: caller.id });
        if (counted.error) console.warn("connect attempt not counted", "database_error");
      }
      throw UNAVAILABLE();
    }
    // insert-if-absent: an account id already stored is never replaced by a second account (A65)
    const { error } = await db.rpc("payout_account_link", {
      p_tutor: caller.id, p_account: created.id, p_country: /^[A-Z]{2}$/.test(created.country) ? created.country : country.code,
      p_enabled: created.payoutsEnabled, p_submitted: created.detailsSubmitted, p_reason: created.disabledReason,
    });
    if (error) throw new Error(error.message);
    account = await loadAccount(db, caller.id);
  }
  try {
    const url = await payments.onboardingLink({
      accountId: account!.stripe_account_id!, refreshUrl: `${ctx.origin}/tutor/earnings?connect=refresh`, returnUrl: `${ctx.origin}/tutor/earnings?connect=return`,
    });
    return { onboarding_url: url };
  } catch (e) {
    console.warn("Connect onboarding link failed", e instanceof Error ? e.name : "unknown");
    throw UNAVAILABLE();
  }
}

/** Tutors in a country Stripe cannot pay join a waitlist (spec section 7); their profile stays approved, not bookable. */
export async function joinWaitlist(ctx: LessonContext): Promise<Record<string, unknown>> {
  tutorOnly(ctx);
  const country = await tutorCountry(ctx.db, ctx.caller.id);
  if (country.status === "missing") throw new LessonError("COUNTRY_MISSING", 409, "Add your country to your tutor application first.");
  const existing = await loadAccount(ctx.db, ctx.caller.id);
  if (country.status !== "waitlist" || existing?.stripe_account_id) throw new LessonError("PAYOUT_COUNTRY_SUPPORTED", 409, "Payouts are available in your country: set up payouts instead.");
  const at = existing?.waitlisted_at ?? ctx.now.toISOString();
  const { error } = await ctx.db.from("tutor_payout_account").upsert({ tutor_id: ctx.caller.id, country: country.code, waitlisted_at: at, updated_at: ctx.now.toISOString() }, { onConflict: "tutor_id" });
  if (error) throw new Error(error.message);
  return { waitlisted_at: new Date(at).toISOString() };
}

/** Stripe's Express dashboard for the tutor (payout schedule, bank details, tax forms later). */
export async function dashboardLink(ctx: LessonContext): Promise<Record<string, unknown>> {
  tutorOnly(ctx);
  const account = await loadAccount(ctx.db, ctx.caller.id);
  if (!account?.stripe_account_id || !account.details_submitted) throw new LessonError("PAYOUT_ACCOUNT_NOT_READY", 409, "Finish your payout setup first.");
  try {
    return { dashboard_url: await ctx.payments.dashboardLink(account.stripe_account_id) };
  } catch (e) {
    console.warn("Stripe dashboard link failed", e instanceof Error ? e.name : "unknown");
    throw UNAVAILABLE();
  }
}
