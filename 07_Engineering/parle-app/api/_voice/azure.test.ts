import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AZURE_OUTPUT, azureSpeaker, DEFAULT_VOICE, escapeXml, ssml } from "./azure";
import { TTS_RATE } from "./provider";

const realWarn = console.warn;
afterEach(() => { console.warn = realWarn; });
type Seen = { url: string; init: RequestInit };
const pcm = (samples: number[]) => new Uint8Array(Int16Array.from(samples).buffer);
const answer = (status: number, body: BodyInit, seen: Seen[] = []) =>
  (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(body, { status }); }) as unknown as typeof fetch;

describe("Azure read-aloud (Plan 10)", () => {
  it("asks for raw PCM at the relay's own rate, so the MP3 step is unchanged", () => {
    assert.equal(AZURE_OUTPUT, `raw-${TTS_RATE}hz-16bit-mono-pcm`);
  });
  it("escapes XML characters, so French with & < > and quotes never breaks the request", () => {
    assert.equal(escapeXml(`C'est l'été & <b>"oui"</b>`), "C&apos;est l&apos;été &amp; &lt;b&gt;&quot;oui&quot;&lt;/b&gt;");
    const doc = ssml(`Tom & Léa <3`, DEFAULT_VOICE);
    assert.match(doc, /xml:lang="fr-CA"/);
    assert.match(doc, /<voice name="fr-CA-SylvieNeural">Tom &amp; Léa &lt;3<\/voice>/);
  });
  it("posts SSML to Canada Central with the key and returns 16-bit samples", async () => {
    const seen2: Seen[] = [];
    const out = await azureSpeaker({ key: "az-key" }, answer(200, pcm([1, -2, 300]), seen2))("Bonjour");
    assert.deepEqual(Array.from(out), [1, -2, 300]);
    assert.equal(seen2[0].url, "https://canadacentral.tts.speech.microsoft.com/cognitiveservices/v1");
    const h = seen2[0].init.headers as Record<string, string>;
    assert.equal(h["Ocp-Apim-Subscription-Key"], "az-key");
    assert.equal(h["Content-Type"], "application/ssml+xml");
    assert.equal(h["X-Microsoft-OutputFormat"], AZURE_OUTPUT);
    assert.ok(h["User-Agent"]);
    assert.match(String(seen2[0].init.body), /fr-CA-SylvieNeural/);
  });
  it("a region or voice that is not a plain name falls back to Canada Central and Sylvie", async () => {
    const seen: Seen[] = [];
    await azureSpeaker({ key: "k", region: "evil.example/", voice: `x"><voice name="y` }, answer(200, pcm([0]), seen))("Salut");
    assert.equal(seen[0].url, "https://canadacentral.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.match(String(seen[0].init.body), /<voice name="fr-CA-SylvieNeural">/);
    const other: Seen[] = [];
    await azureSpeaker({ key: "k", region: "canadaeast", voice: "fr-CA-AntoineNeural" }, answer(200, pcm([0]), other))("Salut");
    assert.equal(other[0].url, "https://canadaeast.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.match(String(other[0].init.body), /fr-CA-AntoineNeural/);
  });
  it("an error answer is 'Voice is busy' and the log line has the status only", async () => {
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    await assert.rejects(azureSpeaker({ key: "az-secret" }, answer(400, "bad SSML near Léa"))("Léa"), { code: "VOICE_BUSY" });
    assert.match(lines.join(" "), /400/);
    assert.doesNotMatch(lines.join(" "), /az-secret|Léa/);
  });
});

describe("Azure edge cases (Plan 11: A108, A111)", () => {
  it("characters XML forbids never reach the SSML (R116)", () => {
    const doc = ssml("A\u0000B\u0007C\uFFFFD\uD800E", DEFAULT_VOICE);
    assert.doesNotMatch(doc, /[\u0000-\u0008\uFFFF\uD800]/);
    assert.match(doc, /A B C D E/);
  });
  it("an empty 200 is 'Voice is busy', not silence (R119)", async () => {
    const lines: string[] = []; console.warn = (...a: unknown[]) => { lines.push(JSON.stringify(a)); };
    await assert.rejects(azureSpeaker({ key: "k" }, answer(200, new Uint8Array(0)))("Bonjour"), { code: "VOICE_BUSY" });
    assert.match(lines.join(" "), /empty/);
  });
});
