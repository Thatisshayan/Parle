import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { PROD_REF, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, newLearner, removeLearner, type Learner } from "./check-learners";
import { SECRETS_DIR } from "../lib/secrets";
import { generateBookableSlots } from "../../../parle-app/functions/parle-booking-slots.helper.ts";

/**
 * Plan 12 checks on production in Stripe test mode, with two AgentMail check learners and m5tut1 (both learners are
 * deleted at the end; no payment is made). Outcomes only, never passwords or links.
 *   R130: a time someone else holds answers "just taken" quickly (it ran out of CPU before);
 *   R127: choosing a different, overlapping time ends one's own unpaid hold.
 * usage: bun scripts/prod/plan12-checks.ts
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
const passwords = () => JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
const hoursAhead = (iso: string) => (Date.parse(iso) - Date.now()) / 3_600_000;

async function lessonCall(token: string, action: string, body: Record<string, unknown> = {}) {
  const t0 = Date.now();
  const r = await fetch(`${PROD_URL}/functions/v1/parle-lesson-service`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: await anonKey(), "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ action, ...body }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any, ms: Date.now() - t0 };
}
async function tutorId(): Promise<string> {
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: TUTOR, password: passwords()[TUTOR] });
  if (error || !data.user) throw new Error("tutor sign-in failed");
  return data.user.id;
}

const db = createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const { data: listing } = await db.from("tutor_public_profile").select("profile_id").eq("tutor_user_id", await tutorId()).eq("is_published", true).limit(1);
const profileId = listing?.[0]?.profile_id;
if (!profileId) throw new Error("m5tut1 has no published listing");

const a: Learner = await newLearner("p12a", "A2", "English", false, "p12");
const b: Learner = await newLearner("p12b", "A2", "English", false, "p12");
try {
  const options = (await lessonCall(a.token, "booking_options", { tutor_profile_id: profileId })).body;
  const listingBody = await fn("parle-marketplace-service", a.token, { action: "learner_get_tutor", profile_id: profileId });
  const slots = generateBookableSlots({ ...listingBody.body.tutor.booking_schedule, busy_intervals: options.busy_intervals },
    { now: Date.now(), windowDays: options.horizon_days, minimumNoticeHours: options.minimum_notice_hours, lengths: options.offered_lengths });
  const len = Math.min(...options.offered_lengths);
  const free = slots.filter((s) => s.durationMinutes === len && hoursAhead(s.startUtc) > 48);
  // two starts one grid step apart, so the second overlaps the first
  const pair = free.map((s) => [s, free.find((x) => Date.parse(x.startUtc) === Date.parse(s.startUtc) + 15 * 60_000)]).find(([, n]) => n);
  if (!pair) throw new Error("no two adjacent free m5tut1 times; add availability as m5tut1");
  const [first, second] = pair as [typeof free[0], typeof free[0]];

  const held = await lessonCall(a.token, "book_lesson", { tutor_profile_id: profileId, start_utc: first.startUtc, minutes: len, message: "" });
  console.log(`hold: ${held.status} in ${held.ms} ms`);
  const taken = await lessonCall(b.token, "book_lesson", { tutor_profile_id: profileId, start_utc: first.startUtc, minutes: len, message: "" });
  console.log(`R130 taken time for another learner: ${taken.status} ${taken.body.error_code ?? ""} in ${taken.ms} ms`);
  const moved = await lessonCall(a.token, "book_lesson", { tutor_profile_id: profileId, start_utc: second.startUtc, minutes: len, message: "" });
  const { data: old } = await db.from("booking").select("status, cancelled_by").eq("id", held.body.booking_id).single();
  console.log(`R127 overlapping new time: ${moved.status} ${moved.body.error_code ?? ""} in ${moved.ms} ms; first hold now ${old?.status} (ended by ${old?.cancelled_by})`);
} finally {
  await removeLearner(a);
  await removeLearner(b);
  console.log("clean-up: both check learners deleted");
}
