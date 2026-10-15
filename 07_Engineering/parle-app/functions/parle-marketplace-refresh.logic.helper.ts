// Refresh logic for the published tutor listings; split out of parle-marketplace-refresh.ts (backend Plan 3) so a
// Supabase scheduled job can run it without Buildy's Deno.cron.
import {
  approvedPublicContentRefreshPatch,
  approvedPublicProfileEditsFromRow,
  effectiveApplicationStatus,
  isReviewSnapshotFresh,
  publicReviewSnapshot,
  safePublicAvailability,
  safePublicBookingProjection,
} from "./parle-marketplace.helper.ts";

type Row = Record<string, unknown> & { id?: string; created_by?: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromResponse(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isObject) as Row[];
  if (isObject(value) && Array.isArray(value.data)) return value.data.filter(isObject) as Row[];
  return [];
}

function entityFor(client: any, name: string): any {
  const entity = (client.entities as Record<string, any>)[name];
  if (!entity?.filter || !entity?.update) throw new Error("Marketplace refresh entity is unavailable.");
  return entity;
}

async function rows(client: any, name: string, filters: Record<string, unknown>, sort = "-created_at", limit = 500): Promise<Row[]> {
  return recordsFromResponse(await entityFor(client, name).filter(filters, sort, limit));
}

export async function refreshPublishedListings(client: any): Promise<{
  refreshed: number;
  repairedTutorLinks: number;
  linkVerificationFailures: number;
  unpublished: number;
  failed: number;
}> {
  const listings = await rows(client, "tutor_public_profile", { is_published: true }, "-updated_at", 1000);
  let refreshed = 0;
  let repairedTutorLinks = 0;
  let linkVerificationFailures = 0;
  let unpublished = 0;
  let failed = 0;

  for (const listing of listings) {
    const profileId = typeof listing.profile_id === "string" ? listing.profile_id : "";
    try {
      if (!profileId || !listing.id) {
        if (listing.id) await entityFor(client, "tutor_public_profile").update(listing.id, { is_published: false });
        unpublished += 1;
        continue;
      }
      const profiles = await rows(client, "tutor_profile", { id: profileId }, "-created_at", 10);
      const profile = profiles.find((row) => row.id === profileId);
      const tutorUserId = typeof profile?.user_id === "string" ? profile.user_id : "";
      if (!profile || !tutorUserId || typeof profile.created_by !== "string" || profile.application_intent !== "submitted") {
        await entityFor(client, "tutor_public_profile").update(listing.id, { is_published: false });
        unpublished += 1;
        continue;
      }
      const reviews = await rows(client, "tutor_application_review", { profile_id: profileId, tutor_email: profile.created_by }, "-updated_at", 20);
      const review = reviews.find((row) => row.profile_id === profileId && row.tutor_email === profile.created_by);
      if (!review || effectiveApplicationStatus(profile, review) !== "Approved" || !isReviewSnapshotFresh(profile.updated_at, review.reviewed_profile_updated_at)) {
        await entityFor(client, "tutor_public_profile").update(listing.id, { is_published: false });
        unpublished += 1;
        continue;
      }

      const [ruleRows, exceptionRows, settingRows, reviewRows, replyRows, bookingRows, editRows] = await Promise.all([
        rows(client, "availability_rule", { profile_id: profileId, user_id: tutorUserId }, "day_of_week", 100),
        rows(client, "availability_exception", { profile_id: profileId, user_id: tutorUserId }, "date_local", 300),
        rows(client, "tutor_booking_settings", { tutor_profile_id: profileId, tutor_user_id: tutorUserId }, "-updated_at", 20),
        rows(client, "tutor_review", { profile_id: profileId, tutor_email: profile.created_by }, "-created_at", 1000),
        rows(client, "tutor_review_reply", { profile_id: profileId, tutor_email: profile.created_by }, "created_at", 1000),
        rows(client, "booking", { tutor_profile_id: profileId, tutor_user_id: tutorUserId, status: "confirmed" }, "start_time_utc", 1000),
        rows(client, "tutor_profile_public_edits", { profile_id: profileId, user_id: tutorUserId, created_by: profile.created_by }, "-updated_at", 20),
      ]);
      const owns = (row: Row) => row.profile_id === profileId && row.user_id === tutorUserId && row.created_by === profile.created_by;
      const ownsSettings = (row: Row) => row.tutor_profile_id === profileId && row.tutor_user_id === tutorUserId && row.created_by === profile.created_by;
      const ownedRules = ruleRows.filter(owns);
      const ownedExceptions = exceptionRows.filter(owns);
      const settings = settingRows.find(ownsSettings);
      const availability = safePublicAvailability(ownedRules, ownedExceptions);
      const snapshot = publicReviewSnapshot(reviewRows, replyRows, profileId, profile.created_by);
      const busyIntervals = bookingRows
        .filter((row) => row.tutor_profile_id === profileId && row.tutor_user_id === tutorUserId && row.status === "confirmed")
        .flatMap((row) => {
          const start = Date.parse(typeof row.start_time_utc === "string" ? row.start_time_utc : "");
          const end = Date.parse(typeof row.end_time_utc === "string" ? row.end_time_utc : "");
          return Number.isFinite(start) && Number.isFinite(end) && end > start
            ? [{ start_utc: new Date(start).toISOString(), end_utc: new Date(end).toISOString() }]
            : [];
        })
        .sort((left, right) => Date.parse(left.start_utc) - Date.parse(right.start_utc))
        .slice(0, 1000);
      const bookingSchedule = safePublicBookingProjection(ownedRules, ownedExceptions, settings ?? null, busyIntervals);
      const savedEditValues = editRows
        .map((row) => approvedPublicProfileEditsFromRow(row, profileId, tutorUserId, String(profile.created_by)))
        .find((value) => value !== null) ?? null;
      const approvedContentPatch = savedEditValues ? approvedPublicContentRefreshPatch(listing, savedEditValues) : null;
      const repairTutorLink = listing.tutor_user_id !== tutorUserId;
      await entityFor(client, "tutor_public_profile").update(listing.id, {
        tutor_user_id: tutorUserId,
        ...(approvedContentPatch ?? {}),
        availability_json: JSON.stringify(availability),
        booking_schedule_json: JSON.stringify(bookingSchedule),
        reviews_json: JSON.stringify(snapshot.reviews),
        rating_summary_json: snapshot.ratingSummary ? JSON.stringify(snapshot.ratingSummary) : "",
      });
      refreshed += 1;

      if (repairTutorLink) {
        try {
          const updatedListings = await rows(client, "tutor_public_profile", { id: listing.id }, "-updated_at", 5);
          if (updatedListings.some((row) => row.id === listing.id && row.tutor_user_id === tutorUserId)) repairedTutorLinks += 1;
          else linkVerificationFailures += 1;
        } catch {
          linkVerificationFailures += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }
  return { refreshed, repairedTutorLinks, linkVerificationFailures, unpublished, failed };
}
