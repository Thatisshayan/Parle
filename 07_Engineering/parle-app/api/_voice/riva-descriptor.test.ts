import assert from "node:assert/strict";
import { describe, it } from "node:test";
import grpc from "@grpc/grpc-js";
import loader from "@grpc/proto-loader";
import { RIVA_DESCRIPTOR } from "./riva-descriptor";

describe("Riva protos bundled with the relay", () => {
  it("load without files and expose Synthesize and Recognize", () => {
    const definition = loader.fromJSON(RIVA_DESCRIPTOR as Parameters<typeof loader.fromJSON>[0], { keepCase: true, longs: Number, enums: Number, defaults: true });
    const pkg = grpc.loadPackageDefinition(definition) as unknown as {
      nvidia: { riva: {
        tts: { RivaSpeechSynthesis: { new (...args: unknown[]): unknown; service: Record<string, unknown> } };
        asr: { RivaSpeechRecognition: { new (...args: unknown[]): unknown; service: Record<string, unknown> } };
      } };
    };
    assert.equal(typeof pkg.nvidia.riva.tts.RivaSpeechSynthesis, "function");
    assert.equal(typeof pkg.nvidia.riva.asr.RivaSpeechRecognition, "function");
    assert.ok("Synthesize" in pkg.nvidia.riva.tts.RivaSpeechSynthesis.service);
    assert.ok("Recognize" in pkg.nvidia.riva.asr.RivaSpeechRecognition.service);
  });
});
