import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { LOCAL_URL, localKeys } from "./local";
import { makeUser } from "./users";
import { callFunction, functionsEnv } from "./functions-env";
import { onboardedLearner } from "./learners";

export const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
export const ORIGIN = "http://127.0.0.1:5173"; // in the local APP_ORIGINS
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

/** An approved tutor with a published listing, open every day 00:00-23:45 UTC. */
export async function bookableTutor(opts: { hourlyRateCents?: number; bufferMinutes?: 0 | 10 | 15; meetingLink?: string; lengths?: number[]; foundingUntil?: string | null; payouts?: boolean; country?: string } = {}) {
  const tutor = await makeUser("tutor");
  const db = service();
  const rate = opts.hourlyRateCents ?? 4000;
  const profileId = crypto.randomUUID();
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  must(await db.from("ParleIdentity").insert({ owner_id: tutor.id, created_by: tutor.email, role: "tutor", age_confirmed: true }));
  must(await db.from("tutor_profile").insert({ id: profileId, owner_id: tutor.id, created_by: tutor.email, user_id: tutor.id, display_name: "Camille T.", time_zone: "UTC", meeting_link: opts.meetingLink ?? "https://meet.google.com/abc-defg-hij", hourly_rate_cents: rate, application_intent: "submitted", founding_until: opts.foundingUntil ?? null, country: opts.country ?? "Canada" }));
  const settings = { lesson_lengths_minutes: opts.lengths ?? [30, 45, 60], buffer_minutes: opts.bufferMinutes ?? 0, minimum_notice_hours: 12, booking_window_days: 30 };
  const rules = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day_of_week: day, start_local: "00:00", end_local: "23:45", time_zone: "UTC" }));
  must(await db.from("tutor_public_profile").insert({ owner_id: tutor.id, created_by: tutor.email, profile_id: profileId, tutor_user_id: tutor.id, display_name: "Camille T.", hourly_rate_cents: rate, is_published: true, booking_schedule_json: JSON.stringify({ rules, exceptions: [], settings, busy_intervals: [] }) }));
  // From Plan 7B a tutor can be booked only when their payout account can receive payouts (require_payout_account).
  if (opts.payouts !== false) {
    must(await db.from("tutor_payout_account").insert({ tutor_id: tutor.id, stripe_account_id: `acct_test_seed_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, payouts_enabled: true, details_submitted: true, country: "CA" }));
  }
  return { tutor, profileId, token: await tokenOf(tutor) };
}

export async function learner() {
  const { u, t } = await onboardedLearner();
  return { u, t };
}

/** A UTC start on the 15-minute grid, `days` ahead. */
export function slotAt(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const lesson = (t: string, action: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  callFunction("parle-lesson-service", t, { action, ...body }, { Origin: ORIGIN, ...headers });

export const book = (t: string, profileId: string, start: string, minutes = 60, message = "", headers: Record<string, string> = {}) =>
  lesson(t, "book_lesson", { tutor_profile_id: profileId, start_utc: start, minutes, message }, headers);

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2023-10-16" });

/** A Stripe event signed with the local webhook secret; with `account` it is a connected account's event, signed with the Connect secret. */
export async function sendEvent(type: string, object: Record<string, unknown>, id = `evt_${crypto.randomUUID().replaceAll("-", "")}`, opts: { account?: string; secret?: string } = {}) {
  const body = JSON.stringify({ id, object: "event", type, livemode: false, ...(opts.account ? { account: opts.account } : {}), data: { object } });
  const secret = opts.secret ?? (opts.account ? functionsEnv().STRIPE_CONNECT_WEBHOOK_SECRET : functionsEnv().STRIPE_WEBHOOK_SECRET);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  const r = await fetch(`${LOCAL_URL}/functions/v1/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any, id };
}
/** Where payout alerts go locally (ADMIN_ALERT_EMAIL in setup-local-functions-env.ts). */
export const ADMIN_ALERTS = "payout-alerts@example.test";

/** Pays the fake Checkout page the way Stripe would, then sends checkout.session.completed (unless `silent`). */
export async function pay(bookingId: string, opts: { eventId?: string; amount?: number; silent?: boolean } = {}) {
  const db = service();
  const { data: b } = await db.from("booking").select("stripe_checkout_session_id, price_cents").eq("id", bookingId).single();
  const sessionId = b!.stripe_checkout_session_id as string;
  const pi = `pi_fake_${crypto.randomUUID().replaceAll("-", "")}`;
  const { data: row } = await db.from("stripe_test_object").select("data").eq("id", sessionId).single();
  const amount = opts.amount ?? (b!.price_cents as number);
  await db.from("stripe_test_object").update({ data: { ...row!.data, status: "complete", payment_status: "paid", payment_intent: pi, amount_total: amount } }).eq("id", sessionId);
  const object = { id: sessionId, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", amount_total: amount, currency: "usd", payment_intent: pi, metadata: { kind: "lesson", booking_id: bookingId } };
  if (opts.silent) return { status: 0, body: {} as any, id: "", pi, object };
  const sent = await sendEvent("checkout.session.completed", object, opts.eventId);
  return { ...sent, pi, object };
}

export async function bookAndPay(t: string, profileId: string, start: string, minutes = 60) {
  const r = await book(t, profileId, start, minutes);
  if (r.status !== 200) throw new Error(`book_lesson ${r.status} ${r.body.error_code}`);
  const paid = await pay(r.body.booking_id);
  if (paid.status !== 200) throw new Error(`webhook ${paid.status}`);
  return { bookingId: r.body.booking_id as string, pi: paid.pi };
}

/** A confirmed, paid lesson at any time (for rules that depend on how soon the lesson is). */
export async function seedConfirmed(o: { learnerId: string; tutorId: string; profileId: string; start: string; minutes?: number; price?: number; bookedAt?: string; status?: string }) {
  const db = service();
  const minutes = o.minutes ?? 60;
  const { data, error } = await db.from("booking").insert({
    learner_id: o.learnerId, tutor_id: o.tutorId, tutor_profile_id: o.profileId, start_at: o.start,
    end_at: new Date(Date.parse(o.start) + minutes * 60_000).toISOString(), minutes, price_cents: o.price ?? 4000, commission_pct: 20,
    status: o.status ?? "confirmed", booked_at: o.bookedAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString(),
    stripe_checkout_session_id: `cs_test_seed_${crypto.randomUUID().replaceAll("-", "")}`, confirmation_sent_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  const pi = `pi_fake_${crypto.randomUUID().replaceAll("-", "")}`;
  const p = await db.from("payment").insert({ booking_id: data!.id, stripe_payment_intent_id: pi, stripe_checkout_session_id: "cs_seed", amount_cents: o.price ?? 4000, status: "succeeded" });
  if (p.error) throw new Error(p.error.message);
  return { bookingId: data!.id as string, pi };
}

export const refundCount = async (pi: string) =>
  ((await service().from("stripe_test_object").select("id").eq("kind", "refund").eq("data->>payment_intent", pi)).data ?? []).length;
export const failNext = async (operation: "checkout" | "refund" | "refund_refused" | "account_refused" | "account_idempotency" | "expire" | "retrieve" | "account" | "account_link" | "transfer" | "transfer_lost" | "reversal") => {
  const { error } = await service().from("stripe_test_fail").insert({ operation });
  if (error) throw new Error(error.message);
};
export const runJobs = () => callFunction("parle-booking-jobs", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
/** Holds left by earlier runs would fill the jobs' batches: expire the lapsed ones first. */
export const clearLapsedHolds = () => service().from("booking").update({ status: "expired" }).eq("status", "pending_payment").lt("hold_expires_at", new Date().toISOString());

/** Schedules a lesson's payout (`payout_schedule`); delay 0 makes it due at once. */
export const schedulePayout = (bookingId: string, delayHours = 72) => service().rpc("payout_schedule", { p_booking: bookingId, p_delay_hours: delayHours });
export async function payoutOf(bookingId: string): Promise<any> {
  const { data, error } = await service().from("payout").select("*").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
/**
 * Payouts left due by other tests would fill the jobs' batch of 20: push every other due payout a month out. Held ones
 * too, since the jobs release account_not_ready holds whose account is ready (Plan 11, A60) and would then send them.
 */
export const onlyTheseDue = (payoutIds: string[]) => service().from("payout").update({ release_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
  .in("status", ["scheduled", "held"]).lte("release_at", new Date().toISOString()).not("id", "in", `(${payoutIds.join(",")})`);
/** Fake-Stripe failures queued by a red run would be consumed by the next green run (7A ledger, Task 4). */
export const clearFakeFailures = () => service().from("stripe_test_fail").delete().not("id", "is", null);

export const payoutAction = (t: string, action: string, body: Record<string, unknown> = {}) =>
  callFunction("parle-payout-service", t, { action, ...body }, { Origin: ORIGIN });
/** A payout country row (the admin's list on the Applications page); it has no unique key, so update or insert. */
export async function ensurePayoutCountry(name: string, code: string, status: "supported" | "waitlist") {
  const db = service();
  const { data } = await db.from("tutor_payout_country").select("id").eq("country_code", code).limit(1);
  const r = data?.[0]
    ? await db.from("tutor_payout_country").update({ country_name: name, status }).eq("country_code", code)
    : await db.from("tutor_payout_country").insert({ country_name: name, country_code: code, status });
  if (r.error) throw new Error(r.error.message);
}
/** Changes a fake Connect account the way Stripe does after onboarding (payouts_enabled, details_submitted, ...). */
export async function setFakeAccount(accountId: string, patch: Record<string, unknown>) {
  const db = service();
  const { data, error } = await db.from("stripe_test_object").select("data").eq("id", accountId).single();
  if (error) throw new Error(error.message);
  const r = await db.from("stripe_test_object").update({ data: { ...(data!.data as Record<string, unknown>), ...patch } }).eq("id", accountId);
  if (r.error) throw new Error(r.error.message);
}
export const fakeTransfers = async (payoutId: string) =>
  ((await service().from("stripe_test_object").select("id").eq("kind", "transfer").eq("data->>payout_id", payoutId)).data ?? []).length;
export async function adminToken() {
  const a = await makeUser("admin");
  return (await a.client.auth.getSession()).data.session!.access_token;
}
