import { parleAdminService, parleWaitlistUnsubscribe } from "@/functions";
import { hasTranslationKey, type TranslationKey } from "@/lib/i18n";

/** Plan 8 administrator client: parle-admin-service and the public unsubscribe function. */
export class AdminRequestError extends Error {
  code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}
const isObject = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isoOrNull = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\/dashboard\.stripe\.com\//.test(v) ? v : null);

async function call(action: string, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
  try {
    const r = await parleAdminService({ action, ...body });
    return isObject(r) ? r : {};
  } catch (e) {
    const b = isObject((e as { body?: unknown })?.body) ? (e as { body: Record<string, unknown> }).body : {};
    throw new AdminRequestError(str(b.error_code) || "REQUEST_FAILED", str(b.message));
  }
}

export function adminErrorKey(error: unknown): TranslationKey {
  const key = `adminErrors.${error instanceof AdminRequestError ? error.code : "REQUEST_FAILED"}`;
  return hasTranslationKey(key) ? key : "adminErrors.REQUEST_FAILED";
}

// Administrators (spec 3.3) and paused accounts (spec 3.2)
export type AdminEntry = { id: string; email: string; name: string; owner: boolean; admin_since: string; since_known: boolean };
export type PausedEntry = { reason: string; changed_by: string; changed_at: string };
export type AccountsOverview = { me: { id: string; owner: boolean }; admins: AdminEntry[]; paused: Record<string, PausedEntry> };

export function safeAccountsOverview(v: unknown): AccountsOverview {
  const o = isObject(v) ? v : {};
  const admins = (Array.isArray(o.admins) ? o.admins : []).filter(isObject).filter((a) => typeof a.id === "string" && a.id)
    .map((a) => ({ id: a.id as string, email: str(a.email, 320), name: str(a.name, 120), owner: a.owner === true, admin_since: str(a.admin_since, 40), since_known: a.since_known === true }));
  const paused: Record<string, PausedEntry> = {};
  if (isObject(o.paused)) for (const [id, p] of Object.entries(o.paused)) if (isObject(p)) paused[id] = { reason: str(p.reason, 500), changed_by: str(p.changed_by, 320), changed_at: str(p.changed_at, 40) };
  const me = isObject(o.me) ? o.me : {};
  return { me: { id: str(me.id, 64), owner: me.owner === true }, admins, paused };
}
export const loadAccountsOverview = async () => safeAccountsOverview(await call("admin_accounts_overview"));
export async function inviteAdmin(email: string): Promise<{ email: string; existing_account: boolean; mail_sent: boolean }> {
  const r = await call("admin_invite_admin", { email });
  const i = isObject(r.invited) ? r.invited : {};
  return { email: str(i.email, 320), existing_account: i.existing_account === true, mail_sent: i.mail_sent === true };
}
export async function removeAdmin(userId: string): Promise<void> { await call("admin_remove_admin", { user_id: userId }); }

export type LessonCounts = { cancelled: number; failed: number };
const lessonCounts = (v: unknown): LessonCounts => ({ cancelled: num(isObject(v) ? v.cancelled : 0), failed: num(isObject(v) ? v.failed : 0) });
export async function pauseAccount(userId: string, reason: string, cancelLessons: boolean): Promise<LessonCounts> {
  return lessonCounts((await call("admin_disable_account", { user_id: userId, reason, cancel_lessons: cancelLessons })).lessons);
}
export async function enableAccount(userId: string): Promise<number> { return num((await call("admin_enable_account", { user_id: userId })).republished); }
export async function cancelPausedLessons(userId: string): Promise<LessonCounts> { return lessonCounts((await call("admin_cancel_paused_lessons", { user_id: userId })).lessons); }

export type PausedLesson = { id: string; start_at: string; tutor_name: string; learner_name: string; price_cents: number; paused_party: "learner" | "tutor" };
export async function loadPausedLessons(): Promise<PausedLesson[]> {
  const r = await call("admin_paused_lessons");
  return (Array.isArray(r.lessons) ? r.lessons : []).filter(isObject).filter((l) => typeof l.id === "string" && isoOrNull(l.start_at))
    .map((l) => ({ id: l.id as string, start_at: l.start_at as string, tutor_name: str(l.tutor_name, 120), learner_name: str(l.learner_name, 120), price_cents: num(l.price_cents), paused_party: l.paused_party === "learner" ? "learner" : "tutor" }));
}

// User details (D19)
const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];
export type UserDetail = {
  account: { id: string; email: string; name: string; role: "admin" | "learner" | "tutor"; owner: boolean; status: "active" | "disabled";
    paused: { reason: string; by: string; at: string | null; lessons_choice: string } | null; signed_up_at: string | null; last_sign_in_at: string | null; email_verified: boolean };
  learner: null | {
    goal: string; track: string;
    plan: { name: "Free" | "Premium"; source: "stripe" | "complimentary" | null; renews_at: string | null; ends_at: string | null; stripe_customer_url: string | null };
    levels: Partial<Record<Skill, number>>; this_week: { week_start: string; done: number; planned: number } | null;
    ai_messages: { today: number; this_month: number };
    lessons: { upcoming: number; past: number; cancelled: number; refunded_cents: number; items: Array<{ id: string; start_at: string | null; status: string; tutor_name: string; price_cents: number; refunded_cents: number }> };
  };
  tutor: null | {
    application_status: string; hourly_rate_cents: number | null; founding_until: string | null;
    availability: { weekly_hours: number; windows: string[]; time_zone: string };
    lessons_taught: number; rating: { average: number; count: number } | null; payout_account: string;
  };
  recent_audit: Array<{ action: string; by: string; at: string; details: string }>;
};

