import { supabase } from "@/lib/backend/client";
import * as auth from "@/lib/backend/auth";
import type { TranslationKey } from "@/lib/i18n";

/** Sign-in helpers on Supabase Auth (backend Plan 2); same names and call shapes the pages used with Buildy. */
export const signIn = (email: string, password: string) => auth.signInWithPassword(supabase, email, password);
/** Creates the account; the user must then enter the emailed 6-digit code (verifySignupCode). */
export const signUp = (name: string, email: string, password: string) => auth.signUpWithCode(supabase, name, email, password);
/** Checks the code, then sets the password (and name) just typed, so an earlier unverified sign-up of the address cannot keep its own. */
export const verifySignupCode = (email: string, code: string, password: string, fullName?: string) =>
  auth.verifySignupCode(supabase, email, code, password, fullName);
export const resendSignupCode = async (email: string) => {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw new Error(error.message);
};
export const requestPasswordReset = (email: string) =>
  auth.requestReset(supabase, email, `${window.location.origin}/reset-password`).then(() => ({ success: true }));
export const resetPassword = (token: string, password: string) =>
  auth.resetWithToken(supabase, token, password).then(() => ({ success: true }));

/** Keeps the SDK's optional post-login destination on this origin. */
export function afterLoginPath(): string {
  const raw = new URLSearchParams(window.location.search).get("from_url");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export function authErrorKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/invalid.*credential|email or password|incorrect password|user not found/.test(message)) {
    return "auth.error.invalidCredentials";
  }
  if (/already.*(registered|exist)|email.*(taken|exist)|user.*already/.test(message)) {
    return "auth.error.emailExists";
  }
  if (/email not confirmed/.test(message)) return "auth.error.emailNotConfirmed";
  if (/expired|used.*token|invalid.*token|reset.*link/.test(message)) {
    return "auth.error.resetExpired";
  }
  if (/password/.test(message)) return "auth.error.password";
  if (/network|fetch|connection|timeout/.test(message)) return "auth.error.network";
  return "auth.error.generic";
}

export function passwordMeetsRequirements(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
