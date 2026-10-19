export type VoiceProvider = {
  name: "deepgram-azure" | "nvidia" | "fake";
  /** WAV in (16 kHz mono), French text out. */
  transcribe(wav: Uint8Array, signal?: AbortSignal): Promise<string>;
  /** French text in (at most 400 characters), 16-bit PCM at TTS_RATE out. */
  synthesize(text: string, signal?: AbortSignal): Promise<Int16Array>;
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

/**
 * Deepgram (speech to text) and Azure (read-aloud) in production (Plan 10). NVIDIA only off Vercel, by name, for
 * comparison: its trial terms do not allow production use. The fake only off Vercel (tests and local runs).
 */
export async function providerFor(env: Env): Promise<VoiceProvider> {
  if (env.VOICE_PROVIDER === "fake") {
    if (env.VERCEL) throw new ProviderError("VOICE_NOT_CONFIGURED");
    return (await import("./fake.js")).fakeProvider(env);
  }
  if (env.VOICE_PROVIDER === "nvidia") {
    if (env.VERCEL || !env.NVIDIA_API_KEY) throw new ProviderError("VOICE_NOT_CONFIGURED");
    return (await import("./nvidia.js")).nvidiaProvider(env.NVIDIA_API_KEY);
  }
  if (!env.DEEPGRAM_API_KEY || !env.AZURE_SPEECH_KEY) throw new ProviderError("VOICE_NOT_CONFIGURED");
  const [{ deepgramTranscriber }, { azureSpeaker }] = await Promise.all([import("./deepgram.js"), import("./azure.js")]);
  return {
    name: "deepgram-azure",
    transcribe: deepgramTranscriber(env.DEEPGRAM_API_KEY),
    synthesize: azureSpeaker({ key: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION, voice: env.VOICE_TTS_VOICE }),
  };
}

/** Spec 3: 30 s, then "Voice is busy". */
export function withTimeout<T>(work: Promise<T> | ((signal: AbortSignal) => Promise<T>), ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let call: Promise<T>;
  try { call = typeof work === "function" ? work(controller.signal) : work; }
  catch (error) { call = Promise.reject(error); }
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new ProviderError("VOICE_BUSY")); controller.abort(); }, ms);
  });
  return Promise.race([call, late]).finally(() => clearTimeout(timer));
}
