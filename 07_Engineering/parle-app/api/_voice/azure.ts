import { ProviderError } from "./provider.js";

/**
 * Azure AI Speech read-aloud (Plan 10, spec 4): Canada Central, Canadian French voice, raw 16-bit PCM at the relay's
 * TTS_RATE (22,050 Hz), so the relay's MP3 step is unchanged. The key and the answer body are never logged.
 */
export const DEFAULT_VOICE = "fr-CA-SylvieNeural";
export const AZURE_OUTPUT = "raw-22050hz-16bit-mono-pcm";
const DEFAULT_REGION = "canadacentral";

// characters XML 1.0 forbids (controls, U+FFFE/U+FFFF, unpaired surrogates) would make Azure refuse the SSML (A108, R116)
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXml(text: string): string {
  return text.replace(XML_FORBIDDEN, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function ssml(text: string, voice: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.slice(0, 5)}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
}

export function azureSpeaker(cfg: { key: string; region?: string; voice?: string }, fetchImpl: typeof fetch = fetch) {
  // settings are plain names; anything else falls back (it would otherwise reach the URL or the SSML)
  const region = /^[a-z0-9]+$/.test(cfg.region ?? "") ? String(cfg.region) : DEFAULT_REGION;
  const voice = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(cfg.voice ?? "") ? String(cfg.voice) : DEFAULT_VOICE;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  return async (text: string): Promise<Int16Array> => {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": cfg.key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": AZURE_OUTPUT, "User-Agent": "parle-voice" },
      body: ssml(text, voice),
    }).catch(() => null);
    if (!r?.ok) {
      console.warn("Azure speech call failed", { status: r?.status ?? "network" });
      await r?.body?.cancel().catch(() => undefined);
      throw new ProviderError("VOICE_BUSY");
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    // an empty answer is a failure, not silence (A111, R119)
    if (bytes.length < 2) {
      console.warn("Azure speech answer empty", { status: r.status });
      throw new ProviderError("VOICE_BUSY");
    }
    return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  };
}
