import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleVoice, pieces, synthesizeAll } from "./handler";
import { withTimeout } from "./provider.js";
import type { VoiceProvider } from "./provider.js";
import { pcmWav } from "./wav";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const ENV = { VOICE_PROVIDER: "fake", VOICE_RELAY_SECRET: "s".repeat(64), VITE_SUPABASE_URL: "http://backend.test", VITE_SUPABASE_PUBLISHABLE_KEY: "pk" };
type Call = { action: string; body: Record<string, unknown>; headers: Record<string, string> };
type Answer = [number, Record<string, unknown>] | Array<[number, Record<string, unknown>]>;

/** Stands in for parle-voice-service: answers per action, records every call. */
function backend(answers: Record<string, Answer>): Call[] {
  const calls: Call[] = [];
  const positions = new Map<string, number>();
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ action: body.action, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const configured = answers[body.action] ?? [200, {}];
    const sequence = Array.isArray(configured[0]) ? configured as Array<[number, Record<string, unknown>]> : [configured as [number, Record<string, unknown>]];
    const position = positions.get(body.action) ?? 0;
    positions.set(body.action, position + 1);
    const [status, answer] = sequence[Math.min(position, sequence.length - 1)];
    return new Response(JSON.stringify(answer), { status });
  }) as typeof fetch;
  return calls;
}
const wav = (seconds: number, rate = 16000) => pcmWav(new Int16Array(Math.round(rate * seconds)), rate);
const transcribeReq = (bytes: Uint8Array, query = "purpose=answer&ref=task-1&part=1", token = "learner-token") =>
  new Request(`http://app.test/api/voice?action=transcribe&${query}`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "audio/wav" }, body: bytes });
