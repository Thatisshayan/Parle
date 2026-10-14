import type { TranslationKey } from "./i18n";

const structuredBillingCodes = new Set([
  "billing_not_allowed",
  "billing_not_configured",
  "test_mode_unavailable",
  "stripe_error",
  "invalid_billing_origin",
  "complimentary_plan_no_billing",
  "subscription_already_active",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function codeFromString(value: string): string | null {
  const text = value.trim();
  if (text === "Authentication required") return "billing_not_allowed";

  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(jsonStart));
    if (isObject(parsed) && typeof parsed.error_code === "string" && structuredBillingCodes.has(parsed.error_code)) {
      return parsed.error_code;
    }
  } catch {
    // The platform SDK prefixes rejected response bodies with a short message.
  }
  return null;
}

function findBillingCode(value: unknown, depth = 0, seen = new Set<object>()): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") return codeFromString(value);
  if (!isObject(value) || seen.has(value)) return null;
  seen.add(value);

  for (const key of ["error_code", "code"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && structuredBillingCodes.has(candidate)) return candidate;
  }
  if (typeof value.message === "string") {
    const fromMessage = codeFromString(value.message);
    if (fromMessage) return fromMessage;
  }
  for (const key of ["result", "data", "response", "body", "cause", "error"]) {
    const nested = findBillingCode(value[key], depth + 1, seen);
    if (nested) return nested;
  }
  return null;
}

/** Recover only known safe codes from service envelopes and the function SDK's thrown errors. */
export function extractBillingErrorCode(error: unknown): string | null {
  return findBillingCode(error);
}

export function checkoutFailureTranslationKey(error: unknown): TranslationKey {
  switch (extractBillingErrorCode(error)) {
    case "billing_not_allowed":
    case "complimentary_plan_no_billing":
      return "learner.plan.checkoutNotAllowed";
    case "billing_not_configured":
    case "invalid_billing_origin":
      return "learner.plan.billingNotConfigured";
    case "test_mode_unavailable":
      return "learner.plan.billingUnavailable";
    case "subscription_already_active":
      return "learner.plan.subscriptionAlreadyActive";
    case "stripe_error":
    default:
      return "learner.plan.checkoutError";
  }
}
