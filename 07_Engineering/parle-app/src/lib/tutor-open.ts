/**
 * Plan 11 (A87, R95): a tutor session request abandoned by leaving or reloading the page is not an error to report
 * (the browser cancels the fetch with "Failed to fetch"); an AbortError is the same.
 */
export const isAbandonedRequest = (error: unknown, leaving: boolean): boolean =>
  leaving || (error as { name?: unknown } | null)?.name === "AbortError";

/** Plan 12 (R128): the server is still answering this learner's previous message (one AI reply at a time). */
export const isReplyInProgress = (payload: Record<string, unknown>): boolean => payload.error_code === "REPLY_IN_PROGRESS";
