import { ProviderError } from "./provider.js";

/**
 * Deepgram Nova-3 speech to text (Plan 10, spec 4). mip_opt_out=true on every request: Deepgram keeps the audio only
 * while it processes the request and never uses it for training. The key and the answer body are never logged.
 */
export const DEEPGRAM_LISTEN = "https://api.deepgram.com/v1/listen";

export function deepgramUrl(): string {
  // punctuate, not smart_format: spoken numbers stay words, as the learner said them (Plan 11, A109)
  const query = new URLSearchParams({ model: "nova-3", language: "fr", punctuate: "true", mip_opt_out: "true" });
  return `${DEEPGRAM_LISTEN}?${query}`;
}

export function deepgramTranscriber(key: string, fetchImpl: typeof fetch = fetch) {
  return async (wav: Uint8Array): Promise<string> => {
    const r = await fetchImpl(deepgramUrl(), { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" }, body: wav as unknown as BodyInit }).catch(() => null);
    if (!r?.ok) {
      console.warn("Deepgram call failed", { status: r?.status ?? "network", outOfCredit: r?.status === 402 });
      await r?.body?.cancel().catch(() => undefined);
      throw new ProviderError("VOICE_BUSY");
    }
    const body: any = await r.json().catch(() => null);
    // a 200 that is not a Deepgram answer is a failure, not silence; the body is never logged (A110, R117)
    if (!Array.isArray(body?.results?.channels)) {
      console.warn("Deepgram answer unreadable", { status: r.status });
      throw new ProviderError("VOICE_BUSY");
    }
    const text = body.results.channels[0]?.alternatives?.[0]?.transcript;
    return typeof text === "string" ? text.trim() : "";
  };
}
