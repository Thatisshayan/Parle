import type { SupabaseClient, User } from "@supabase/supabase-js";

/** The user shape pages expect from Buildy's `User.me()`: role is "administrator" for admins, "user" otherwise. */
export type ParleUser = { id: string; email: string; full_name: string | null; role: "administrator" | "user" };

export function toParleUser(u: Pick<User, "id" | "email" | "user_metadata" | "app_metadata">): ParleUser {
  const name = (u.user_metadata as any)?.full_name;
  return {
    id: u.id,
    email: u.email ?? "",
    full_name: typeof name === "string" && name.trim() ? name : null,
    role: (u.app_metadata as any)?.role === "admin" ? "administrator" : "user",
  };
}

const raise = (e: { message?: string } | null) => { if (e) throw new Error(e.message ?? "Something went wrong. Please try again."); };

export async function signUpWithCode(c: SupabaseClient, name: string, email: string, password: string) {
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { full_name: name } } });
  raise(error);
  if (data.user && (data.user.identities ?? []).length === 0) throw new Error("User already registered");
  return { pendingVerification: true as const };
}

export async function verifySignupCode(c: SupabaseClient, email: string, code: string): Promise<ParleUser> {
  const { data, error } = await c.auth.verifyOtp({ email, token: code, type: "signup" });
  raise(error);
  return toParleUser(data.user!);
}

export async function signInWithPassword(c: SupabaseClient, email: string, password: string): Promise<ParleUser> {
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  raise(error);
  return toParleUser(data.user);
}

export async function requestReset(c: SupabaseClient, email: string, redirectTo: string) {
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
  raise(error);
}

/** Single use: the token hash from the reset email signs in once, sets the password, then signs out. */
export async function resetWithToken(c: SupabaseClient, tokenHash: string, password: string) {
  const { error } = await c.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  raise(error);
  const upd = await c.auth.updateUser({ password });
  raise(upd.error);
  await c.auth.signOut();
}

export async function me(c: SupabaseClient): Promise<ParleUser> {
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  return toParleUser(data.user);
}

export async function updateMyName(c: SupabaseClient, fullName: string): Promise<ParleUser> {
  const { data, error } = await c.auth.updateUser({ data: { full_name: fullName } });
  raise(error);
  return toParleUser(data.user!);
}

export async function isAuthenticated(c: SupabaseClient): Promise<boolean> {
  const { data } = await c.auth.getUser();
  return !!data.user;
}

/** Signs out and removes every auth and onboarding key from browser storage (S16, S28). */
export async function logout(c: SupabaseClient) {
  await c.auth.signOut();
  if (typeof window !== "undefined") {
    for (const k of Object.keys(window.localStorage)) if (/^(parle-|superdev_|sb-)/.test(k)) window.localStorage.removeItem(k);
    window.sessionStorage.removeItem("parle-onboarding-session-v1");
  }
}
