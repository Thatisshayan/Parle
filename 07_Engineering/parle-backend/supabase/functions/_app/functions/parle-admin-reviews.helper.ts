// GENERATED from parle-app/functions/parle-admin-reviews.helper.ts by scripts/sync-app-code.ts. Do not edit.
import {
  AdminActionError,
  assertAdministrator,
  type AdminActor,
  writeAdminAudit,
} from "./parle-admin-settings.helper.ts";

export const ADMIN_TUTOR_REVIEWS_PAGE_SIZE = 200;
export const ADMIN_TUTOR_REVIEW_HIDE_REASON_LIMIT = 1000;

const REVIEW_FIELDS = [
  "id",
  "profile_id",
  "tutor_email",
  "stars",
  "comment",
  "is_test_review",
  "is_visible",
  "created_at",
  "created_by",
];
const TUTOR_PROFILE_FIELDS = ["id", "created_by", "display_name"];
const TUTOR_REPLY_FIELDS = ["id", "profile_id", "review_id", "tutor_email", "reply_text", "created_by", "created_at"];

type Row = Record<string, unknown> & { id?: unknown };
type ReviewOperation = "list" | "hide" | "restore";
type Entity = {
  filter: (...args: unknown[]) => Promise<unknown>;
  update?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string, status = 400): never {
  throw new AdminActionError(code, status);
}

function entityFor(client: unknown, name: string, methods: Array<"filter" | "update">, errorCode = "REVIEWS_UNAVAILABLE"): Entity {
  if (!isObject(client) || !isObject(client.entities)) {
    throw new AdminActionError(errorCode, 503);
  }
  const entity = client.entities[name];
  if (!isObject(entity) || methods.some((method) => typeof entity[method] !== "function")) {
    throw new AdminActionError(errorCode, 503);
  }
  return entity as unknown as Entity;
}

function recordsFromResponse(value: unknown, errorCode: string): Row[] {
  const candidate = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.data)
      ? value.data
      : null;
  if (!candidate || candidate.some((row) => !isObject(row))) {
    throw new AdminActionError(errorCode, 503);
  }
  return candidate as Row[];
}

function savedText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function safeDisplayName(value: unknown, email?: string): string {
  if (typeof value !== "string") return "";
  const name = value
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!name || (email && name.toLowerCase().includes(email.toLowerCase()))) return "";
  return name;
}

function safeSingleLine(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, " ")
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeMultiline(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximum);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function safeTimestamp(value: unknown): string {
  const parsed = timestamp(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function newestFirst(left: Row, right: Row): number {
  const leftTime = timestamp(left.created_at);
  const rightTime = timestamp(right.created_at);
  if (leftTime !== rightTime) return rightTime > leftTime ? 1 : -1;
  return savedText(right.id).localeCompare(savedText(left.id));
}

async function readAllRows(
  client: unknown,
  entityName: string,
  fields: string[],
  sort: string,
  errorCode: string,
): Promise<Row[]> {
  const entity = entityFor(client, entityName, ["filter"], errorCode);
  const allRows: Row[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    let response: unknown;
    try {
      response = await entity.filter({}, sort, ADMIN_TUTOR_REVIEWS_PAGE_SIZE, offset, fields);
    } catch {
      console.error("Parle administrator review data could not be read.", { entity: entityName });
      throw new AdminActionError(errorCode, 503);
    }

    let page: Row[];
    try {
      page = recordsFromResponse(response, errorCode);
    } catch {
      console.error("Parle administrator review data returned an invalid page.", { entity: entityName });
      throw new AdminActionError(errorCode, 503);
    }
    if (page.length > ADMIN_TUTOR_REVIEWS_PAGE_SIZE) {
      throw new AdminActionError(errorCode, 503);
    }

    for (const row of page) {
      const id = savedText(row.id);
      if (!id || seenIds.has(id)) {
        console.error("Parle administrator review data contained a missing or duplicate record id.", { entity: entityName });
        throw new AdminActionError(errorCode, 503);
      }
      seenIds.add(id);
    }

    allRows.push(...page);
    if (page.length < ADMIN_TUTOR_REVIEWS_PAGE_SIZE) break;
    offset += page.length;
  }

  return allRows;
}

function requestedLearnerEmails(reviews: readonly Row[]): Set<string> {
  const emails = new Set<string>();
  for (const review of reviews) {
    if (review.is_test_review === true) continue;
    const email = normalizedEmail(review.created_by);
    if (email) emails.add(email);
  }
  return emails;
}

function accountRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isObject) as Row[];
  if (isObject(value) && Array.isArray(value.data)) return value.data.filter(isObject) as Row[];
  return [];
}

