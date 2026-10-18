import { describe, it, expect, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { queueAiResponses, clearAiQueue } from "./helpers/ai-queue";
import { completeJson, extractJson, validateJson, aiSettings, aiTimeoutMs, AI_TIMEOUT_MAX_MS } from "../supabase/functions/_shared/ai";
import { providerCall } from "../supabase/functions/_shared/ai";

const db = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const SCHEMA = { type: "object", properties: { note: { type: "string" }, level: { enum: ["A1", "A2"] } }, required: ["note", "level"] };

describe("json helpers", () => {
  it("extracts JSON from fenced or chatty model text", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Voici: {"a":[1,2]} merci')).toEqual({ a: [1, 2] });
    expect(extractJson("no json")).toBeNull();
  });
  it("reports schema problems with paths", () => {
    expect(validateJson({ note: "x", level: "A2" }, SCHEMA)).toEqual([]);
    expect(validateJson({ note: 3 }, SCHEMA)).toEqual(["$.note: expected string", "$.level: required"]);
    expect(validateJson({ note: "x", level: "C2" }, SCHEMA)).toEqual(["$.level: not one of A1, A2"]);
  });
});

describe("completeJson with the test provider", () => {
  beforeEach(async () => { process.env.AI_PROVIDER = "fake"; await clearAiQueue(); });
  it("returns valid output", async () => {
    await queueAiResponses('{"note":"Bien","level":"A2"}');
    expect(await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).toEqual({ note: "Bien", level: "A2" });
  });
  it("retries once after invalid output", async () => {
    await queueAiResponses("not json", '{"note":"Ok","level":"A1"}');
    expect(await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).toEqual({ note: "Ok", level: "A1" });
  });
  it("invalid twice gives AI_OUTPUT_INVALID", async () => {
    await queueAiResponses('{"note":1}', "{}");
    await expect(completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  });
  it("an empty queue is AI_UNAVAILABLE", async () => {
    await expect(completeJson(db(), { prompt: "p" }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("stops at the global daily cap", async () => {
    const capKey = `cap:${crypto.randomUUID()}`;
    await queueAiResponses('{"note":"a","level":"A1"}');
    await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey, cap: 1 });
    await expect(completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey, cap: 1 })).rejects.toMatchObject({ code: "AI_DAILY_CAP_REACHED" });
  });
  it("background practice gets 40 s by default, since it runs one card per request (A39)", () => {
    delete process.env.AI_TIMEOUT_FAST_MS;
    delete process.env.AI_TIMEOUT_STANDARD_MS;
    expect(aiTimeoutMs("fast")).toBe(40_000);
    expect(aiTimeoutMs("standard")).toBe(45_000); // A40: replies take 9 to 15 s on GPT-6 Luna
  });
  it("caps configured provider timeouts to preserve Edge Function execution headroom", () => {
    process.env.AI_TIMEOUT_STANDARD_MS = "999999";
    process.env.AI_TIMEOUT_FAST_MS = "Infinity";
    try {
      expect(aiTimeoutMs("standard")).toBe(AI_TIMEOUT_MAX_MS);
      expect(aiTimeoutMs("fast")).toBe(40_000);
    } finally {
      delete process.env.AI_TIMEOUT_STANDARD_MS;
      delete process.env.AI_TIMEOUT_FAST_MS;
    }
  });
  it("a background (fast) call that takes too long is AI_UNAVAILABLE, so callers fall back", async () => {
    process.env.AI_FAKE_DELAY_MS = "300";
    process.env.AI_TIMEOUT_FAST_MS = "50";
    try {
      await queueAiResponses('{"note":"late","level":"A1"}');
      await expect(completeJson(db(), { prompt: "p", schema: SCHEMA, mode: "fast" }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    } finally {
      delete process.env.AI_FAKE_DELAY_MS;
      delete process.env.AI_TIMEOUT_FAST_MS;
    }
  });
  it("a retry is skipped when the call's time budget is mostly used (final review 3)", async () => {
    // first reply arrives after ~70% of the budget: too little left for a retry, enough margin under load
    process.env.AI_FAKE_DELAY_MS = "700";
    process.env.AI_TIMEOUT_STANDARD_MS = "1000";
    try {
      await queueAiResponses("not json", '{"note":"late retry","level":"A1"}');
      await expect(completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
      const { data } = await db().from("ai_test_queue").select("id");
      expect(data!.length).toBe(1); // the second reply was never requested
    } finally {
      delete process.env.AI_FAKE_DELAY_MS;
      delete process.env.AI_TIMEOUT_STANDARD_MS;
    }
  });
  it("reads model choices from settings with defaults", async () => {
    const s = await aiSettings(db());
    expect(s.models.fast.length).toBeGreaterThan(0);
    expect(s.models.standard.length).toBeGreaterThan(0);
    expect(s.cap).toBeGreaterThan(0);
  });
});

describe("the provider call (Plan 10)", () => {
  it("a provider error is AI_UNAVAILABLE and the log line holds no learner text and no key", async () => {
    const realFetch = globalThis.fetch, realWarn = console.warn;
    const lines: string[] = [];
    process.env.OPENROUTER_API_KEY = "sk-or-secret-test";
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "bad request: Je m'appelle Leïla" } }), { status: 400 })) as unknown as typeof fetch;
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    try {
      await expect(providerCall("openrouter:openai/gpt-6-luna", "sys", "Je m'appelle Leïla", false, new AbortController().signal)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    } finally { globalThis.fetch = realFetch; console.warn = realWarn; delete process.env.OPENROUTER_API_KEY; }
    expect(lines.join(" ")).toContain("openai/gpt-6-luna");
    expect(lines.join(" ")).toContain("400");
    expect(lines.join(" ")).not.toContain("Leïla");
    expect(lines.join(" ")).not.toContain("sk-or-secret-test");
  });
  it("without the OpenRouter key the call is AI_NOT_CONFIGURED", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(providerCall("openrouter:openai/gpt-6-luna", "sys", "p", false, new AbortController().signal)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
});

describe("production never falls back to NVIDIA (Plan 10 final review, Important 1)", () => {
  it("with AI_PROVIDER=live, a model setting without openrouter: is refused before any network call, and logged", async () => {
    const realFetch = globalThis.fetch, realWarn = console.warn;
    const lines: string[] = [];
    let called = 0;
    process.env.AI_PROVIDER = "live";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    globalThis.fetch = (async () => { called++; return new Response("{}"); }) as unknown as typeof fetch;
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    try {
      await expect(providerCall("nvidia/nemotron-3-super-120b-a12b", "sys", "p", false, new AbortController().signal)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    } finally { globalThis.fetch = realFetch; console.warn = realWarn; delete process.env.NVIDIA_API_KEY; process.env.AI_PROVIDER = "fake"; }
    expect(called).toBe(0);
    expect(lines.join(" ")).toContain("nvidia/nemotron-3-super-120b-a12b");
  });
});

describe("an aborted request stops its provider call (Plan 11: A29)", () => {
  it("aborting the caller's signal cancels the fetch and answers AI_UNAVAILABLE", async () => {
    const s = db();
    const { data: rows } = await s.from("app_setting").select("id, value").eq("key", "ai_model_standard");
    await s.from("app_setting").update({ value: JSON.stringify("openrouter:openai/gpt-6-luna") }).eq("key", "ai_model_standard");
    const realFetch = globalThis.fetch;
    let aborted = false;
    process.env.AI_PROVIDER = "live"; process.env.OPENROUTER_API_KEY = "sk-or-test";
    globalThis.fetch = ((u: unknown, init: RequestInit) => !String(u).includes("openrouter.ai") ? realFetch(u as any, init) : new Promise((_r, reject) => {
      init.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
    })) as unknown as typeof fetch;
    const outer = new AbortController();
    try {
      const call = completeJson(s, { prompt: "p", signal: outer.signal } as any, { capKey: `cap:${crypto.randomUUID()}` });
      const started = Date.now();
      setTimeout(() => outer.abort(), 50);
      await expect(call).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
      expect(Date.now() - started).toBeLessThan(5000); // not the 45 s budget: the caller's abort ended it
    } finally {
      globalThis.fetch = realFetch; delete process.env.OPENROUTER_API_KEY; process.env.AI_PROVIDER = "fake";
      for (const r of rows ?? []) await s.from("app_setting").update({ value: r.value }).eq("id", r.id);
    }
    expect(aborted).toBe(true);
  }, 120000);
});
