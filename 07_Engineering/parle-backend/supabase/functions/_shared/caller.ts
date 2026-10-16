import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { pausedUser } from "./account-status.ts";

export type Caller = { id: string; email: string; role: "admin" | "learner" | "tutor"; owner: boolean };

/**
 * The verified user behind the request's bearer token, or null (no token, bad token, email not yet confirmed, or a
 * paused account: Plan 8 spec 3.2). `owner` is true only for an administrator whose app_metadata.owner is true
 * (written only with the service key by scripts/prod/set-owner.ts).
 */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at || pausedUser(data.user)) return null;
  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const role = meta.role === "admin" || meta.role === "tutor" ? meta.role : "learner";
  return { id: data.user.id, email: data.user.email ?? "", role, owner: role === "admin" && meta.owner === true };
}
