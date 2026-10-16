import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Supabase Auth's ban is in force (Plan 8 spec 3.1: a paused account is banned "far in the future"). */
export function pausedUser(user: { banned_until?: string | null }, now = new Date()): boolean {
  const until = typeof user.banned_until === "string" ? Date.parse(user.banned_until) : NaN;
  return Number.isFinite(until) && until > now.getTime();
}

/** Parle's own record of a paused account (missing row = active). */
export async function isPaused(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("account_status").select("status").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.status === "disabled";
}
