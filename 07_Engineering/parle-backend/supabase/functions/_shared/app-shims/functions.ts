import { current } from "./context.ts";

/** Server stand-in for the app's @/functions: calls the other functions with the current caller's token. */
async function call(name: string, payload: Record<string, unknown> = {}) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${current().token}` },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e: any = new Error(`API request failed: ${body.error_code ?? body.error ?? r.status}`);
    e.status = r.status;
    throw e;
  }
  return body;
}
export const parleAssessmentService = (p?: Record<string, unknown>) => call("parle-assessment-service", p);
export const parleMarketplaceService = (p?: Record<string, unknown>) => call("parle-marketplace-service", p);
export const parlePublicLevelCheck = (p?: Record<string, unknown>) => call("parle-public-level-check", p);
export const parleAccountService = (p?: Record<string, unknown>) => call("parle-account-service", p);
export const parlePlanService = (p?: Record<string, unknown>) => call("parle-plan-service", p);
