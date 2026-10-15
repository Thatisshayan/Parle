/** Digits only, exactly six, or null (the email code Supabase sends on sign-up). */
export function normaliseCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
