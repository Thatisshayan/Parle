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

// Metrics (D24)
export type MetricsDays = 7 | 30 | 90;
export const BANDS = ["weekday_morning", "weekday_afternoon", "weekday_evening", "weekend_morning", "weekend_afternoon", "weekend_evening"] as const;
export type Band = (typeof BANDS)[number];
export type Metrics = {
  range: { days: number; from: string; to: string };
  signups_by_week: Array<{ week: string; learners: number; tutors: number }>;
  active_learners_by_week: Array<{ week: string; learners: number }>;
  premium: { paid: number; complimentary: number; started: number; ended: number };
  practice_completed: number; checkins_submitted: number; ai_messages: number;
  lessons: { booked: number; completed: number; cancelled_by_learner: number; cancelled_by_tutor: number; cancelled_by_parle: number; refunded_cents: number; revenue_cents: number; commission_cents: number; booked_hours: number };
  tutor_hours: { offered: number; booked: number };
  demand_supply: Array<{ band: Band; learners: number; tutor_hours_per_week: number }>;
  tracks: Array<{ track: "immigration" | "citizenship"; specialty: string; learners: number; learner_weekly_hours: number; tutors: number; tutor_weekly_hours: number; short_of_tutors: boolean }>;
};
const n = (v: unknown) => { const x = typeof v === "string" ? Number(v) : v; return typeof x === "number" && Number.isFinite(x) ? x : 0; };
const list = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);

export function safeMetrics(v: unknown): Metrics | null {
  if (!isObject(v) || !isObject(v.lessons) || !Array.isArray(v.demand_supply) || !Array.isArray(v.tracks)) return null;
  const r = isObject(v.range) ? v.range : {}, p = isObject(v.premium) ? v.premium : {}, l = v.lessons, h = isObject(v.tutor_hours) ? v.tutor_hours : {};
  return {
    range: { days: n(r.days), from: str(r.from, 40), to: str(r.to, 40) },
    signups_by_week: list(v.signups_by_week).map((w) => ({ week: str(w.week, 10), learners: n(w.learners), tutors: n(w.tutors) })),
    active_learners_by_week: list(v.active_learners_by_week).map((w) => ({ week: str(w.week, 10), learners: n(w.learners) })),
    premium: { paid: n(p.paid), complimentary: n(p.complimentary), started: n(p.started), ended: n(p.ended) },
    practice_completed: n(v.practice_completed), checkins_submitted: n(v.checkins_submitted), ai_messages: n(v.ai_messages),
    lessons: { booked: n(l.booked), completed: n(l.completed), cancelled_by_learner: n(l.cancelled_by_learner), cancelled_by_tutor: n(l.cancelled_by_tutor), cancelled_by_parle: n(l.cancelled_by_parle), refunded_cents: n(l.refunded_cents), revenue_cents: n(l.revenue_cents), commission_cents: n(l.commission_cents), booked_hours: n(l.booked_hours) },
    tutor_hours: { offered: n(h.offered), booked: n(h.booked) },
    demand_supply: list(v.demand_supply).filter((b) => (BANDS as readonly string[]).includes(b.band)).map((b) => ({ band: b.band as Band, learners: n(b.learners), tutor_hours_per_week: n(b.tutor_hours_per_week) })),
    tracks: list(v.tracks).filter((tr) => tr.track === "immigration" || tr.track === "citizenship").map((tr) => ({ track: tr.track, specialty: str(tr.specialty, 60), learners: n(tr.learners), learner_weekly_hours: n(tr.learner_weekly_hours), tutors: n(tr.tutors), tutor_weekly_hours: n(tr.tutor_weekly_hours), short_of_tutors: tr.short_of_tutors === true })),
  };
}
export const loadMetrics = async (days: MetricsDays) => safeMetrics(await call("admin_metrics", { days }));