async function readLearnerNames(client: unknown, reviews: readonly Row[]): Promise<Map<string, string>> {
  const requestedEmails = requestedLearnerEmails(reviews);
  const names = new Map<string, string>();
  if (requestedEmails.size === 0 || !isObject(client) || !isObject(client.auth) || typeof client.auth.list !== "function") {
    return names;
  }

  let response: unknown;
  try {
    response = await client.auth.list();
  } catch {
    console.error("Parle administrator review learner names could not be resolved.");
    return names;
  }

  for (const account of accountRows(response)) {
    const email = normalizedEmail(account.email);
    if (!email || !requestedEmails.has(email) || names.has(email)) continue;
    const name = safeDisplayName(account.full_name, email);
    if (name) names.set(email, name);
  }
  return names;
}

function tutorNamesFromProfiles(reviews: readonly Row[], profiles: readonly Row[]): Map<string, string> {
  const expectedOwnerByProfile = new Map<string, string>();
  for (const review of reviews) {
    const profileId = savedText(review.profile_id);
    const owner = normalizedEmail(review.tutor_email);
    if (profileId && owner && !expectedOwnerByProfile.has(profileId)) expectedOwnerByProfile.set(profileId, owner);
  }

  const names = new Map<string, string>();
  for (const profile of profiles) {
    const profileId = savedText(profile.id);
    const expectedOwner = expectedOwnerByProfile.get(profileId);
    if (!profileId || !expectedOwner || normalizedEmail(profile.created_by) !== expectedOwner || names.has(profileId)) continue;
    const name = safeDisplayName(profile.display_name, expectedOwner);
    if (name) names.set(profileId, name);
  }
  return names;
}

function reviewReplyKey(profileId: string, reviewId: string): string {
  return `${profileId}\u0000${reviewId}`;
}

function tutorRepliesFromRows(reviews: readonly Row[], replies: readonly Row[]): Map<string, string> {
  const reviewOwners = new Map<string, string>();
  for (const review of reviews) {
    const profileId = savedText(review.profile_id);
    const reviewId = savedText(review.id);
    const tutorEmail = normalizedEmail(review.tutor_email);
    if (profileId && reviewId && tutorEmail) reviewOwners.set(reviewReplyKey(profileId, reviewId), tutorEmail);
  }

  const orderedReplies = [...replies].sort((left, right) => {
    const leftTime = timestamp(left.created_at);
    const rightTime = timestamp(right.created_at);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return savedText(left.id).localeCompare(savedText(right.id));
  });
  const byReview = new Map<string, string>();
  for (const reply of orderedReplies) {
    const profileId = savedText(reply.profile_id);
    const reviewId = savedText(reply.review_id);
    const key = reviewReplyKey(profileId, reviewId);
    const expectedTutorEmail = reviewOwners.get(key);
    if (!profileId || !reviewId || !expectedTutorEmail || normalizedEmail(reply.tutor_email) !== expectedTutorEmail
      || normalizedEmail(reply.created_by) !== expectedTutorEmail || byReview.has(key)) continue;
    const text = safeMultiline(reply.reply_text, 1200);
    if (text) byReview.set(key, text);
  }
  return byReview;
}

function toAdminReview(
  row: Row,
  tutorNames: Map<string, string>,
  learnerNames: Map<string, string>,
  tutorReplies: Map<string, string>,
): Record<string, unknown> {
  const id = savedText(row.id);
  const profileId = savedText(row.profile_id);
  const isTestReview = row.is_test_review === true;
  const learnerEmail = normalizedEmail(row.created_by);
  const tutorReply = tutorReplies.get(reviewReplyKey(profileId, id)) ?? "";
  return {
    id,
    created_at: safeTimestamp(row.created_at),
    tutor_display_name: tutorNames.get(profileId) ?? "",
    learner_display_name: isTestReview ? "" : learnerNames.get(learnerEmail) ?? "",
    stars: Number(row.stars),
    comment: safeMultiline(row.comment, 700),
    tutor_reply: tutorReply,
    is_test_review: isTestReview,
    is_visible: row.is_visible !== false,
  };
}

async function adminListTutorReviews(client: unknown): Promise<Record<string, unknown>> {
  const reviews = await readAllRows(client, "tutor_review", REVIEW_FIELDS, "-created_at", "REVIEWS_READ_FAILED");
  const orderedReviews = reviews.sort(newestFirst);
  if (orderedReviews.length === 0) {
    return { status: "complete", operation: "list", reviews: [], count: 0, hidden_count: 0 };
  }

  const [profiles, replies, learnerNames] = await Promise.all([
    readAllRows(client, "tutor_profile", TUTOR_PROFILE_FIELDS, "-updated_at", "REVIEWS_READ_FAILED"),
    readAllRows(client, "tutor_review_reply", TUTOR_REPLY_FIELDS, "created_at", "REVIEWS_READ_FAILED"),
    readLearnerNames(client, orderedReviews),
  ]);
  const tutorNames = tutorNamesFromProfiles(orderedReviews, profiles);
  const tutorReplies = tutorRepliesFromRows(orderedReviews, replies);
  const mapped = orderedReviews.map((review) => toAdminReview(review, tutorNames, learnerNames, tutorReplies));
  return {
    status: "complete",
    operation: "list",
    reviews: mapped,
    count: mapped.length,
    hidden_count: mapped.filter((review) => review.is_visible === false).length,
  };
}

