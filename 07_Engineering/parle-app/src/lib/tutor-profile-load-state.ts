import type { TranslationKey } from "./i18n";

export type TutorProfileFailureKind = "not_found" | "error";

export type TutorProfileFailurePresentation = {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  actionKey: TranslationKey;
  destination: string | null;
};

// Missing and unpublished learner listings share the same explicit server error code.
const NOT_FOUND_CODES = new Set(["NOT_FOUND", "PROFILE_NOT_FOUND"]);
const ERROR_VALUE_FIELDS = ["code", "error_code", "errorCode", "error", "message"] as const;
const NESTED_ERROR_FIELDS = ["cause", "context", "data", "details", "response", "result", "body"] as const;
const NOT_FOUND_ENVELOPE_FIELDS = ["code", "error_code", "errorCode", "error"] as const;
const RESPONSE_BODY_FIELDS = ["body", "data", "details", "response", "result", "context", "cause"] as const;
const HTTP_STATUS_FIELDS = ["status", "statusCode", "status_code"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function isNotFoundCode(value: unknown): boolean {
  const code = normalizeCode(value);
  return code !== null && NOT_FOUND_CODES.has(code);
}

// @superdevhq/client drops the HTTP status and wraps the response's exact error code in this message.
function isClientNotFoundMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^API request failed: ([A-Za-z0-9_-]+)$/i.exec(value.trim());
  return Boolean(match && isNotFoundCode(match[1]));
}

function httpErrorStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  for (const field of HTTP_STATUS_FIELDS) {
    const raw = value[field];
    const status = typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d{3}$/.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return null;
}

function hasNotFoundEnvelope(value: unknown): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 64) {
    const current = pending.shift();
    if (typeof current === "string") {
      try { pending.push(JSON.parse(current)); } catch { /* Non-JSON bodies cannot confirm a missing tutor. */ }
      continue;
    }
    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    if (current !== value && httpErrorStatus(current) !== null && httpErrorStatus(current) !== 404) continue;
    if (NOT_FOUND_ENVELOPE_FIELDS.some((field) => isNotFoundCode(current[field]))) return true;
    for (const field of RESPONSE_BODY_FIELDS) {
      if (field in current) pending.push(current[field]);
    }
  }

  return false;
}

type JsonResponseLike = {
  clone: () => { json: () => Promise<unknown> };
  json: () => Promise<unknown>;
  status: number;
};

function isJsonResponseLike(value: unknown): value is JsonResponseLike {
  return isRecord(value)
    && typeof value.status === "number"
    && typeof value.clone === "function"
    && typeof value.json === "function";
}

function findErrorResponse(error: unknown): JsonResponseLike | null {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 64) {
    const current = pending.shift();
    if (isJsonResponseLike(current)) return current;
    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    for (const field of NESTED_ERROR_FIELDS) {
      if (field in current) pending.push(current[field]);
    }
  }

  return null;
}

type HttpStatusEnvelope = { status: number; value: Record<string, unknown> };

function findHttpStatusEnvelope(error: unknown): HttpStatusEnvelope | null {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 64) {
    const current = pending.shift();
    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    const status = httpErrorStatus(current);
    if (status !== null) return { status, value: current };
    for (const field of NESTED_ERROR_FIELDS) {
      if (field in current) pending.push(current[field]);
    }
  }

  return null;
}

/** Classify only exact profile codes, while giving known HTTP failures priority over message text. */
export function tutorProfileLoadFailureKind(error: unknown): TutorProfileFailureKind {
  const response = findErrorResponse(error);
  if (response && response.status >= 400) return "error";

  const statusEnvelope = findHttpStatusEnvelope(error);
  if (statusEnvelope) {
    return statusEnvelope.status === 404 && hasNotFoundEnvelope(statusEnvelope.value) ? "not_found" : "error";
  }

  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 64) {
    const current = pending.shift();
    if (isNotFoundCode(current) || isClientNotFoundMessage(current)) return "not_found";
    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    for (const field of ERROR_VALUE_FIELDS) {
      if (field in current) pending.push(current[field]);
    }
    for (const field of NESTED_ERROR_FIELDS) {
      if (field in current) pending.push(current[field]);
    }
  }

  return "error";
}

/** Read the response body only when its HTTP status and explicit error code agree. */
export async function tutorProfileLoadFailureKindFromError(error: unknown): Promise<TutorProfileFailureKind> {
  const response = findErrorResponse(error);
  if (response && response.status >= 400) {
    if (response.status !== 404) return "error";
    try {
      return hasNotFoundEnvelope(await response.clone().json()) ? "not_found" : "error";
    } catch {
      return "error";
    }
  }

  const statusEnvelope = findHttpStatusEnvelope(error);
  if (statusEnvelope) {
    return statusEnvelope.status === 404 && hasNotFoundEnvelope(statusEnvelope.value) ? "not_found" : "error";
  }

  return tutorProfileLoadFailureKind(error);
}

export function tutorProfileFailurePresentation(
  kind: TutorProfileFailureKind,
  tutorPreview = false,
): TutorProfileFailurePresentation {
  if (kind === "not_found") {
    return {
      titleKey: "tutorProfile.notFoundTitle",
      bodyKey: tutorPreview ? "tutorProfile.previewNotFoundBody" : "tutorProfile.notFoundBody",
      actionKey: tutorPreview ? "tutorProfile.backToDashboard" : "tutorProfile.browseTutors",
      destination: tutorPreview ? "/tutor" : "/learner/tutors",
    };
  }

  return {
    titleKey: "tutorProfile.loadErrorTitle",
    bodyKey: "tutorProfile.loadErrorBody",
    actionKey: "tutorProfile.retry",
    destination: null,
  };
}
