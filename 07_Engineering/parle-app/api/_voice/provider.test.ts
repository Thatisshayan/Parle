import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providerFor } from "./provider";

describe("which voice provider the relay uses (Plan 10)", () => {
  it("Deepgram and Azure when both keys are set, on Vercel or not", async () => {
    assert.equal((await providerFor({ VERCEL: "1", DEEPGRAM_API_KEY: "d", AZURE_SPEECH_KEY: "a" })).name, "deepgram-azure");
    assert.equal((await providerFor({ DEEPGRAM_API_KEY: "d", AZURE_SPEECH_KEY: "a", NVIDIA_API_KEY: "n" })).name, "deepgram-azure");
  });
  it("not configured without both speech keys, even when the NVIDIA key is still set", async () => {
    await assert.rejects(providerFor({ VERCEL: "1", NVIDIA_API_KEY: "n" }), { code: "VOICE_NOT_CONFIGURED" });
    await assert.rejects(providerFor({ VERCEL: "1", DEEPGRAM_API_KEY: "d" }), { code: "VOICE_NOT_CONFIGURED" });
  });
  it("NVIDIA only off Vercel, by name, for comparison; the fake only off Vercel", async () => {
    await assert.rejects(providerFor({ VERCEL: "1", VOICE_PROVIDER: "nvidia", NVIDIA_API_KEY: "n" }), { code: "VOICE_NOT_CONFIGURED" });
    await assert.rejects(providerFor({ VERCEL: "1", VOICE_PROVIDER: "fake" }), { code: "VOICE_NOT_CONFIGURED" });
    assert.equal((await providerFor({ VOICE_PROVIDER: "fake" })).name, "fake");
  });
});
