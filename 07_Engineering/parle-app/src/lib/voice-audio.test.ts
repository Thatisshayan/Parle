import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeWav16, formatClock, isAppleWebKit, isSilent, mixToMono, pickRecordingType, resample, splitForUpload } from "./voice-audio";

const tone = (seconds: number, amplitude = 0.3, rate = 16000) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amplitude * Math.sin((2 * Math.PI * 220 * i) / rate));

describe("browser audio preparation (Plan 9 ruling 1)", () => {
  it("records WebM/Opus where it can and Safari's MP4/AAC where it must", () => {
    assert.equal(pickRecordingType((t) => t.startsWith("audio/webm")), "audio/webm;codecs=opus");
    assert.equal(pickRecordingType((t) => t === "audio/mp4"), "audio/mp4");
    assert.equal(pickRecordingType(() => { throw new Error("old browser"); }), "");
  });
  it("mixes to mono and resamples to 16 kHz", () => {
    assert.deepEqual([...mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 0])])], [0.5, 0]);
    const out = resample(new Float32Array(48000).fill(0.5), 48000);
    assert.equal(out.length, 16000);
    assert.ok(out.every((v) => Math.abs(v - 0.5) < 1e-6));
  });
  it("writes 16-bit mono WAV, clipping loud samples", () => {
    const wav = encodeWav16(Float32Array.from([0, 2, -2]));
    const view = new DataView(wav.buffer);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.deepEqual([view.getUint32(24, true), view.getUint16(22, true), view.getUint32(40, true)], [16000, 1, 6]);
    assert.deepEqual([view.getInt16(46, true), view.getInt16(48, true)], [32767, -32768]);
  });
  it("a three-minute recording becomes at most four parts of at most 60 seconds (Review Focus 4)", () => {
    for (const samples of [tone(180), (() => { const s = tone(180); s.fill(0, 16000 * 55, 16000 * 56); return s; })()]) {
      const parts = splitForUpload(samples);
      assert.ok(parts.length <= 4, `${parts.length} parts`);
      assert.ok(parts.every((p) => p.length <= 60 * 16000));
      assert.equal(parts.reduce((n, p) => n + p.length, 0), samples.length);
    }
    assert.equal(splitForUpload(tone(40)).length, 1);
  });
  it("a recording without a voice is caught before sending (Review Focus 1)", () => {
    assert.equal(isSilent(new Float32Array(16000 * 5)), true);
    assert.equal(isSilent(tone(5, 0.005)), true);
    assert.equal(isSilent(tone(2)), false);
  });
  it("shows the timer as minutes and seconds", () => {
    assert.equal(formatClock(65_000), "1:05");
    assert.equal(formatClock(180_000), "3:00");
  });
});

describe("recording format on Apple browsers (Plan 11: A99)", () => {
  it("Apple WebKit records MP4/AAC first; other browsers keep WebM/Opus (R107)", () => {
    assert.equal(pickRecordingType(() => true, true), "audio/mp4;codecs=mp4a.40.2");
    assert.equal(pickRecordingType(() => true), "audio/webm;codecs=opus");
    assert.equal(pickRecordingType((t) => t.startsWith("audio/webm"), true), "audio/webm;codecs=opus");
    assert.equal(isAppleWebKit("Apple Computer, Inc."), true);
    assert.equal(isAppleWebKit("Google Inc."), false);
  });
});
