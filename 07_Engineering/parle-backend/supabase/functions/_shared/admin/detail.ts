import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { pausedUser } from "../account-status.ts";
import { tutorInfo } from "../lessons/store.ts";
import { effectiveApplicationStatus } from "../../_app/functions/parle-marketplace.helper.ts";
import { authUser, isOwner, roleOf, targetUserId, type AdminContext } from "./context.ts";

function rows<T = Record<string, any>>(r: { data: unknown; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as T[];
}
const iso = (v: unknown) => (typeof v === "string" && v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const validZone = (z: unknown): z is string => { try { return typeof z === "string" && !!z && (new Intl.DateTimeFormat("en", { timeZone: z }), true); } catch { return false; } };
const localDay = (now: Date, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const SKILLS = ["listening", "reading", "writing", "speaking"];
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PAST = ["completed", "learner_no_show", "disputed"];

/** Spec 3.4: one person's full picture, read on the server. */
export async function userDetail(ctx: AdminContext): Promise<Record<string, unknown>> {
  const id = targetUserId(ctx);
  const user = await authUser(ctx, id);
  const [status] = rows(await ctx.db.from("account_status").select("status, reason, lessons_choice, changed_by, changed_at").eq("user_id", id).maybeSingle());
  const audits = rows(await ctx.db.from("admin_audit_log").select("action, actor_label, occurred_at_utc, new_value").eq("target_id", id).order("occurred_at_utc", { ascending: false }).limit(10));
  const [identity] = rows(await ctx.db.from("ParleIdentity").select("role").eq("owner_id", id).order("created_at").limit(1));
  const disabled = status?.status === "disabled";
  const account = {
    id, email: user.email ?? "", name: String((user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? ""), role: roleOf(user), owner: isOwner(user),
    status: disabled || pausedUser(user) ? "disabled" : "active",
    paused: disabled ? { reason: status.reason, by: status.changed_by, at: iso(status.changed_at), lessons_choice: status.lessons_choice } : null,
    signed_up_at: iso(user.created_at), last_sign_in_at: iso(user.last_sign_in_at), email_verified: Boolean(user.email_confirmed_at),
  };
  return {
    account,
    learner: identity?.role === "learner" ? await learnerDetail(ctx, id) : null,
    tutor: identity?.role === "tutor" ? await tutorDetail(ctx, id, account.email) : null,
    recent_audit: audits.map((a) => ({ action: String(a.action ?? ""), by: String(a.actor_label ?? ""), at: String(a.occurred_at_utc ?? ""), details: String(a.new_value ?? "").slice(0, 300) })),
  };
}

async function learnerDetail(ctx: AdminContext, id: string) {
  const db = ctx.db;
  const [identity, subs, profiles, estimates, plans, bookings] = await Promise.all([
    db.from("ParleIdentity").select("premium_comp_active").eq("owner_id", id).order("created_at").limit(1),
    db.from("Subscriber").select("stripe_status, cancel_at_period_end, current_period_end, stripe_customer_id, updated_at").eq("user_id", id).order("updated_at", { ascending: false }).limit(1),
    db.from("learner_profile").select("main_goal, track, time_zone").eq("user_id", id).order("updated_at", { ascending: false }).limit(1),
    db.from("skill_estimate").select("skill, value, updated_at").eq("user_id", id).order("updated_at", { ascending: false }).limit(50),
    db.from("week_plan").select("id, week_start_local").eq("user_id", id).eq("status", "active").order("week_start_local", { ascending: false }).limit(1),
    db.from("booking").select("id, status, start_at, price_cents, tutor_id").eq("learner_id", id).not("status", "in", "(pending_payment,expired)").order("start_at", { ascending: false }).limit(200),
  ]);
  const sub = rows(subs)[0];
  const paid = Boolean(sub && ["active", "trialing", "past_due"].includes(String(sub.stripe_status)));
  const comp = rows(identity)[0]?.premium_comp_active === true;
  const periodEnd = iso(sub?.current_period_end);
  const plan = {
    name: paid || comp ? "Premium" : "Free", source: paid ? "stripe" : comp ? "complimentary" : null,
    renews_at: paid && sub.cancel_at_period_end !== true ? periodEnd : null, ends_at: paid && sub.cancel_at_period_end === true ? periodEnd : null,
    stripe_customer_url: sub?.stripe_customer_id ? `https://dashboard.stripe.com/test/customers/${encodeURIComponent(String(sub.stripe_customer_id))}` : null,
  };
  const profile = rows(profiles)[0];
  const zone = validZone(profile?.time_zone) ? profile.time_zone : "UTC";
  const levels: Record<string, number> = {};
  for (const e of rows(estimates)) if (SKILLS.includes(e.skill) && !(e.skill in levels) && Number.isFinite(Number(e.value))) levels[e.skill] = Number(e.value);
  const week = rows(plans)[0];
  let thisWeek = null;
  if (week) {
    const tasks = rows(await db.from("learner_task").select("status").eq("week_plan_id", week.id).limit(500));
    thisWeek = { week_start: String(week.week_start_local ?? ""), done: tasks.filter((t) => t.status === "done").length, planned: tasks.filter((t) => !["suggested", "dropped"].includes(String(t.status))).length };
  }
  const today = localDay(ctx.now, zone);
  const usage = rows(await db.from("usage_counter").select("period_key, ai_messages").eq("user_id", id).eq("period", "day").like("period_key", `${today.slice(0, 7)}-%`).limit(62));
  const ai = { today: usage.filter((r) => r.period_key === today).reduce((s, r) => s + Number(r.ai_messages || 0), 0), this_month: usage.reduce((s, r) => s + Number(r.ai_messages || 0), 0) };
  const lessonRows = rows(bookings);
  const refunds = lessonRows.length ? rows(await db.from("refund").select("booking_id, amount_cents").in("booking_id", lessonRows.map((b) => b.id))) : [];
  const refundedBy = new Map<string, number>();
  for (const r of refunds) refundedBy.set(r.booking_id, (refundedBy.get(r.booking_id) ?? 0) + Number(r.amount_cents));
  const names = new Map<string, string>();
  for (const tid of new Set(lessonRows.map((b) => b.tutor_id).filter(Boolean))) names.set(tid, (await tutorInfo(db, tid))?.displayName ?? "Former tutor");
  const now = ctx.now.getTime();
  return {
    goal: String(profile?.main_goal ?? ""), track: String(profile?.track ?? ""), plan, levels, this_week: thisWeek, ai_messages: ai,
    lessons: {
      upcoming: lessonRows.filter((b) => b.status === "confirmed" && Date.parse(b.start_at) > now).length,
      past: lessonRows.filter((b) => PAST.includes(b.status)).length,
      cancelled: lessonRows.filter((b) => String(b.status).startsWith("cancelled")).length,
      refunded_cents: [...refundedBy.values()].reduce((s, v) => s + v, 0),
      items: lessonRows.slice(0, 50).map((b) => ({ id: b.id, start_at: iso(b.start_at), status: b.status, tutor_name: b.tutor_id ? names.get(b.tutor_id) ?? "Former tutor" : "Former tutor", price_cents: b.price_cents, refunded_cents: refundedBy.get(b.id) ?? 0 })),
    },
  };
}

/** Plan 7B's payout account, read only if the table exists (ruling in Task 5). */
async function payoutAccount(db: SupabaseClient, tutorId: string): Promise<string> {
  const { data, error } = await db.from("tutor_payout_account").select("stripe_account_id, payouts_enabled, details_submitted, waitlisted_at").eq("tutor_id", tutorId).maybeSingle();
  if (error) {
    if (/tutor_payout_account|does not exist|schema cache/i.test(error.message)) return "not_available";
    throw new Error(error.message);
  }
  if (!data) return "none";
  if (data.payouts_enabled === true && data.stripe_account_id) return "ready";
  if (data.waitlisted_at && !data.stripe_account_id) return "country_waitlist";
  return data.details_submitted === true ? "pending" : "incomplete";
}

async function tutorDetail(ctx: AdminContext, id: string, email: string) {
  const db = ctx.db;
  const [profiles, rules, taught, reviews, payout] = await Promise.all([
    db.from("tutor_profile").select("id, created_by, application_intent, submission_revision, hourly_rate_cents, founding_until, time_zone").eq("user_id", id).order("created_at").limit(1),
    db.from("availability_rule").select("day_of_week, start_local, end_local, time_zone").eq("user_id", id).order("day_of_week").limit(50),
    db.from("booking").select("id", { count: "exact", head: true }).eq("tutor_id", id).eq("status", "completed"),
    db.from("tutor_review").select("stars").eq("tutor_email", email).not("booking_id", "is", null).limit(5000),
    payoutAccount(db, id),
  ]);
  const profile = rows(profiles)[0] ?? null;
  const review = profile
    ? rows(await db.from("tutor_application_review").select("status, reviewed_revision, updated_at").eq("profile_id", profile.id).eq("tutor_email", profile.created_by ?? email).order("updated_at", { ascending: false }).limit(1))[0] ?? null
    : null;
  const ruleRows = rows(rules);
  let minutes = 0;
  const windows: string[] = [];
  for (const r of ruleRows) {
    const [sh, sm] = String(r.start_local ?? "").split(":").map(Number), [eh, em] = String(r.end_local ?? "").split(":").map(Number);
    const span = eh * 60 + em - (sh * 60 + sm);
    if (!Number.isFinite(span) || span <= 0) continue;
    minutes += span;
    windows.push(`${DAYS[Number(r.day_of_week)] ?? "?"} ${r.start_local}-${r.end_local}`);
  }
  if (taught.error) throw new Error(taught.error.message);
  const stars = rows(reviews).map((r) => Number(r.stars)).filter((n) => n >= 1 && n <= 5);
  return {
    application_status: effectiveApplicationStatus(profile, review),
    hourly_rate_cents: profile && Number.isFinite(Number(profile.hourly_rate_cents)) ? Number(profile.hourly_rate_cents) : null,
    founding_until: typeof profile?.founding_until === "string" ? profile.founding_until : null,
    availability: { weekly_hours: Math.round((minutes / 60) * 10) / 10, windows, time_zone: String(ruleRows[0]?.time_zone ?? profile?.time_zone ?? "") },
    lessons_taught: taught.count ?? 0,
    rating: stars.length ? { average: Math.round((stars.reduce((s, n) => s + n, 0) / stars.length) * 10) / 10, count: stars.length } : null,
    payout_account: payout,
  };
}
