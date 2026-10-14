import { describe, it, expect } from "bun:test";
import { pickCandidates } from "../scripts/spikes/nvidia";

describe("pickCandidates", () => {
  it("prefers large instruct models from different families and skips embedding / vision models", () => {
    const ids = ["nvidia/nv-embedqa-e5-v5", "meta/llama-3.1-8b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct", "microsoft/phi-3-vision-128k-instruct", "mistralai/mistral-large-2-instruct"];
    expect(pickCandidates(ids)).toEqual(["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct"]);
  });
  it("prefers the current large models in this account's catalog over older ones", () => {
    const ids = ["01-ai/yi-large", "ai21labs/jamba-1.5-large-instruct", "mistralai/mistral-large-2-instruct", "moonshotai/kimi-k3", "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-3-super-120b-a12b", "google/gemma-4-31b-it"];
    expect(pickCandidates(ids)).toEqual(["moonshotai/kimi-k3", "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-3-super-120b-a12b"]);
  });
  it("returns fewer than three when few chat models exist", () => {
    expect(pickCandidates(["meta/llama-3.3-70b-instruct", "nvidia/nv-embedqa-e5-v5"])).toEqual(["meta/llama-3.3-70b-instruct"]);
  });
});