function validReviewId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > 160) throw new AdminActionError("REVIEW_ID_INVALID", 400);
  return id;
}

function hideReason(value: unknown): string {
  if (typeof value !== "string") throw new AdminActionError("REVIEW_HIDE_REASON_REQUIRED", 400);
  const reason = value
    .replace(/\r\n?/g, "\n")
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (!reason) throw new AdminActionError("REVIEW_HIDE_REASON_REQUIRED", 400);
  if (reason.length > ADMIN_TUTOR_REVIEW_HIDE_REASON_LIMIT) {
    throw new AdminActionError("REVIEW_HIDE_REASON_TOO_LONG", 400);
  }
  return reason;
}

async function readReviewForChange(client: unknown, reviewId: string): Promise<{ entity: Entity; review: Row }> {
  const entity = entityFor(client, "tutor_review", ["filter", "update"]);
  let matches: Row[];
  try {
    matches = recordsFromResponse(
      await entity.filter({ id: reviewId }, "-created_at", 10, 0, REVIEW_FIELDS),
      "REVIEWS_READ_FAILED",
    );
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    console.error("Parle administrator tutor review could not be read.");
    throw new AdminActionError("REVIEWS_READ_FAILED", 503);
  }
  const review = matches.find((row) => savedText(row.id) === reviewId);
  if (!review) throw new AdminActionError("REVIEW_NOT_FOUND", 404);
  if (!savedText(review.profile_id) || !normalizedEmail(review.tutor_email)) {
    throw new AdminActionError("REVIEW_RECORD_INVALID", 503);
  }
  return { entity, review };
}

async function changeReviewVisibility(
  client: unknown,
  actor: AdminActor,
  input: Record<string, unknown>,
  operation: "hide" | "restore",
): Promise<Record<string, unknown>> {
  const reviewId = validReviewId(input.review_id);
  const reason = operation === "hide" ? hideReason(input.reason) : "";
  const { entity, review } = await readReviewForChange(client, reviewId);
  const wasVisible = review.is_visible !== false;

  if (operation === "hide" && !wasVisible) throw new AdminActionError("REVIEW_ALREADY_HIDDEN", 409);
  if (operation === "restore" && wasVisible) throw new AdminActionError("REVIEW_NOT_HIDDEN", 409);

  const isVisible = operation === "restore";
  try {
    await entity.update!(reviewId, { is_visible: isVisible });
  } catch {
    console.error("Parle administrator tutor review visibility could not be changed.", { reviewId, operation });
    throw new AdminActionError("REVIEW_SAVE_FAILED", 503);
  }

  try {
    await writeAdminAudit(client, actor, {
      action: operation === "hide" ? "tutor_review.hidden" : "tutor_review.restored",
      target_type: "tutor_review",
      target_id: reviewId,
      old_value: { is_visible: wasVisible },
      new_value: operation === "hide" ? { is_visible: false, hide_reason: reason } : { is_visible: true },
    });
  } catch {
    try {
      await entity.update!(reviewId, { is_visible: wasVisible });
    } catch {
      console.error("Parle administrator tutor review audit failed and its visibility rollback could not be confirmed.", { reviewId, operation });
      throw new AdminActionError("REVIEW_AUDIT_PARTIAL", 503);
    }
    throw new AdminActionError("REVIEW_AUDIT_FAILED", 503);
  }

  return {
    status: "complete",
    operation,
    changed: true,
    audit_status: "written",
    review: {
      id: reviewId,
      profile_id: savedText(review.profile_id),
      is_visible: isVisible,
    },
  };
}

/** Handles listing, hiding, and restoring reviews only after the authenticated administrator check. */
export async function adminManageTutorReviewsAction(
  client: unknown,
  actor: AdminActor,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertAdministrator(actor);
  const operation = input.operation as ReviewOperation;
  if (operation === "list") return await adminListTutorReviews(client);
  if (operation === "hide" || operation === "restore") {
    return await changeReviewVisibility(client, actor, input, operation);
  }
  fail("REVIEW_OPERATION_INVALID", 400);
}
