/** Plan 9: preparing a recording in the browser (ruling 1). Pure functions, tested without a browser. */
export const UPLOAD_RATE = 16000;
export const PART_SECONDS = 60; // ruling 2: Vercel's 4.5 MB body limit
export const ANSWER_MAX_MS = 180_000; // spec 3: recordings up to 3 minutes
export const MESSAGE_MAX_MS = 60_000; // spec 5: a tutor voice message records up to 1 minute

const WEBM_FIRST = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
const MP4_FIRST = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
/** Safari and every iPhone browser run Apple's WebKit, whose WebM recording is newer and less proven than MP4 (A99, R107). */
export const isAppleWebKit = (vendor = typeof navigator === "undefined" ? "" : navigator.vendor ?? "") => /^Apple/.test(vendor);
/** Chrome, Firefox and Edge record WebM/Opus; Apple's WebKit records MP4/AAC first; "" lets the browser choose. */
export function pickRecordingType(isSupported: (type: string) => boolean, appleWebKit = false): string {
  return (appleWebKit ? MP4_FIRST : WEBM_FIRST).find((type) => { try { return isSupported(type); } catch { return false; } }) ?? "";
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const channel of channels) for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  return out;
}

/** Averaging resampler: each output sample is the mean of the input samples it covers (a simple low-pass). */
export function resample(input: Float32Array, from: number, to = UPLOAD_RATE): Float32Array {
  if (from === to) return input.slice();
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / (end - start);
  }
  return out;
}

export function encodeWav16(samples: Float32Array, rate = UPLOAD_RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return out;
}

/** Parts of at most `maxSeconds`, each cut at the quietest 100 ms of its last 10 seconds (ruling 2). */
export function splitForUpload(samples: Float32Array, rate = UPLOAD_RATE, maxSeconds = PART_SECONDS): Float32Array[] {
  const max = rate * maxSeconds, win = Math.round(rate * 0.1);
  const parts: Float32Array[] = [];
  let start = 0;
  while (samples.length - start > max) {
    let best = start + max, quietest = Infinity;
    for (let s = start + max - rate * 10; s + win <= start + max; s += win) {
      let energy = 0;
      for (let j = s; j < s + win; j++) energy += samples[j] * samples[j];
      if (energy < quietest) { quietest = energy; best = s + Math.floor(win / 2); }
    }
    parts.push(samples.subarray(start, best));
    start = best;
  }
  parts.push(samples.subarray(start));
  return parts;
}

/** Less than half a second above a quiet room's level: nothing is sent (Review Focus 1). */
export function isSilent(samples: Float32Array, rate = UPLOAD_RATE): boolean {
  const win = Math.round(rate * 0.1);
  let voiced = 0;
  for (let s = 0; s + win <= samples.length; s += win) {
    let energy = 0;
    for (let j = s; j < s + win; j++) energy += samples[j] * samples[j];
    if (Math.sqrt(energy / win) > 0.02) voiced++;
  }
  return voiced < 5;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
