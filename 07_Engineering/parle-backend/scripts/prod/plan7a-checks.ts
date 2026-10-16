import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, newLearner, removeLearner, type Learner } from "./check-learners";
import { waitForMail } from "../buildy/agentmail";
import { SECRETS_DIR } from "../lib/secrets";
import { generateBookableSlots } from "../../../parle-app/functions/parle-booking-slots.helper.ts";

/**
 * Plan 7A checks on production in Stripe test mode, with an AgentMail learner (obsidianteamhq+p7a...) and m5tut1.
 * The learner's password, booking ids and Checkout addresses are kept in the secrets folder and never printed.
 * usage: bun scripts/prod/plan7a-checks.ts <meeting-link|book-a|status-a|reschedule-a|cancel-a|book-b|status-b|tutor-b|finish-b|delete>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
const STATE = `${SECRETS_DIR}/plan7a-check-state.json`;
type State = { learner?: Learner; a?: string; b?: string; checkout?: Record<string, string>; since?: string };
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
  if (!s.learner) throw new Error("run book-a first");
  return (await signIn(s.learner.email, s.learner.password)).token;
}
const service = async () => createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });

async function m5ProfileId(): Promise<string> {
  const { id } = await tutor();
  const { data } = await (await service()).from("tutor_public_profile").select("profile_id").eq("tutor_user_id", id).eq("is_published", true).limit(1);
  if (!data?.[0]) throw new Error("m5tut1 has no published listing");
  return data[0].profile_id;
}

async function pickSlot(token: string, profileId: string, minHours: number, maxHours: number) {
  const options = (await lessonCall(token, "booking_options", { tutor_profile_id: profileId })).body;
  if (!options.can_book) throw new Error(`booking not open: ${options.reason ?? options.error_code}`);
  const listing = await fn("parle-marketplace-service", token, { action: "learner_get_tutor", profile_id: profileId });
  const lengths: number[] = options.offered_lengths;
  const slots = generateBookableSlots({ ...listing.body.tutor.booking_schedule, busy_intervals: options.busy_intervals },
    { now: Date.now(), windowDays: options.horizon_days, minimumNoticeHours: options.minimum_notice_hours, lengths });
  const shortest = Math.min(...lengths);
  return slots.find((slot) => slot.durationMinutes === shortest && hoursAhead(slot.startUtc) >= minHours && hoursAhead(slot.startUtc) <= maxHours) ?? null;
}

async function bookAt(s: State, key: "a" | "b", minHours: number, maxHours: number, message: string) {
  const token = await learnerToken(s);
  const profileId = await m5ProfileId();
  const slot = await pickSlot(token, profileId, minHours, maxHours);
  if (!slot) { console.log(`${key}: no m5tut1 time between ${minHours} and ${maxHours} h ahead; add availability as m5tut1 and run again`); return; }
  s.since = new Date(Date.now() - 5_000).toISOString();
  const r = await lessonCall(token, "book_lesson", { tutor_profile_id: profileId, start_utc: slot.startUtc, minutes: slot.durationMinutes, message });
  console.log(`${key}: book_lesson ${r.status} ${r.body.error_code ?? ""}; ${slot.durationMinutes} min, ${hoursAhead(slot.startUtc).toFixed(1)} h ahead; Checkout page ${r.body.checkout_url ? "opened" : "missing"}`);
  if (r.status !== 200) return;
  s[key] = r.body.booking_id;
  s.checkout = { ...(s.checkout ?? {}), [key]: r.body.checkout_url };
  save(s);
}

async function mails(s: State, words: string) {
  for (const [who, address] of [["learner", s.learner!.email], ["m5tut1", TUTOR]] as const) {
    const mail = await waitForMail(address, s.since!, 240_000);
    console.log(mail
      ? `${who} mail: "${mail.subject}"; invite attached: ${mail.attachments.filter((n) => n.endsWith(".ics")).join(", ") || "none"}; meeting link shown: ${/meet\.google\.com|zoom\.us/.test(mail.text)}; mentions "${words}": ${mail.subject.includes(words) || mail.text.includes(words)}`
      : `${who} mail: NOT received within 4 minutes`);
  }
}

async function status(key: "a" | "b") {
  const s = load();
  const token = await learnerToken(s);
  let lesson: any = null;
  for (let i = 0; i < 20; i++) {
    lesson = (await lessonCall(token, "lesson_status", { booking_id: s[key] })).body.lesson;
    if (lesson?.status === "confirmed") break;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  console.log(`${key}: status ${lesson?.status}; meeting link ${lesson?.meeting_link ? new URL(lesson.meeting_link).hostname : "empty"}; price ${lesson?.price_cents} cents`);
  const { count } = await (await service()).from("stripe_event").select("id", { count: "exact", head: true }).gte("processed_at", s.since!);
  console.log(`${key}: Stripe events recorded since booking: ${count ?? 0} (0 means the reconciliation job confirmed it, not the webhook)`);
  await mails(s, "booked");
}

const steps: Record<string, () => Promise<void>> = {
  "meeting-link": async () => {
    const { token } = await tutor();
    const app = await fn("parle-marketplace-service", token, { action: "tutor_get_application" });
    const link = String(app.body.profile?.meeting_link ?? "");
    console.log(`m5tut1 meeting link: ${link ? `set (${new URL(link).hostname})` : "EMPTY"}`);
  },
  "book-a": async () => {
    const s = load();
    if (!s.learner) { s.learner = await newLearner("bk", "A2", "English", false, "p7a"); save(s); }
    await bookAt(s, "a", 30, 24 * 9, "Bonjour, je prépare le TEF Canada.");
  },
  "status-a": () => status("a"),
  "reschedule-a": async () => {
    const s = load();
    const token = await learnerToken(s);
    const slots: string[] = (await lessonCall(token, "reschedule_options", { booking_id: s.a })).body.slots ?? [];
    const next = slots.find((slot) => hoursAhead(slot) >= 30);
    if (!next) { console.log("reschedule-a: no other time 30 h or more ahead"); return; }
    s.since = new Date(Date.now() - 5_000).toISOString();
    save(s);
    const r = await lessonCall(token, "reschedule_lesson", { booking_id: s.a, start_utc: next });
    console.log(`reschedule-a: ${r.status} ${r.body.error_code ?? ""}; now ${hoursAhead(r.body.lesson?.start_at ?? next).toFixed(1)} h ahead; moves left: ${r.body.lesson?.can_reschedule ? 1 : 0}`);
    await mails(s, "moved");
  },
  "cancel-a": async () => {
    const s = load();
    const token = await learnerToken(s);
    const lesson = (await lessonCall(token, "lesson_status", { booking_id: s.a })).body.lesson;
    s.since = new Date(Date.now() - 5_000).toISOString();
    save(s);
    const r = await lessonCall(token, "cancel_lesson", { booking_id: s.a, expected_refund_cents: lesson.cancel_refund_cents });
    console.log(`cancel-a: ${r.status} ${r.body.error_code ?? ""}; refunded ${r.body.refunded_cents} of ${lesson.price_cents} cents; status ${r.body.lesson?.status}`);
    const db = await service();
    const { data: pay } = await db.from("payment").select("status, refunded_cents").eq("booking_id", s.a).single();
    const { data: refunds } = await db.from("refund").select("reason, amount_cents").eq("booking_id", s.a);
    console.log(`cancel-a: payment ${pay?.status} (${pay?.refunded_cents} cents refunded); refund rows ${JSON.stringify(refunds)}`);
    await mails(s, "cancelled");
  },
  "book-b": async () => { const s = load(); await bookAt(s, "b", 13, 23, "Je voudrais pratiquer l'oral."); },
  "status-b": () => status("b"),
  "tutor-b": async () => {
    const s = load();
    const { token } = await tutor();
    const list = (await lessonCall(token, "tutor_list_lessons")).body.lessons ?? [];
    const lesson = list.find((l: any) => l.id === s.b);
    console.log(`tutor-b: on m5tut1's Lessons: ${Boolean(lesson)}; status ${lesson?.status}; brief ready: ${lesson?.has_brief}; learner message shown: ${Boolean(lesson?.learner_message)}`);
    const brief = (await lessonCall(token, "tutor_lesson_brief", { booking_id: s.b })).body.brief;
    console.log(`tutor-b: brief ${brief ? `has goal ${Boolean(brief.goal)}, levels for ${Object.keys(brief.levels ?? {}).length} skills, message ${Boolean(brief.learner_message)}` : "not built yet (the job runs every 10 minutes)"}`);
  },
  "finish-b": async () => {
    const s = load();
    const { token } = await tutor();
    const marked = await lessonCall(token, "mark_attendance", { booking_id: s.b, outcome: "completed" });
    console.log(`finish-b: attendance ${marked.status} ${marked.body.error_code ?? marked.body.lesson?.status}`);
    const review = await lessonCall(await learnerToken(s), "submit_review", { booking_id: s.b, stars: 5, comment: "Plan 7A check: clear and patient." });
    console.log(`finish-b: review ${review.status} ${review.body.error_code ?? `stars ${review.body.lesson?.review_stars}`}`);
    const { data } = await (await service()).from("tutor_review").select("stars, is_test_review, is_visible").eq("booking_id", s.b).maybeSingle();
    console.log(`finish-b: stored review ${JSON.stringify(data)}`);
  },
  delete: async () => {
    const s = load();
    if (!s.learner) { console.log("delete: no check learner"); return; }
    s.learner.token = await learnerToken(s);
    await removeLearner(s.learner);
    const { data } = await (await service()).from("booking").select("status, cancelled_by").in("id", [s.a, s.b].filter(Boolean) as string[]);
    console.log(`delete: the learner's lessons now ${JSON.stringify(data)}`);
  },
};

const which = process.argv[2] ?? "";
if (!steps[which]) throw new Error(`usage: bun scripts/prod/plan7a-checks.ts <${Object.keys(steps).join("|")}>`);
await steps[which]();
