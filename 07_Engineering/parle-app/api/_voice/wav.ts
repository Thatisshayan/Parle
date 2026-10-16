/** The relay accepts exactly what Whisper is sent: 16 kHz, mono, 16-bit PCM WAV (the browser converts, ruling 1). */
export class AudioError extends Error {
  code: string;
  constructor(code: "BAD_AUDIO" | "BAD_AUDIO_FORMAT") {
    super(code);
    this.code = code;
  }
}
export type WavInfo = { sampleRate: number; channels: number; bits: number; dataOffset: number; dataBytes: number; durationMs: number };

export function readWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new AudioError("BAD_AUDIO");
  let offset = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset), size = view.getUint32(offset + 4, true), body = offset + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) throw new AudioError("BAD_AUDIO");
      if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) throw new AudioError("BAD_AUDIO_FORMAT");
      const dataBytes = Math.min(size, bytes.length - body);
      return { sampleRate: 16000, channels: 1, bits: 16, dataOffset: body, dataBytes, durationMs: Math.round((dataBytes / 2 / 16000) * 1000) };
    }
    offset = body + size + (size % 2);
  }
  throw new AudioError("BAD_AUDIO");
}

/** A mono 16-bit PCM WAV file (tests, and the fake provider). */
export function pcmWav(pcm: Int16Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(out.buffer);
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return out;
}
