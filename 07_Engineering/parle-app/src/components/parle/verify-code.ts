/** Digits only, exactly six, or null (the email code Supabase sends on sign-up). */
export function normaliseCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export type ResendNote = "auth.verifyResendSent" | "auth.verifyResendTooSoon" | "auth.verifyResendFailed";

/** Which message to show when asking for a new code failed (R14). */
export function resendErrorKey(error: unknown): Exclude<ResendNote, "auth.verifyResendSent"> {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 0;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return status === 429 || /rate limit|security purposes|too many/i.test(message) ? "auth.verifyResendTooSoon" : "auth.verifyResendFailed";
}