export function safeUserDetail(v: unknown): UserDetail | null {
  if (!isObject(v) || !isObject(v.account) || typeof v.account.id !== "string") return null;
  const a = v.account;
  const role = a.role === "admin" || a.role === "tutor" ? a.role : "learner";
  const paused = isObject(a.paused) ? { reason: str(a.paused.reason, 500), by: str(a.paused.by, 320), at: isoOrNull(a.paused.at), lessons_choice: str(a.paused.lessons_choice, 10) } : null;
  let learner: UserDetail["learner"] = null;
  if (isObject(v.learner)) {
    const l = v.learner, p = isObject(l.plan) ? l.plan : {}, w = isObject(l.this_week) ? l.this_week : null, ai = isObject(l.ai_messages) ? l.ai_messages : {}, ls = isObject(l.lessons) ? l.lessons : {};
    const levels: Partial<Record<Skill, number>> = {};
    if (isObject(l.levels)) for (const s of SKILLS) if (typeof l.levels[s] === "number") levels[s] = l.levels[s];
    learner = {
      goal: str(l.goal, 80), track: str(l.track, 40),
      plan: { name: p.name === "Premium" ? "Premium" : "Free", source: p.source === "stripe" || p.source === "complimentary" ? p.source : null, renews_at: isoOrNull(p.renews_at), ends_at: isoOrNull(p.ends_at), stripe_customer_url: httpsOrNull(p.stripe_customer_url) },
      levels, this_week: w ? { week_start: str(w.week_start, 20), done: num(w.done), planned: num(w.planned) } : null,
      ai_messages: { today: num(ai.today), this_month: num(ai.this_month) },
      lessons: {
        upcoming: num(ls.upcoming), past: num(ls.past), cancelled: num(ls.cancelled), refunded_cents: num(ls.refunded_cents),
        items: (Array.isArray(ls.items) ? ls.items : []).filter(isObject).map((i) => ({ id: str(i.id, 64), start_at: isoOrNull(i.start_at), status: str(i.status, 30), tutor_name: str(i.tutor_name, 120), price_cents: num(i.price_cents), refunded_cents: num(i.refunded_cents) })),
      },
    };
  }
  let tutor: UserDetail["tutor"] = null;
  if (isObject(v.tutor)) {
    const tt = v.tutor, av = isObject(tt.availability) ? tt.availability : {};
    tutor = {
      application_status: str(tt.application_status, 30), hourly_rate_cents: typeof tt.hourly_rate_cents === "number" ? tt.hourly_rate_cents : null,
      founding_until: typeof tt.founding_until === "string" ? tt.founding_until.slice(0, 10) : null,
      availability: { weekly_hours: num(av.weekly_hours), windows: (Array.isArray(av.windows) ? av.windows : []).map((x: unknown) => str(x, 40)).filter(Boolean), time_zone: str(av.time_zone, 80) },
      lessons_taught: num(tt.lessons_taught), rating: isObject(tt.rating) ? { average: num(tt.rating.average), count: num(tt.rating.count) } : null,
      payout_account: str(tt.payout_account, 30) || "not_available",
    };
  }
  return {
    account: { id: a.id, email: str(a.email, 320), name: str(a.name, 120), role, owner: a.owner === true, status: a.status === "disabled" ? "disabled" : "active", paused, signed_up_at: isoOrNull(a.signed_up_at), last_sign_in_at: isoOrNull(a.last_sign_in_at), email_verified: a.email_verified === true },
    learner, tutor,
    recent_audit: (Array.isArray(v.recent_audit) ? v.recent_audit : []).filter(isObject).map((e) => ({ action: str(e.action, 120), by: str(e.by, 320), at: str(e.at, 40), details: str(e.details, 300) })),
  };
}
export const loadUserDetail = async (userId: string) => safeUserDetail(await call("admin_user_detail", { user_id: userId }));

/** The public unsubscribe page (no login): the address that was unsubscribed. */
export async function unsubscribeWithToken(token: string): Promise<string> {
  try {
    const r = await parleWaitlistUnsubscribe({ token });
    if (isObject(r) && typeof r.email === "string") return r.email;
    throw new AdminRequestError("REQUEST_FAILED");
  } catch (e) {
    if (e instanceof AdminRequestError) throw e;
    const b = isObject((e as { body?: unknown })?.body) ? (e as { body: Record<string, unknown> }).body : {};
    throw new AdminRequestError(str(b.error_code) || "REQUEST_FAILED");
  }
}
