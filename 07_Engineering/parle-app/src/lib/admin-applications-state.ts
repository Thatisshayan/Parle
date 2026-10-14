export const APPLICATION_STATUSES = [
  "Draft",
  "Submitted",
  "In review",
  "Approved",
  "Needs changes",
  "Rejected",
  "Suspended",
] as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export type DecisionNotificationState = "queued" | "sent";

export interface SavedDecisionProjection {
  profile_id: string;
  status: ApplicationStatus;
  last_decision_at: string;
  latest_comment: string;
  notification_state: DecisionNotificationState;
}

export interface ApplicationDecisionRow {
  id: string;
  status: ApplicationStatus;
  latest_comment?: string;
  last_decision_at?: string;
  notification_state?: string;
}

export interface SelectedApplicationDecision {
  profile: { id?: string };
  status: ApplicationStatus;
  review: {
    status?: ApplicationStatus;
    latest_comment?: string;
    notification_state?: string;
  };
}

export type ApplicationStatusCounts = { all: number } & Record<ApplicationStatus, number>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSavedDecisionProjection(value: unknown, expectedProfileId: string): SavedDecisionProjection | null {
  if (!isObject(value) || !expectedProfileId) return null;
  const status = value.status;
  const lastDecisionAt = value.last_decision_at;
  const notificationState = value.notification_state;
  if (
    value.profile_id !== expectedProfileId ||
    typeof status !== "string" || !APPLICATION_STATUSES.includes(status as ApplicationStatus) ||
    typeof lastDecisionAt !== "string" || !Number.isFinite(Date.parse(lastDecisionAt)) ||
    typeof value.latest_comment !== "string" ||
    (notificationState !== "queued" && notificationState !== "sent")
  ) return null;

  return {
    profile_id: expectedProfileId,
    status: status as ApplicationStatus,
    last_decision_at: lastDecisionAt,
    latest_comment: value.latest_comment,
    notification_state: notificationState,
  };
}

export function applySavedDecisionToApplications<T extends ApplicationDecisionRow>(
  applications: readonly T[],
  decision: SavedDecisionProjection,
): T[] {
  return applications.map((application) => application.id === decision.profile_id
    ? {
        ...application,
        status: decision.status,
        latest_comment: decision.latest_comment,
        last_decision_at: decision.last_decision_at,
        notification_state: decision.notification_state,
      } as T
    : application);
}

export function applySavedDecisionToSelected<T extends SelectedApplicationDecision>(
  selected: T | null,
  decision: SavedDecisionProjection,
): T | null {
  if (!selected || selected.profile.id !== decision.profile_id) return selected;
  return {
    ...selected,
    status: decision.status,
    review: {
      ...selected.review,
      status: decision.status,
      latest_comment: decision.latest_comment,
      notification_state: decision.notification_state,
    },
  } as T;
}

export function countApplicationsByStatus(
  applications: readonly Pick<ApplicationDecisionRow, "status">[],
): ApplicationStatusCounts {
  const counts: ApplicationStatusCounts = {
    all: applications.length,
    Draft: 0,
    Submitted: 0,
    "In review": 0,
    Approved: 0,
    "Needs changes": 0,
    Rejected: 0,
    Suspended: 0,
  };
  for (const application of applications) counts[application.status] += 1;
  return counts;
}

/** Apply UI state only after the decision request returns a valid server-saved projection. */
export async function saveAndApplyAdminDecision<T>(
  save: () => Promise<unknown>,
  expectedProfileId: string,
  onSaved: (decision: SavedDecisionProjection) => T,
): Promise<{ decision: SavedDecisionProjection; value: T }> {
  const response = await save();
  const savedDecision = isObject(response) ? response.saved_decision : null;
  const decision = parseSavedDecisionProjection(savedDecision, expectedProfileId);
  if (!decision) throw new Error("REVIEW_SAVE_FAILED");
  return { decision, value: onSaved(decision) };
}
