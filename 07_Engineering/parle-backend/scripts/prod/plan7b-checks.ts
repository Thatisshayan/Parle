import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, newLearner, removeLearner, type Learner } from "./check-learners";
import { waitForMail } from "../buildy/agentmail";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { generateBookableSlots } from "../../../parle-app/functions/parle-booking-slots.helper.ts";

/**
 * Plan 7B checks on production in Stripe test mode: m5tut1's Connect onboarding, then two lessons with a check learner:
 * c is paid by the jobs after a shortened payout delay; d is held by a problem report and released by an administrator.
 * Ids, the onboarding page and Checkout pages stay in the secrets folder; outcomes are printed as yes/no and amounts.
 * usage: bun scripts/prod/plan7b-checks.ts <account|connect-start|connect-status|legacy|book|status|finish-c|paid-c|finish-d|alerts|paid-d|delete>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const STATE = `${SECRETS_DIR}/plan7b-check-state.json`;
type State = { learner?: Learner; c?: string; d?: string; checkout?: Record<string, string>; onboarding?: string; since?: string };
const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const passwords = () => JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
const hoursAhead = (iso: string) => (Date.parse(iso) - Date.now()) / 3_600_000;

async function signIn(email: string, password: string): Promise<{ token: string; id: string }> {
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email.split("@")[0]}`);
  return { token: data.session.access_token, id: data.user.id };
}
async function call(fnName: string, token: string, action: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`${PROD_URL}/functions/v1/${fnName}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: await anonKey(), "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ action, ...body }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const lessonCall = (token: string, action: string, body: Record<string, unknown> = {}) => call("parle-lesson-service", token, action, body);
const payoutCall = (token: string, action: string, body: Record<string, unknown> = {}) => call("parle-payout-service", token, action, body);
const tutor = () => signIn(TUTOR, passwords()[TUTOR]);
async function learnerToken(s: State) {
  if (!s.learner) throw new Error("run book first");
  return (await signIn(s.learner.email, s.learner.password)).token;
}
const service = async () => createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });
async function payout(bookingId: string) {
  const { data } = await (await service()).from("payout").select("id, status, hold_reason, amount_cents, commission_cents, release_at, stripe_transfer_id, transfer_attempt").eq("booking_id", bookingId).maybeSingle();
  return data;
}
function stripeTest(): Stripe {
  const key = readSecret("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_")) throw new Error("the Stripe key is not a test key: stopping");
  return new Stripe(key, { apiVersion: "2023-10-16" });
}

async function m5ProfileId(): Promise<string> {
  const { id } = await tutor();
  const { data } = await (await service()).from("tutor_public_profile").select("profile_id").eq("tutor_user_id", id).eq("is_published", true).limit(1);
  if (!data?.[0]) throw new Error("m5tut1 has no published listing");
  return data[0].profile_id;
}

async function pickSlot(token: string, profileId: string, minHours: number) {
  const options = (await lessonCall(token, "booking_options", { tutor_profile_id: profileId })).body;
  if (!options.can_book) throw new Error(`booking not open: ${options.reason ?? options.error_code}`);
  const listing = await fn("parle-marketplace-service", token, { action: "learner_get_tutor", profile_id: profileId });
  const lengths: number[] = options.offered_lengths;
  const slots = generateBookableSlots({ ...listing.body.tutor.booking_schedule, busy_intervals: options.busy_intervals },
    { now: Date.now(), windowDays: options.horizon_days, minimumNoticeHours: options.minimum_notice_hours, lengths });
  const shortest = Math.min(...lengths);
  return slots.find((slot) => slot.durationMinutes === shortest && hoursAhead(slot.startUtc) >= minHours) ?? null;
}

async function bookOne(s: State, key: "c" | "d", message: string) {
  const token = await learnerToken(s);
  const profileId = await m5ProfileId();
  const slot = await pickSlot(token, profileId, 13);
  if (!slot) { console.log(`${key}: no m5tut1 time 13 h or more ahead; add availability as m5tut1 and run again`); return; }
  const r = await lessonCall(token, "book_lesson", { tutor_profile_id: profileId, start_utc: slot.startUtc, minutes: slot.durationMinutes, message });
  console.log(`${key}: book_lesson ${r.status} ${r.body.error_code ?? ""}; ${slot.durationMinutes} min, ${hoursAhead(slot.startUtc).toFixed(1)} h ahead; Checkout page ${r.body.checkout_url ? "opened" : "missing"}`);
  if (r.status !== 200) return;
  s[key] = r.body.booking_id;
  s.checkout = { ...(s.checkout ?? {}), [key]: r.body.checkout_url };
  save(s);
}

async function finish(key: "c" | "d") {
  const s = load();
  const { token } = await tutor();
  const marked = await lessonCall(token, "mark_attendance", { booking_id: s[key], outcome: "completed" });
  console.log(`finish-${key}: attendance ${marked.status} ${marked.body.error_code ?? marked.body.lesson?.status}`);
  const p = await payout(s[key]!);
  console.log(`finish-${key}: payout ${p?.status ?? "missing"}; ${p?.amount_cents} cents to the tutor, ${p?.commission_cents} to Parle; due in ${p ? hoursAhead(p.release_at).toFixed(2) : "-"} h`);
}

async function paid(key: "c" | "d") {
  const s = load();
  const p = await payout(s[key]!);
  console.log(`paid-${key}: payout ${p?.status}; hold ${p?.hold_reason ?? "none"}; transfer recorded: ${Boolean(p?.stripe_transfer_id)}; attempt ${p?.transfer_attempt}`);
  if (!p?.stripe_transfer_id) return;
  const { id } = await tutor();
  const { data: account } = await (await service()).from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", id).single();
  const transfer = await stripeTest().transfers.retrieve(p.stripe_transfer_id);
  console.log(`paid-${key}: Stripe transfer to m5tut1's account: ${transfer.destination === account?.stripe_account_id}; amount equals the payout: ${transfer.amount === p.amount_cents}; from the lesson's charge: ${Boolean(transfer.source_transaction)}; group matches: ${transfer.transfer_group === `payout-${p.id}`}`);
}

const steps: Record<string, () => Promise<void>> = {
  account: async () => {
    const { token, id } = await tutor();
    const r = await payoutCall(token, "tutor_earnings");
    console.log(`account: earnings ${r.status}; state ${r.body.account?.state}; country "${r.body.account?.country_name}"; payout delay ${r.body.payout_delay_hours} h`);
    const { data } = await (await service()).from("tutor_payout_account").select("payouts_enabled, details_submitted").eq("tutor_id", id).maybeSingle();
    console.log(`account: stored ${data ? JSON.stringify(data) : "no row yet"}`);
  },
  "connect-start": async () => {
    const s = load();
    const { token } = await tutor();
    s.since = new Date(Date.now() - 5_000).toISOString();
    const r = await payoutCall(token, "tutor_payout_onboarding");
    console.log(`connect-start: ${r.status} ${r.body.error_code ?? ""}; onboarding page ${String(r.body.onboarding_url ?? "").startsWith("https://connect.stripe.com/") ? "received (saved, not printed)" : "missing"}`);
    if (r.status === 200) { s.onboarding = r.body.onboarding_url; save(s); }
  },
  "connect-status": async () => {
    const s = load();
    const { token } = await tutor();
    const r = await payoutCall(token, "tutor_earnings", { refresh: true });
    console.log(`connect-status: state ${r.body.account?.state}; payouts enabled ${r.body.account?.payouts_enabled}; details submitted ${r.body.account?.details_submitted}`);
    const { count } = await (await service()).from("stripe_event").select("id", { count: "exact", head: true }).eq("type", "account.updated").gte("processed_at", s.since ?? new Date(0).toISOString());
    console.log(`connect-status: account.updated events recorded since connect-start: ${count ?? 0} (0 means the second destination or its secret is not working yet)`);
  },
  legacy: async () => {
    const { id } = await tutor();
    const { data } = await (await service()).from("payout").select("status, hold_reason, amount_cents, release_at, created_at").eq("tutor_id", id).order("created_at");
    console.log(`legacy: m5tut1 payouts ${JSON.stringify((data ?? []).map((p: any) => ({ status: p.status, hold: p.hold_reason, cents: p.amount_cents, due_in_h: Number(hoursAhead(p.release_at).toFixed(1)) })))}`);
  },
  book: async () => {
    const s = load();
    if (!s.learner) { s.learner = await newLearner("po", "A2", "English", false, "p7b"); save(s); }
    await bookOne(s, "c", "Plan 7B check: lesson C.");
    await bookOne(load(), "d", "Plan 7B check: lesson D.");
  },
  status: async () => {
    const s = load();
    const token = await learnerToken(s);
    for (const key of ["c", "d"] as const) {
      const lesson = (await lessonCall(token, "lesson_status", { booking_id: s[key] })).body.lesson;
      console.log(`${key}: status ${lesson?.status}; starts in ${lesson ? hoursAhead(lesson.start_at).toFixed(1) : "-"} h; ends in ${lesson ? hoursAhead(lesson.end_at).toFixed(1) : "-"} h`);
    }
  },
  "finish-c": () => finish("c"),
  "paid-c": () => paid("c"),
  "finish-d": async () => {
    await finish("d");
    const s = load();
    s.since = new Date(Date.now() - 5_000).toISOString();
    save(s);
    const r = await lessonCall(await learnerToken(s), "report_problem", { booking_id: s.d, kind: "other", details: "Plan 7B check: the audio kept cutting out." });
    console.log(`finish-d: report ${r.status} ${r.body.error_code ?? r.body.lesson?.status}`);
    const p = await payout(s.d!);
    console.log(`finish-d: payout ${p?.status}; hold ${p?.hold_reason}`);
  },
  alerts: async () => {
    const s = load();
    const mail = await waitForMail(ADMIN, s.since!, 240_000);
    console.log(mail ? `alerts: administrator mail "${mail.subject}"; links to the Payouts screen: ${mail.text.includes("/admin/payouts")}` : "alerts: NOT received within 4 minutes");
  },
  "paid-d": async () => {
    await paid("d");
    const s = load();
    const p = await payout(s.d!);
    const { data } = await (await service()).from("admin_audit_log").select("action, actor_label").eq("target_id", p?.id ?? "");
    console.log(`paid-d: audit ${JSON.stringify((data ?? []).map((a: any) => a.action))}; lesson ${(await lessonCall(await learnerToken(s), "lesson_status", { booking_id: s.d })).body.lesson?.status}`);
  },
  delete: async () => {
    const s = load();
    if (!s.learner) { console.log("delete: no check learner"); return; }
    s.learner.token = await learnerToken(s);
    await removeLearner(s.learner);
    const { data } = await (await service()).from("payout").select("status").in("booking_id", [s.c, s.d].filter(Boolean) as string[]);
    console.log(`delete: the check learner is gone; the payouts stay ${JSON.stringify((data ?? []).map((p: any) => p.status))}`);
  },
};

const which = process.argv[2] ?? "";
if (!steps[which]) throw new Error(`usage: bun scripts/prod/plan7b-checks.ts <${Object.keys(steps).join("|")}>`);
await steps[which]();
