import { describe, it, expect } from "bun:test";
import { chatOpenRouter, openrouterBody, ProviderCallError, routeModel, ZERO_RETENTION, OPENROUTER_URL } from "../supabase/functions/_shared/ai-provider";

const call = (over: Partial<{ model: string; json: boolean }> = {}) => ({ model: "google/gemma-4-31b-it", system: "sys", prompt: "Bonjour", json: false, ...over });
type Seen = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, seen: Seen[] = []) {
  return (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
}

describe("model routing (spec 3)", () => {
  it("openrouter:<id> goes to OpenRouter; a value without a prefix stays NVIDIA (local comparison only)", () => {
    expect(routeModel("openrouter:openai/gpt-6-luna")).toEqual({ provider: "openrouter", model: "openai/gpt-6-luna" });
    expect(routeModel(" openrouter:google/gemma-4-31b-it ")).toEqual({ provider: "openrouter", model: "google/gemma-4-31b-it" });
    expect(routeModel("nvidia/nemotron-3-super-120b-a12b")).toEqual({ provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b" });
  });
});

describe("the OpenRouter request", () => {
  it("always asks for hosts that collect nothing and keep nothing, for plain and JSON calls", () => {
    expect(ZERO_RETENTION).toEqual({ data_collection: "deny", zdr: true, allow_fallbacks: true });
    expect(openrouterBody(call()).provider).toEqual(ZERO_RETENTION);
    expect(openrouterBody(call({ json: true })).provider).toEqual(ZERO_RETENTION);
  });
  it("asks for JSON only on JSON calls, and leaves out temperature for OpenAI and Anthropic models", () => {
    expect(openrouterBody(call({ json: true })).response_format).toEqual({ type: "json_object" });
    expect(openrouterBody(call()).response_format).toBeUndefined();
    expect(openrouterBody(call()).temperature).toBe(0.3);
    expect(openrouterBody(call({ model: "openai/gpt-6-luna" })).temperature).toBeUndefined();
    expect(openrouterBody(call({ model: "anthropic/claude-haiku-5.5" })).temperature).toBeUndefined();
  });
  it("posts to OpenRouter with the key, Parle's referer and title, and returns the reply text", async () => {
    const seen: Seen[] = [];
    const text = await chatOpenRouter("sk-or-test", call(), fakeFetch(200, { choices: [{ message: { content: "Salut" } }] }, seen));
    expect(text).toBe("Salut");
    expect(seen[0].url).toBe(OPENROUTER_URL);
    const h = seen[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk-or-test");
    expect(h["HTTP-Referer"]).toBe("https://parle.buzz");
    expect(h["X-Title"]).toBe("Parle");
    expect(JSON.parse(String(seen[0].init.body)).messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "Bonjour" }]);
  });
  it("an error answer, an empty reply and no network are ProviderCallErrors with the status only", async () => {
    await expect(chatOpenRouter("k", call(), fakeFetch(404, { error: { message: "No endpoints found matching your data policy: Bonjour" } }))).rejects.toMatchObject({ status: 404 });
    await expect(chatOpenRouter("k", call(), fakeFetch(402, "Insufficient credits"))).rejects.toMatchObject({ status: 402 });
    await expect(chatOpenRouter("k", call(), fakeFetch(200, { choices: [{ message: { content: "  " } }] }))).rejects.toMatchObject({ status: "empty" });
    await expect(chatOpenRouter("k", call(), (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(ProviderCallError);
  });
});
