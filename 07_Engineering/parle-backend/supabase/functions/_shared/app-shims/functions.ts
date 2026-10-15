import { current } from "./context.ts";

/** Server stand-in for the app's @/functions: calls the other functions with the current caller's token. */
const BACKGROUND_AI = new Set(["generate_practice_content"]);

async function call(name: string, payload: Record<string, unknown> = {}) {
  const deadline = current().aiDeadline;
  if (deadline && BACKGROUND_AI.has(String(payload.action)) && Date.now() > deadline) {
    // The plan's AI time budget is used up: the engine falls back to the approved bank (decision #49).
    throw new Error("API request failed: AI_TIME_BUDGET_USED");
  }
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
