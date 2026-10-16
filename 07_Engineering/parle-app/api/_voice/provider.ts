export type VoiceProvider = {
  name: "nvidia" | "fake";
  /** WAV in (16 kHz mono), French text out. */
  transcribe(wav: Uint8Array): Promise<string>;
  /** French text in (at most 400 characters), 16-bit PCM at TTS_RATE out. */
  synthesize(text: string): Promise<Int16Array>;
};
export const TTS_RATE = 22050;
export type Env = Record<string, string | undefined>;

export class ProviderError extends Error {
  code: "VOICE_BUSY" | "VOICE_NOT_CONFIGURED";
  constructor(code: "VOICE_BUSY" | "VOICE_NOT_CONFIGURED") {
    super(code);
    this.code = code;
  }
}

/** NVIDIA in production; the fake only off Vercel (tests and local runs). */
export async function providerFor(env: Env): Promise<VoiceProvider> {
  if (env.VOICE_PROVIDER === "fake") {
    if (env.VERCEL) throw new ProviderError("VOICE_NOT_CONFIGURED");
    return (await import("./fake.js")).fakeProvider(env);
  }
  if (!env.NVIDIA_API_KEY) throw new ProviderError("VOICE_NOT_CONFIGURED");
  return (await import("./nvidia.js")).nvidiaProvider(env.NVIDIA_API_KEY);
}

/** Spec 3: 30 s, then "Voice is busy". */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProviderError("VOICE_BUSY")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
