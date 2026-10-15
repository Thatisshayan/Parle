import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Caller = { id: string; email: string; role: "admin" | "learner" | "tutor" };

/** The verified user behind the request's bearer token, or null (no token, bad token, or email not yet confirmed). */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  const role = (data.user.app_metadata as any)?.role;
  return { id: data.user.id, email: data.user.email ?? "", role: role === "admin" || role === "tutor" ? role : "learner" };
}
