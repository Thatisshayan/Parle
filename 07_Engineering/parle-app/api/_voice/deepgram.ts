import { ProviderError } from "./provider.js";

/**
 * Deepgram Nova-3 speech to text (Plan 10, spec 4). mip_opt_out=true on every request: Deepgram keeps the audio only
 * while it processes the request and never uses it for training. The key and the answer body are never logged.
 */
export const DEEPGRAM_LISTEN = "https://api.deepgram.com/v1/listen";

export function deepgramUrl(): string {
  const query = new URLSearchParams({ model: "nova-3", language: "fr", smart_format: "true", mip_opt_out: "true" });
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
    const text = body?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return typeof text === "string" ? text.trim() : "";
  };
}
