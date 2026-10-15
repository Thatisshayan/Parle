import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** true when this request is within the limit; counts the request either way. */
export async function takeRateLimit(db: SupabaseClient, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc("take_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data === true;
}

/**
 * The caller's address as the gateway saw it: Cloudflare's cf-connecting-ip when present, otherwise the LAST
 * x-forwarded-for entry (the one our gateway appended). Earlier entries are written by the caller and can be faked.
 * Which header Supabase's production gateway sets is confirmed in Plan 4 (S29 stays open until then).
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return chain.at(-1) || req.headers.get("x-real-ip")?.trim() || "unknown";
}
