import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type LimitedBody = { kind: "ok"; text: string } | { kind: "too_large" } | { kind: "invalid" };

/** Read an untrusted request body incrementally and stop as soon as received bytes exceed maxBytes. */
export async function readLimitedRequestText(req: Request, maxBytes: number): Promise<LimitedBody> {
  if (!req.body) return { kind: "ok", text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* the HTTP runtime may already have closed the upload */ }
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { kind: "ok", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

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
