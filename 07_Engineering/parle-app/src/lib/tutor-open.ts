/**
 * Plan 11 (A87, R95): a tutor session request abandoned by leaving or reloading the page is not an error to report
 * (the browser cancels the fetch with "Failed to fetch"); an AbortError is the same.
 */
export const isAbandonedRequest = (error: unknown, leaving: boolean): boolean =>
  leaving || (error as { name?: unknown } | null)?.name === "AbortError";
