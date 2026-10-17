import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, newLearner, removeLearner, type Learner } from "./check-learners";
import { SECRETS_DIR } from "../lib/secrets";
import { generateBookableSlots } from "../../../parle-app/functions/parle-booking-slots.helper.ts";

/**
 * Plan 11 checks on production in Stripe test mode, with an AgentMail learner (obsidianteamhq+p11...) and m5tut1:
 * A51 (Book pressed twice at once: one hold, no "just taken") and A53 (learner and tutor cancelling at once: one refund,
 * no error). The learner's password, booking id and Checkout page stay in the secrets folder; outcomes only.
 * Pay between book and cancel-both: CHECK_STATE=<this state file> npx tsx scripts/prod/plan7a-preview-checks.ts pay a
 * usage: bun scripts/prod/plan11-checks.ts <book|status|cancel-both|delete>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
export const STATE = `${SECRETS_DIR}/plan11-check-state.json`;
type State = { learner?: Learner; a?: string; checkout?: Record<string, string> };
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
async function lessonCall(token: string, action: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`${PROD_URL}/functions/v1/parle-lesson-service`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: await anonKey(), "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ action, ...body }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const tutor = () => signIn(TUTOR, passwords()[TUTOR]);
async function learnerToken(s: State) {
  if (!s.learner) throw new Error("run book first");
  return (await signIn(s.learner.email, s.learner.password)).token;
}
const service = async () => createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });

async function m5ProfileId(): Promise<string> {
  const { id } = await tutor();
  const { data } = await (await service()).from("tutor_public_profile").select("profile_id").eq("tutor_user_id", id).eq("is_published", true).limit(1);
  if (!data?.[0]) throw new Error("m5tut1 has no published listing");
  return data[0].profile_id;
}

const checks: Record<string, () => Promise<void>> = {
  book: async () => {
    const s = load();
    if (!s.learner) { s.learner = await newLearner("dbl", "A2", "English", false, "p11"); save(s); }
    const token = await learnerToken(s);
    const profileId = await m5ProfileId();
    const options = (await lessonCall(token, "booking_options", { tutor_profile_id: profileId })).body;
    if (!options.can_book) throw new Error(`booking not open: ${options.reason ?? options.error_code}`);
    const listing = await fn("parle-marketplace-service", token, { action: "learner_get_tutor", profile_id: profileId });
    const lengths: number[] = options.offered_lengths;
    const slots = generateBookableSlots({ ...listing.body.tutor.booking_schedule, busy_intervals: options.busy_intervals },
      { now: Date.now(), windowDays: options.horizon_days, minimumNoticeHours: options.minimum_notice_hours, lengths });
    const shortest = Math.min(...lengths);
    const slot = slots.find((x) => x.durationMinutes === shortest && hoursAhead(x.startUtc) >= 30 && hoursAhead(x.startUtc) <= 24 * 9);
    if (!slot) { console.log("book: no m5tut1 time 30 h to 9 days ahead; add availability as m5tut1 and run again"); return; }
    // A51: two presses of Book at the same moment
    const body = { tutor_profile_id: profileId, start_utc: slot.startUtc, minutes: slot.durationMinutes, message: "Bonjour, double appui." };
    const [one, two] = await Promise.all([lessonCall(token, "book_lesson", body), lessonCall(token, "book_lesson", body)]);
    console.log(`book (A51): presses answered ${one.status} ${one.body.error_code ?? ""} and ${two.status} ${two.body.error_code ?? ""}; same booking: ${one.body.booking_id === two.body.booking_id}`);
    const db = await service();
    const { data: holds } = await db.from("booking").select("id").eq("learner_id", (await signIn(s.learner!.email, s.learner!.password)).id).eq("status", "pending_payment");
    console.log(`book (A51): holds for this learner: ${holds?.length ?? 0}`);
    const ok = one.status === 200 ? one : two;
    if (ok.status !== 200) return;
    s.a = ok.body.booking_id;
    s.checkout = { a: ok.body.checkout_url };
    save(s);
  },
  status: async () => {
    const s = load();
    const lesson = (await lessonCall(await learnerToken(s), "lesson_status", { booking_id: s.a })).body.lesson;
    console.log(`status: ${lesson?.status}; price ${lesson?.price_cents} cents; refund if cancelled now ${lesson?.cancel_refund_cents}`);
  },
  "cancel-both": async () => {
    const s = load();
    const learner = await learnerToken(s);
    const { token: tutorToken } = await tutor();
    const lesson = (await lessonCall(learner, "lesson_status", { booking_id: s.a })).body.lesson;
    if (lesson?.status !== "confirmed") { console.log(`cancel-both: the lesson is ${lesson?.status}, not confirmed; pay it first`); return; }
    // A53: the learner and the tutor press Cancel at the same moment
    const [l, t] = await Promise.all([
      lessonCall(learner, "cancel_lesson", { booking_id: s.a, expected_refund_cents: lesson.cancel_refund_cents }),
      lessonCall(tutorToken, "cancel_lesson", { booking_id: s.a, expected_refund_cents: lesson.price_cents }),
    ]);
    console.log(`cancel-both (A53): learner ${l.status} ${l.body.error_code ?? ""}; tutor ${t.status} ${t.body.error_code ?? ""}`);
    const db = await service();
    const { data: pay } = await db.from("payment").select("status, refunded_cents, amount_cents").eq("booking_id", s.a).single();
    const { data: refunds } = await db.from("refund").select("reason, amount_cents").eq("booking_id", s.a);
    const { data: b } = await db.from("booking").select("status, cancelled_by").eq("id", s.a).single();
    console.log(`cancel-both (A53): booking ${b?.status} by ${b?.cancelled_by}; payment ${pay?.status} (${pay?.refunded_cents} of ${pay?.amount_cents} cents refunded); refund rows ${refunds?.length ?? 0}`);
  },
  delete: async () => {
    const s = load();
    if (!s.learner) { console.log("delete: no check learner"); return; }
    s.learner.token = await learnerToken(s);
    await removeLearner(s.learner);
    console.log("delete: check learner removed");
    writeFileSync(STATE, JSON.stringify({}, null, 2));
  },
};

if (import.meta.main) {
  const which = process.argv[2] ?? "";
  if (!checks[which]) throw new Error(`usage: bun scripts/prod/plan11-checks.ts <${Object.keys(checks).join("|")}>`);
  await checks[which]();
}
