import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { deepgramTranscriber, deepgramUrl } from "./deepgram";

const realWarn = console.warn;
afterEach(() => { console.warn = realWarn; });
type Seen = { url: string; init: RequestInit };
const answer = (status: number, body: unknown, seen: Seen[] = []) =>
  (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const words = (text: string) => ({ results: { channels: [{ alternatives: [{ transcript: text }] }] } });

describe("Deepgram (Plan 10)", () => {
  it("every request opts out of Deepgram's training program, in French, with Nova-3", () => {
    const url = new URL(deepgramUrl());
    assert.equal(url.origin + url.pathname, "https://api.deepgram.com/v1/listen");
    assert.equal(url.searchParams.get("mip_opt_out"), "true");
    assert.equal(url.searchParams.get("model"), "nova-3");
    assert.equal(url.searchParams.get("language"), "fr");
  });
  it("sends the WAV with the key and returns the transcript", async () => {
    const seen: Seen[] = [];
    const text = await deepgramTranscriber("dg-key", answer(200, words(" Bonjour, je m'appelle Ana. "), seen))(new Uint8Array([1, 2, 3]));
    assert.equal(text, "Bonjour, je m'appelle Ana.");
    assert.equal(new URL(seen[0].url).searchParams.get("mip_opt_out"), "true");
    const h = seen[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, "Token dg-key");
    assert.equal(h["Content-Type"], "audio/wav");
  });
  it("silence gives an empty transcript, so the relay's 'couldn't hear enough' path runs", async () => {
    assert.equal(await deepgramTranscriber("k", answer(200, words("")))(new Uint8Array(4)), "");
    assert.equal(await deepgramTranscriber("k", answer(200, { results: { channels: [] } }))(new Uint8Array(4)), "");
  });
  it("out of credit (402) is 'Voice is busy' with a log line that says so, without the key or the body", async () => {
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    await assert.rejects(deepgramTranscriber("dg-secret", answer(402, "Insufficient credits for je m'appelle Ana"))(new Uint8Array(4)), { code: "VOICE_BUSY" });
    assert.match(lines.join(" "), /402/);
    assert.match(lines.join(" "), /outOfCredit":true/);
    assert.doesNotMatch(lines.join(" "), /dg-secret|Ana/);
  });
  it("no network is 'Voice is busy'", async () => {
    console.warn = () => undefined;
    await assert.rejects(deepgramTranscriber("k", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)(new Uint8Array(4)), { code: "VOICE_BUSY" });
  });
});
