import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AudioError, pcmWav, readWav } from "./wav";

describe("WAV check", () => {
  it("reads 16 kHz mono 16-bit WAV and its length", () => {
    const info = readWav(pcmWav(new Int16Array(16000 * 3), 16000));
    assert.deepEqual([info.sampleRate, info.channels, info.bits, info.durationMs, info.dataBytes], [16000, 1, 16, 3000, 96000]);
  });
  it("refuses anything else", () => {
    assert.throws(() => readWav(new TextEncoder().encode("not audio at all, not even close to a wav header")), (e: unknown) => e instanceof AudioError && e.code === "BAD_AUDIO");
    assert.throws(() => readWav(pcmWav(new Int16Array(44100), 44100)), (e: unknown) => e instanceof AudioError && e.code === "BAD_AUDIO_FORMAT");
  });
});
