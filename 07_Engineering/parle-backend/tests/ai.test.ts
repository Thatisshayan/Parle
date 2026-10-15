import { describe, it, expect, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { queueAiResponses, clearAiQueue } from "./helpers/ai-queue";
import { completeJson, extractJson, validateJson, aiSettings } from "../supabase/functions/_shared/ai";

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
    process.env.AI_FAKE_DELAY_MS = "150";
    process.env.AI_TIMEOUT_STANDARD_MS = "250";
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