const jsonReq = (action: string, body: unknown) =>
  new Request(`http://app.test/api/voice?action=${action}`, { method: "POST", headers: { Authorization: "Bearer learner-token", "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("voice relay", () => {
  it("refuses a request without a token before calling anyone", async () => {
    const calls = backend({});
    const r = await handleVoice(transcribeReq(wav(2), undefined, ""), ENV);
    assert.equal(r.status, 401);
    assert.equal(calls.length, 0);
  });
  it("refuses audio that is not 16 kHz mono WAV, so Safari's MP4 must be converted in the browser", async () => {
    const calls = backend({});
    const mp4 = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypM4A isomiso2mp41"), ...new Uint8Array(40)]);
    const a = await handleVoice(transcribeReq(mp4), ENV);
    const b = await handleVoice(transcribeReq(wav(1, 44100)), ENV);
    assert.deepEqual([a.status, (await a.json()).error_code, b.status, (await b.json()).error_code], [400, "BAD_AUDIO", 400, "BAD_AUDIO_FORMAT"]);
    assert.equal(calls.length, 0);
  });
  it("refuses a part longer than 60 seconds", async () => {
    backend({});
    const r = await handleVoice(transcribeReq(wav(62)), ENV);
    assert.deepEqual([r.status, (await r.json()).error_code], [400, "PART_TOO_LONG"]);
  });
  it("takes a unit, transcribes, saves the part and answers the transcript", async () => {
    const calls = backend({ voice_take: [200, { ticket_id: "t-1", remaining: 1, plan: "free" }], voice_part: [200, { transcript: "Bonjour", words: 1, duration_ms: 2000, total_ms: 2000 }] });
    const r = await handleVoice(transcribeReq(wav(2)), ENV);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ticket_id: "t-1", part: 1, transcript: "Bonjour", words: 1, duration_ms: 2000, total_ms: 2000, remaining: 1, plan: "free" });
    assert.deepEqual(calls.map((c) => c.action), ["voice_take", "voice_part"]);
    assert.equal(calls[0].headers.Authorization, "Bearer learner-token");
    assert.equal(calls[0].headers["x-voice-secret"], ENV.VOICE_RELAY_SECRET);
    assert.deepEqual([calls[0].body.kind, calls[0].body.ref, calls[1].body.duration_ms], ["answer", "task-1", 2000]);
  });
  it("leases the paid transcription provider and releases capacity before saving the transcript", async () => {
    const actions: Array<{ action: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/functions/v1/parle-voice-service")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        actions.push({ action: body.action, body });
        const answers: Record<string, Record<string, unknown>> = {
          voice_take: { ticket_id: "ticket-1", remaining: 1 },
          provider_lease_acquire: { lease_id: "lease-1" },
          provider_lease_release: { released: true },
          voice_part: { transcript: "Bonjour", words: 1, duration_ms: 2000, total_ms: 2000 },
        };
        return new Response(JSON.stringify(answers[body.action] ?? {}), { status: 200 });
      }
      return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "Bonjour" }] }] } }), { status: 200 });
    }) as typeof fetch;
    const env = { ...ENV, VOICE_PROVIDER: "deepgram-azure", DEEPGRAM_API_KEY: "test-key", AZURE_SPEECH_KEY: "test-azure" };
    const response = await handleVoice(transcribeReq(wav(2)), env);
    assert.equal(response.status, 200);
    assert.deepEqual(actions.map((x) => x.action), ["voice_take", "provider_lease_acquire", "provider_lease_release", "voice_part"]);
    assert.equal(actions[1].body.role, "speech_stt");
    assert.equal(actions[2].body.lease_id, "lease-1");
  });
  it("passes the backend's limit answer to the app and never calls the provider", async () => {
    const calls = backend({ voice_take: [429, { error_code: "LIMIT_REACHED", kind: "answer", plan: "free", limit: 2 }] });
    const r = await handleVoice(transcribeReq(wav(2)), ENV);
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { error_code: "LIMIT_REACHED", kind: "answer", plan: "free", limit: 2 });
    assert.deepEqual(calls.map((c) => c.action), ["voice_take"]);
  });
  it("gives the unit back and says voice is busy when the provider fails", async () => {
    const calls = backend({ voice_take: [200, { ticket_id: "t-2" }] });
    const r = await handleVoice(transcribeReq(wav(2)), { ...ENV, VOICE_FAKE_FAIL: "1" });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).message, "Voice is busy. Try again in a moment.");
    assert.deepEqual(calls.map((c) => c.action), ["voice_take", "voice_release"]);
  });
  it("reads a reply aloud as MP3 and counts it through the backend", async () => {
    const calls = backend({ voice_take: [200, { ticket_id: "t-3", remaining: 19 }] });
    const r = await handleVoice(jsonReq("speak", { text: "Je suis allé au marché.", reply_id: "m-1" }), ENV);
    assert.equal(r.headers.get("content-type"), "audio/mpeg");
    assert.equal(r.headers.get("x-voice-remaining"), "19");
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.ok(bytes.length > 0 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    assert.deepEqual(calls[0].body, { action: "voice_take", kind: "reply", ref: "m-1", text: "Je suis allé au marché." });
  });
  it("never uses the fake provider on Vercel", async () => {
    const calls = backend({});
    const r = await handleVoice(jsonReq("speak", { text: "Bonjour.", reply_id: "m-1" }), { ...ENV, VERCEL: "1" });
    assert.deepEqual([r.status, (await r.json()).error_code, calls.length], [503, "VOICE_NOT_CONFIGURED", 0]);
  });
  it("passes an abort signal to a provider call when its timeout expires", async () => {
    let observedAbort = false;
    await assert.rejects(withTimeout((signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => { observedAbort = true; reject(new DOMException("aborted", "AbortError")); });
    }), 20), { code: "VOICE_BUSY" });
    assert.equal(observedAbort, true);
  });
  it("speaks at most 400 characters per provider call", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Phrase numéro ${i}, qui parle du travail et de la famille.`).join(" ");
    const parts = pieces(long);
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 400));
    assert.equal(parts.join(" "), long);
    assert.ok(pieces("x".repeat(900)).every((p) => p.length <= 400));
  });
});

describe("listening generation failures and time budget (Plan 11: A89, A90)", () => {
  it("waits for a concurrent maker and returns its prepared audio without surfacing a false failure", async () => {
    const calls = backend({ listening_claim: [[200, { state: "busy" }], [200, { state: "ready", url: "https://audio.test/ready.mp3" }]] });
    const r = await handleVoice(jsonReq("listen", { item_kind: "question_item", item_id: "i-1" }), ENV);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { url: "https://audio.test/ready.mp3", generated: false });
    assert.deepEqual(calls.map((c) => c.action), ["listening_claim", "listening_claim"]);
  });
  it("bounds the quiet wait and returns busy only while another maker still holds the claim", async () => {
    const calls = backend({ listening_claim: [200, { state: "busy" }] });
    const r = await handleVoice(jsonReq("listen", { item_kind: "question_item", item_id: "i-1" }), ENV);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error_code, "AUDIO_BEING_MADE");
    assert.equal(calls.length, 9);
  });
  it("a failed listening generation gives the claim back (R97)", async () => {
    const calls = backend({ listening_claim: [200, { state: "generate", cache_key: "k1", script: "Bonjour." }] });
    const r = await handleVoice(jsonReq("listen", { item_kind: "question_item", item_id: "i-1" }), { ...ENV, VOICE_FAKE_FAIL: "1" });
    assert.equal(r.status, 503);
    assert.deepEqual(calls.map((c) => c.action), ["listening_claim", "listening_release"]);
    assert.equal(calls[1].body.cache_key, "k1");
  });
  it("a refused store gives the claim back too (R97)", async () => {
    const calls = backend({ listening_claim: [200, { state: "generate", cache_key: "k2", script: "Bonjour." }], listening_store: [500, { error_code: "X" }] });
    const r = await handleVoice(jsonReq("listen", { item_kind: "question_item", item_id: "i-1" }), ENV);
    assert.equal(r.status, 500);
    assert.deepEqual(calls.map((c) => c.action), ["listening_claim", "listening_store", "listening_release"]);
  });
  it("one time budget covers every piece (R98)", async () => {
    const slow = { name: "fake" as const, transcribe: async () => "", synthesize: () => new Promise<Int16Array>((r) => setTimeout(() => r(new Int16Array(1)), 30)) };
    const text = Array.from({ length: 3 }, () => "x".repeat(390) + ".").join(" ");
    await assert.rejects(synthesizeAll(slow as unknown as VoiceProvider, text, 50), { code: "VOICE_BUSY" });
  });
});
