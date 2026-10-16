import { Mp3Encoder } from "@breezystack/lamejs";

/** Speech for the browser as MP3 (ruling 5): mono, 48 kbit/s. */
export function encodeMp3(pcm: Int16Array, sampleRate = 22050, kbps = 48): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const keep = (chunk: Int8Array | Uint8Array) => {
    if (chunk.length) parts.push(Uint8Array.from(chunk, (n) => n & 0xff)); // the encoder answers signed bytes
  };
  for (let i = 0; i < pcm.length; i += 1152) keep(encoder.encodeBuffer(pcm.subarray(i, i + 1152)));
  keep(encoder.flush());
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
