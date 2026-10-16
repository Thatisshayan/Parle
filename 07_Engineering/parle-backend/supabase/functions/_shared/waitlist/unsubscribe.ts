import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { emailFromToken } from "./token.ts";
import { unsubscribeSecret } from "./config.ts";

/** Records the unsubscribe a token stands for; null for a forged or damaged token (spec 4.5). */
export async function recordUnsubscribe(db: SupabaseClient, token: string, source: "link" | "header"): Promise<{ status: "recorded" | "already"; email: string } | null> {
  const email = await emailFromToken(unsubscribeSecret(), token);
  if (!email) return null;
  const { data, error } = await db.rpc("waitlist_record_unsubscribe", { p_email: email, p_source: source });
  if (error) throw new Error(error.message);
  return data === "recorded" || data === "already" ? { status: data, email } : null;
}
