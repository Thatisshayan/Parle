import { isAuthRetryableFetchError, type SupabaseClient, type User } from "@supabase/supabase-js";

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

/**
 * Verifies the emailed code, then sets the password and name the person just typed and ends every other session.
 * Signing up again with an unconfirmed email keeps the first sign-up's password, so without this anyone who
 * pre-registered the address would own the account once its real owner verified it.
 */
export async function verifySignupCode(c: SupabaseClient, email: string, code: string, password: string, fullName?: string): Promise<ParleUser> {
  const { error } = await c.auth.verifyOtp({ email, token: code, type: "signup" });
  raise(error);
  const name = fullName?.trim();
  const upd = await c.auth.updateUser({ password, ...(name ? { data: { full_name: name } } : {}) });
  if (upd.error && (upd.error as any).code !== "same_password") {
    await c.auth.signOut({ scope: "local" });
    raise(upd.error);
  }
  await c.auth.signOut({ scope: "others" });
  const { data } = await c.auth.getUser();
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
  try {
    const upd = await c.auth.updateUser({ password });
    raise(upd.error);
  } finally {
    // The link signed this browser in; never leave that session behind, whether or not the new password saved.
    await c.auth.signOut({ scope: "local" });
  }
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
  const { data: local, error: localError } = await c.auth.getSession();
  if (localError && isAuthRetryableFetchError(localError)) throw localError;
  if (!local.session) return false;
  const { data, error } = await c.auth.getUser();
  if (data.user) return true;
  // A network failure is not "signed out": callers retry instead of showing the visitor path (R29).
  if (error && isAuthRetryableFetchError(error)) throw error;
  return false;
}

const AUTH_KEYS = /^(parle-|superdev_|sb-)/;
function clearAuthKeys(storage: Storage | undefined) {
  if (!storage) return;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && AUTH_KEYS.test(key)) storage.removeItem(key);
  }
}

/**
 * Signs out (S16, S28, R12): ends the session on the server when it can, always ends it in this browser, removes every
 * auth and onboarding key, then reloads so nothing from the old session stays in memory.
 */
export async function logout(c: SupabaseClient, reloadTo: string | null = "/login") {
  try {
    const { error } = await c.auth.signOut();
    if (error) await c.auth.signOut({ scope: "local" });
  } catch {
    await c.auth.signOut({ scope: "local" }).catch(() => undefined);
  } finally {
    if (typeof window !== "undefined") {
      clearAuthKeys(window.localStorage);
      window.sessionStorage?.removeItem("parle-onboarding-session-v1");
      if (reloadTo) window.location.replace(reloadTo);
    }
  }
}

/** After the server sets the role (ensure_identity), get a token that carries it now (R9). Never blocks the caller. */
export async function refreshRole(c: SupabaseClient): Promise<void> {
  try {
    await c.auth.refreshSession();
  } catch {
    // the next automatic refresh carries the role
  }
}
