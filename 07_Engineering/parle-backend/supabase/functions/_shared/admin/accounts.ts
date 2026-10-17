import { cancelFutureLessons, endOpenHolds } from "../lessons/deletion.ts";
import { person, tutorInfo } from "../lessons/store.ts";
import { effectiveApplicationStatus } from "../../_app/functions/parle-marketplace.helper.ts";
import { AdminError, audit, authUser, plainText, targetUserId, type AdminContext } from "./context.ts";

/** Supabase Auth's ban "far in the future" (spec 3.1): 100 years. "none" lifts it. */
const FOREVER = "876000h";
type StatusRow = { status: string; reason: string; lessons_choice: string; unpublished_listing_ids: string[] | null; changed_by: string; changed_at: string };

async function statusRow(ctx: AdminContext, id: string): Promise<StatusRow | null> {
  const { data, error } = await ctx.db.from("account_status").select("status, reason, lessons_choice, unpublished_listing_ids, changed_by, changed_at").eq("user_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StatusRow | null) ?? null;
}

/** Spec 3.2: pause a learner or tutor; optionally cancel and refund their upcoming lessons. */
export async function disableAccount(ctx: AdminContext): Promise<Record<string, unknown>> {
  const id = targetUserId(ctx);
  const reason = plainText(ctx.body.reason, 500);
  if (reason.length < 3) throw new AdminError("REASON_REQUIRED", 400, "Write the reason (at least 3 characters).");
  if (typeof ctx.body.cancel_lessons !== "boolean") throw new AdminError("LESSONS_CHOICE_REQUIRED", 400, "Choose whether to cancel and refund their upcoming lessons.");
  if (id === ctx.caller.id) throw new AdminError("CANNOT_PAUSE_SELF", 409, "You cannot pause your own account.");
  const user = await authUser(ctx, id);
  if ((user.app_metadata as Record<string, unknown> | undefined)?.role === "admin") {
    throw new AdminError("ADMIN_CANNOT_BE_PAUSED", 409, "Administrators cannot be paused here. An owner removes the administrator role first.");
  }
  const before = await statusRow(ctx, id);
  // already paused AND banned: nothing to do. Paused on record but not banned (a ban call that failed): pausing again
  // applies the ban instead of refusing (Plan 8 review, Minor 1 graded up).
  const bannedUntil = Date.parse(String((user as Record<string, unknown>).banned_until ?? ""));
  if (before?.status === "disabled" && bannedUntil > ctx.now.getTime()) throw new AdminError("ALREADY_PAUSED", 409, "This account is already paused.");
  // The tutor's published listings go first, so nobody can book while the rest happens; enabling republishes these only.
  const { data: listings, error: listError } = await ctx.db.from("tutor_public_profile").select("id").eq("tutor_user_id", id).eq("is_published", true);
  if (listError) throw new Error(listError.message);
  // a second pass keeps the listings the first one unpublished, so enabling still republishes them (review, Minor 2)
  const listingIds = [...new Set([...(before?.unpublished_listing_ids ?? []), ...(listings ?? []).map((l) => String(l.id))])];
  if (listingIds.length) {
    const { error } = await ctx.db.from("tutor_public_profile").update({ is_published: false }).in("id", listingIds);
    if (error) throw new Error(error.message);
  }
  const { error: statusError } = await ctx.db.from("account_status").upsert({
    user_id: id, status: "disabled", reason, lessons_choice: ctx.body.cancel_lessons ? "cancel" : "keep", unpublished_listing_ids: listingIds,
    changed_by: ctx.caller.email, changed_at: ctx.now.toISOString(),
  });
  if (statusError) throw new Error(statusError.message);
  const { error: banError } = await ctx.db.auth.admin.updateUserById(id, { ban_duration: FOREVER });
  if (banError) throw new Error(banError.message);
  const ended = await ctx.db.rpc("account_end_sessions", { p_user: id });
  if (ended.error) console.warn("sessions could not be ended; the ban still refuses every refresh", ended.error.message);
  await audit(ctx, {
    action: "account.disabled", targetType: "user", targetId: id, oldValue: { status: "active" },
    newValue: { status: "disabled", reason, cancel_lessons: ctx.body.cancel_lessons, unpublished_listings: listingIds.length },
  });
  // A80 (R88): every pause ends open payment holds, so nobody can pay the paused person on a Stripe page already open
  await endOpenHolds(ctx.db, ctx.payments, { id }, ctx.now, "admin");
  const lessons = ctx.body.cancel_lessons
    ? await cancelFutureLessons(ctx.db, ctx.payments, { id }, ctx.now, { cause: "admin", decidedBy: ctx.caller.email, stopOnFailure: false })
    : { cancelled: 0, failed: 0 };
  return { account_status: "disabled", lessons };
}

/** A paused tutor's listing comes back only while the application is still approved (Review Focus 4). */
async function stillApproved(ctx: AdminContext, profileId: string): Promise<boolean> {
  const { data: profile, error } = await ctx.db.from("tutor_profile").select("id, created_by, application_intent, submission_revision").eq("id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return false;
  const { data: reviews, error: reviewError } = await ctx.db.from("tutor_application_review").select("status, reviewed_revision, updated_at")
    .eq("profile_id", profileId).eq("tutor_email", profile.created_by).order("updated_at", { ascending: false }).limit(1);
  if (reviewError) throw new Error(reviewError.message);
  return effectiveApplicationStatus(profile, reviews?.[0] ?? null) === "Approved";
}

/** Spec 3.2: lift the ban, clear the status, republish the listing if it was published before. Cancelled lessons stay cancelled. */
export async function enableAccount(ctx: AdminContext): Promise<Record<string, unknown>> {
  const id = targetUserId(ctx);
  const current = await statusRow(ctx, id);
  if (current?.status !== "disabled") throw new AdminError("NOT_PAUSED", 409, "This account is not paused.");
  await authUser(ctx, id);
  const { error: banError } = await ctx.db.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (banError) throw new Error(banError.message);
  let republished = 0;
  for (const listingId of current.unpublished_listing_ids ?? []) {
    const { data: listing, error } = await ctx.db.from("tutor_public_profile").select("id, profile_id").eq("id", listingId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!listing || !(await stillApproved(ctx, String(listing.profile_id)))) continue;
    const { error: publishError } = await ctx.db.from("tutor_public_profile").update({ is_published: true }).eq("id", listingId);
    if (publishError) throw new Error(publishError.message);
    republished++;
  }
  const { error: deleteError } = await ctx.db.from("account_status").delete().eq("user_id", id);
  if (deleteError) throw new Error(deleteError.message);
  await audit(ctx, { action: "account.enabled", targetType: "user", targetId: id, oldValue: { status: "disabled", reason: current.reason }, newValue: { status: "active", republished_listings: republished } });
  return { account_status: "active", republished };
}

/** "Cancel and refund remaining lessons" for a paused account (after a refused refund, or a later decision). */
export async function cancelPausedLessons(ctx: AdminContext): Promise<Record<string, unknown>> {
  const id = targetUserId(ctx);
  if ((await statusRow(ctx, id))?.status !== "disabled") throw new AdminError("NOT_PAUSED", 409, "This account is not paused.");
  // each press is a new attempt, so Stripe does not replay an earlier refusal; two presses at once share the number
  const { count, error: countError } = await ctx.db.from("admin_audit_log").select("id", { count: "exact", head: true })
    .eq("target_id", id).in("action", ["account.disabled", "account.lessons_cancelled"]);
  if (countError) throw new Error(countError.message);
  const lessons = await cancelFutureLessons(ctx.db, ctx.payments, { id }, ctx.now, { cause: "admin", decidedBy: ctx.caller.email, stopOnFailure: false, attempt: Math.max(1, count ?? 1) });
  if (lessons.cancelled || lessons.failed) await audit(ctx, { action: "account.lessons_cancelled", targetType: "user", targetId: id, oldValue: null, newValue: lessons });
  return { lessons };
}

/** The admin Bookings page: confirmed lessons where the learner or the tutor is paused, including ones that already started (review, Important 2). */
export async function pausedLessons(ctx: AdminContext): Promise<Record<string, unknown>> {
  const { data: rows, error } = await ctx.db.from("account_status").select("user_id").eq("status", "disabled").limit(5000);
  if (error) throw new Error(error.message);
  const paused = new Set((rows ?? []).map((r) => String(r.user_id)));
  if (!paused.size) return { lessons: [] };
  const list = `(${[...paused].join(",")})`;
  const { data, error: bookingError } = await ctx.db.from("booking").select("id, start_at, learner_id, tutor_id, price_cents")
    .eq("status", "confirmed").or(`learner_id.in.${list},tutor_id.in.${list}`).order("start_at").limit(200);
  if (bookingError) throw new Error(bookingError.message);
  const lessons = [];
  for (const b of data ?? []) {
    const [tutor, learnerPerson] = await Promise.all([b.tutor_id ? tutorInfo(ctx.db, b.tutor_id) : null, b.learner_id ? person(ctx.db, b.learner_id) : null]);
    lessons.push({
      id: b.id, start_at: new Date(b.start_at).toISOString(), price_cents: b.price_cents,
      tutor_name: tutor?.displayName ?? "Former tutor", learner_name: learnerPerson?.firstName || (b.learner_id ? "Learner" : "Former learner"),
      paused_party: b.learner_id && paused.has(b.learner_id) ? "learner" : "tutor",
    });
  }
  return { lessons };
}
