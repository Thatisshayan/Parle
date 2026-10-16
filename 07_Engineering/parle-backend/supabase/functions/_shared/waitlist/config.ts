import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { unsubscribeToken } from "./token.ts";

/** The sender's postal or contact address for the footer (Canada's anti-spam law). OPEN ITEM: typed by the founder. */
export const ADDRESS_KEY = "sender_postal_address";

export async function postalAddress(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.from("app_setting").select("value").eq("key", ADDRESS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return "";
  try {
    const v = JSON.parse(String(data.value));
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return String(data.value ?? "").trim();
  }
}

/** Where the unsubscribe page lives: parle.buzz (the static site before launch, the app after; ruling 9). */
export const siteUrl = () => (Deno.env.get("WAITLIST_SITE_URL") ?? "").trim().replace(/\/+$/, "") || "https://parle.buzz";
export const functionsUrl = () => `${(Deno.env.get("PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "")}/functions/v1`;

export function unsubscribeSecret(): string {
  const secret = Deno.env.get("WAITLIST_UNSUBSCRIBE_SECRET") ?? "";
  if (secret.length < 32) throw new Error("WAITLIST_UNSUBSCRIBE_SECRET is not set");
  return secret;
}

export async function unsubscribeLinks(email: string): Promise<{ page: string; oneClick: string }> {
  const t = encodeURIComponent(await unsubscribeToken(unsubscribeSecret(), email));
  return { page: `${siteUrl()}/unsubscribe?t=${t}`, oneClick: `${functionsUrl()}/parle-waitlist-unsubscribe?t=${t}` };
}

/** RFC 8058 one-click unsubscribe, plus the mailto option (spec 4.4). */
export const unsubscribeHeaders = (oneClick: string): Record<string, string> => ({
  "List-Unsubscribe": `<${oneClick}>, <mailto:unsubscribe@parle.buzz?subject=unsubscribe>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});
