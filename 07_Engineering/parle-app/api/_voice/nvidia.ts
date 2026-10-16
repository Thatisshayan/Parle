import grpc from "@grpc/grpc-js";
import loader from "@grpc/proto-loader";
import { RIVA_DESCRIPTOR } from "./riva-descriptor.js";
import { ProviderError, TTS_RATE, type VoiceProvider } from "./provider.js";

/** NVIDIA hosted Riva over gRPC (spec 2; proof of concept 2026-10-16). The key is never logged. */
const SERVER = "grpc.nvcf.nvidia.com:443";
export const TTS_FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969";
export const ASR_FUNCTION_ID = "b702f636-f60c-4a3d-a6f4-f3568c13bd7d";
export const VOICE_NAME = "Magpie-Multilingual.FR-FR.Louise";
const DEADLINE_MS = 30_000;

let clients: { tts: any; asr: any } | null = null; // kept while the function stays warm
function rivaClients() {
  if (clients) return clients;
  const pkg: any = grpc.loadPackageDefinition(loader.fromJSON(RIVA_DESCRIPTOR as any, { keepCase: true, longs: Number, enums: Number, defaults: true }));
  const creds = grpc.credentials.createSsl();
  clients = { tts: new pkg.nvidia.riva.tts.RivaSpeechSynthesis(SERVER, creds), asr: new pkg.nvidia.riva.asr.RivaSpeechRecognition(SERVER, creds) };
  return clients;
}

function call(client: any, method: string, request: unknown, functionId: string, key: string): Promise<any> {
  const meta = new grpc.Metadata();
  meta.set("function-id", functionId);
  meta.set("authorization", `Bearer ${key}`);
  return new Promise((resolve, reject) => {
    client[method](request, meta, { deadline: Date.now() + DEADLINE_MS }, (error: { code?: number } | null, response: unknown) => {
      if (error) {
        console.warn("NVIDIA voice call failed", { method, code: error.code ?? "unknown" });
        reject(new ProviderError("VOICE_BUSY"));
      } else resolve(response);
    });
  });
}

export function nvidiaProvider(key: string): VoiceProvider {
  const { tts, asr } = rivaClients();
  return {
    name: "nvidia",
    async transcribe(wav) {
      const r = await call(asr, "Recognize", { config: { language_code: "fr", max_alternatives: 1, enable_automatic_punctuation: true }, audio: Buffer.from(wav) }, ASR_FUNCTION_ID, key);
      return (r.results ?? []).map((x: any) => x.alternatives?.[0]?.transcript ?? "").join(" ").trim();
    },
    async synthesize(text) {
      const r = await call(tts, "Synthesize", { text, language_code: "fr-FR", encoding: 1, sample_rate_hz: TTS_RATE, voice_name: VOICE_NAME }, TTS_FUNCTION_ID, key);
      const bytes = new Uint8Array(r.audio); // copy: Int16Array needs an even byte offset
      return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    },
  };
}
