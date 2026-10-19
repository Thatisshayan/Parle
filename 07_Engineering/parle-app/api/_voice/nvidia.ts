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

type RivaPackage = {
  nvidia: { riva: {
    tts: { RivaSpeechSynthesis: grpc.ServiceClientConstructor };
    asr: { RivaSpeechRecognition: grpc.ServiceClientConstructor };
  } };
};
type UnaryMethod = (
  request: unknown,
  metadata: grpc.Metadata,
  options: grpc.CallOptions,
  callback: (error: grpc.ServiceError | null, response: unknown) => void,
) => unknown;
type RivaClient = grpc.Client & Record<string, unknown>;
type RivaClients = { tts: RivaClient; asr: RivaClient };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

let clients: RivaClients | null = null; // kept while the function stays warm
function rivaClients() {
  if (clients) return clients;
  const definition = loader.fromJSON(RIVA_DESCRIPTOR as Parameters<typeof loader.fromJSON>[0], { keepCase: true, longs: Number, enums: Number, defaults: true });
  const pkg = grpc.loadPackageDefinition(definition) as unknown as RivaPackage;
  const creds = grpc.credentials.createSsl();
  clients = { tts: new pkg.nvidia.riva.tts.RivaSpeechSynthesis(SERVER, creds), asr: new pkg.nvidia.riva.asr.RivaSpeechRecognition(SERVER, creds) };
  return clients;
}

function call(client: RivaClient, method: string, request: unknown, functionId: string, key: string): Promise<unknown> {
  const meta = new grpc.Metadata();
  meta.set("function-id", functionId);
  meta.set("authorization", `Bearer ${key}`);
  return new Promise((resolve, reject) => {
    (client[method] as unknown as UnaryMethod)(request, meta, { deadline: Date.now() + DEADLINE_MS }, (error, response) => {
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
      const response = await call(asr, "Recognize", { config: { language_code: "fr", max_alternatives: 1, enable_automatic_punctuation: true }, audio: Buffer.from(wav) }, ASR_FUNCTION_ID, key);
      const results = isRecord(response) && Array.isArray(response.results) ? response.results : [];
      return results.map((item) => {
        if (!isRecord(item) || !Array.isArray(item.alternatives)) return "";
        const alternative = item.alternatives[0];
        return isRecord(alternative) && typeof alternative.transcript === "string" ? alternative.transcript : "";
      }).join(" ").trim();
    },
    async synthesize(text) {
      const response = await call(tts, "Synthesize", { text, language_code: "fr-FR", encoding: 1, sample_rate_hz: TTS_RATE, voice_name: VOICE_NAME }, TTS_FUNCTION_ID, key);
      if (!isRecord(response) || !(response.audio instanceof Uint8Array)) throw new ProviderError("VOICE_BUSY");
      const bytes = new Uint8Array(response.audio); // copy: Int16Array needs an even byte offset
      return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    },
  };
}