// Waitlist (spec 4.3)
export type CampaignName = "founding_tutor" | "launch";
export type CampaignText = { launch_date: string; personal_paragraph: string };
export type CampaignState = { blanks: CampaignText; started_at: string | null; finished_at: string | null; last_error: string; queued: number; sent: number; failed: number; skipped: number };
export type WaitlistOverview = {
  learners: number; tutors: number; unsubscribed: number; postal_address: string; app_url: string; app_url_public: boolean; me_owner: boolean;
  campaigns: Record<CampaignName, CampaignState>; failures: Array<{ id: string; campaign: string; email: string; error: string }>;
};
function campaignState(v: unknown): CampaignState {
  const c = isObject(v) ? v : {}, b = isObject(c.blanks) ? c.blanks : {};
  return { blanks: { launch_date: str(b.launch_date, 60), personal_paragraph: str(b.personal_paragraph, 1500) }, started_at: isoOrNull(c.started_at), finished_at: isoOrNull(c.finished_at), last_error: str(c.last_error, 300), queued: num(c.queued), sent: num(c.sent), failed: num(c.failed), skipped: num(c.skipped) };
}
export function safeWaitlist(v: unknown): WaitlistOverview {
  const o = isObject(v) ? v : {}, c = isObject(o.campaigns) ? o.campaigns : {};
  return {
    learners: num(o.learners), tutors: num(o.tutors), unsubscribed: num(o.unsubscribed), postal_address: str(o.postal_address, 300), app_url: str(o.app_url, 200), app_url_public: o.app_url_public === true, me_owner: o.me_owner === true,
    campaigns: { founding_tutor: campaignState(c.founding_tutor), launch: campaignState(c.launch) },
    failures: (Array.isArray(o.failures) ? o.failures : []).filter(isObject).map((f) => ({ id: str(f.id, 64), campaign: str(f.campaign, 20), email: str(f.email, 320), error: str(f.error, 300) })),
  };
}
/** Why Send is not available yet (the server checks the same; spec 4.3 and the OPEN ITEM on the postal address). */
export function sendBlock(o: WaitlistOverview, campaign: CampaignName): TranslationKey | null {
  const c = o.campaigns[campaign];
  if (c.queued > 0) return "adminWaitlist.block.sending";
  if (!o.postal_address.trim()) return "adminWaitlist.block.address";
  const date = c.blanks.launch_date.trim();
  if (campaign === "launch" && (date.length < 3 || date.length > 60)) return "adminWaitlist.block.date";
  if (c.blanks.personal_paragraph.trim().length < 20) return "adminWaitlist.block.paragraph";
  return null;
}
export const loadWaitlist = async () => safeWaitlist(await call("admin_waitlist_overview"));
export async function saveCampaignText(campaign: CampaignName, blanks: CampaignText): Promise<void> { await call("admin_waitlist_save_blanks", { campaign, blanks }); }
export async function saveSenderAddress(address: string): Promise<void> { await call("admin_waitlist_save_address", { address }); }
export async function previewWaitlistEmail(campaign: CampaignName, blanks: CampaignText, role: "learner" | "tutor"): Promise<{ subject: string; html: string }> {
  const r = await call("admin_waitlist_preview", { campaign, blanks, role });
  return { subject: str(r.subject, 200), html: str(r.html, 100000) };
}
export async function sendWaitlistTest(campaign: CampaignName, blanks: CampaignText): Promise<string> { return str((await call("admin_waitlist_send_test", { campaign, blanks })).sent_to, 320); }
export async function startWaitlistSend(campaign: CampaignName): Promise<number> { return num((await call("admin_waitlist_start", { campaign, confirm: "SEND" })).queued); }
export async function retryWaitlistFailed(campaign: CampaignName): Promise<number> { return num((await call("admin_waitlist_retry_failed", { campaign })).queued); }
export async function markWaitlistUnsubscribed(email: string): Promise<string> { return str((await call("admin_waitlist_mark_unsubscribed", { email })).result, 20); }
export async function deleteWaitlist(): Promise<number> { return num((await call("admin_waitlist_delete", { confirm: "DELETE" })).signups); }

// The question bank switch (bank readers fix, R94): which bank placement, check-ins and the level check serve.
export type BankSourceName = "demo" | "real";
const BANK_SKILLS = ["listening", "reading", "grammar_vocabulary"] as const;
const BANK_KINDS = ["writing", "speaking"] as const;
const BANK_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type BankCounts = { ready: boolean; questions: Record<(typeof BANK_SKILLS)[number], Record<(typeof BANK_LEVELS)[number], number>>; prompts: Record<(typeof BANK_KINDS)[number], Record<(typeof BANK_LEVELS)[number], number>> };
export type BankStatus = { source: BankSourceName; demo: BankCounts; real: BankCounts };

function safeBankCounts(v: unknown): BankCounts {
  const o = isObject(v) ? v : {};
  const grid = <K extends string>(keys: readonly K[], raw: unknown) => Object.fromEntries(keys.map((k) => {
    const row = isObject(raw) && isObject((raw as Record<string, unknown>)[k]) ? (raw as Record<string, Record<string, unknown>>)[k] : {};
    return [k, Object.fromEntries(BANK_LEVELS.map((l) => [l, num(row[l])]))];
  })) as Record<K, Record<(typeof BANK_LEVELS)[number], number>>;
  return { ready: o.ready === true, questions: grid(BANK_SKILLS, o.questions), prompts: grid(BANK_KINDS, o.prompts) };
}
export function safeBankStatus(v: unknown): BankStatus {
  const o = isObject(v) ? v : {};
  return { source: o.source === "real" ? "real" : "demo", demo: safeBankCounts(o.demo), real: safeBankCounts(o.real) };
}
export async function loadBankStatus(): Promise<BankStatus> {
  return safeBankStatus(await call("admin_bank_status"));
}
export async function setBankSource(source: BankSourceName): Promise<BankSourceName> {
  const r = await call("admin_set_bank_source", { source });
  return r.source === "real" ? "real" : "demo";
}
