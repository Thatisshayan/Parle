/**
 * Text AI providers (Plan 10, spec 3). Pure: the key and fetch are passed in, so the quality-test script sends exactly
 * the production request. Errors carry the HTTP status only: a provider's error body can repeat the learner's words.
 */
export type ChatCall = { model: string; system: string; prompt: string; json: boolean; signal?: AbortSignal };
export type Route = { provider: "openrouter" | "nvidia"; model: string };

export class ProviderCallError extends Error {
  status: number | "network" | "empty";
  constructor(status: number | "network" | "empty") { super(`AI provider ${status}`); this.status = status; this.name = "ProviderCallError"; }
}

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
/** Every OpenRouter request: only hosts that collect nothing and keep nothing; another such host if one is down. */
export const ZERO_RETENTION = { data_collection: "deny", zdr: true, allow_fallbacks: true } as const;

/** `openrouter:<id>` goes to OpenRouter; a value without a prefix is an NVIDIA model (local comparison only). */
export function routeModel(setting: string): Route {
  const value = setting.trim();
  return value.startsWith("openrouter:") ? { provider: "openrouter", model: value.slice("openrouter:".length) } : { provider: "nvidia", model: value };
}

/** OpenAI's and Anthropic's current models refuse a temperature (OpenRouter's catalogue, 2026-10-16). */
export function acceptsTemperature(model: string): boolean {
  return !/^(openai|anthropic)\//.test(model);
}

const messages = (c: ChatCall) => [{ role: "system", content: c.system }, { role: "user", content: c.prompt }];

export function openrouterBody(c: ChatCall): Record<string, unknown> {
  return {
    model: c.model,
    messages: messages(c),
    max_tokens: 4096,
    ...(acceptsTemperature(c.model) ? { temperature: 0.3 } : {}),
    ...(c.json ? { response_format: { type: "json_object" } } : {}),
    reasoning: { effort: "low", exclude: true }, // ignored by models without reasoning
    provider: ZERO_RETENTION,
  };
}

async function post(url: string, key: string, body: unknown, signal: AbortSignal | undefined, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<string> {
  const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal }).catch(() => null);
  if (!r) throw new ProviderCallError("network");
  if (!r.ok) { await r.body?.cancel().catch(() => undefined); throw new ProviderCallError(r.status); }
  const data: any = await r.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderCallError("empty");
  return text;
}

export function chatOpenRouter(key: string, c: ChatCall, fetchImpl: typeof fetch = fetch): Promise<string> {
  return post(OPENROUTER_URL, key, openrouterBody(c), c.signal, { "HTTP-Referer": "https://parle.buzz", "X-Title": "Parle" }, fetchImpl);
}

export function chatNvidia(key: string, c: ChatCall, fetchImpl: typeof fetch = fetch): Promise<string> {
  return post(NVIDIA_URL, key, { model: c.model, messages: messages(c), temperature: 0.3, max_tokens: 4096 }, c.signal, {}, fetchImpl);
}
