import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** true when this request is within the limit; counts the request either way. */
export async function takeRateLimit(db: SupabaseClient, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc("take_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data === true;
}

/** First address in x-forwarded-for. Which header is trustworthy behind Supabase's gateway is verified in Plan 4. */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}
