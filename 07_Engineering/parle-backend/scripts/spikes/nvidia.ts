import { writeFileSync, mkdirSync } from "node:fs";
import { readSecret } from "../lib/secrets";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
// Newest strong general models first (as seen in this account's catalog on 2026-10-14), then older fallbacks.
const PREFERRED = [
  "moonshotai/kimi-k3", "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-3-super-120b-a12b", "z-ai/glm-5.3", "google/gemma-4-31b-it",
  "meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct", "mistralai/mistral-large-2-instruct",
];

export function pickCandidates(modelIds: string[]): string[] {
  const chat = modelIds.filter((id) => !/embed|vision|rerank|guard|reward|clip|parse/i.test(id));
  const preferred = PREFERRED.filter((p) => chat.includes(p));
  const large = chat.filter((id) => /(70b|49b|72b|large|405b)/i.test(id));
  const picked: string[] = [];
  const families = new Set<string>();
  for (const id of [...preferred, ...large]) {
    const family = id.split("/")[0] + (id.includes("nemotron") ? "-nemotron" : "");
    if (picked.length < 3 && !picked.includes(id) && !families.has(family)) { picked.push(id); families.add(family); }
  }
  return picked;
}

const PROMPTS = [
  { name: "A2 writing correction (English explanation)", system: "You are a patient French tutor for an A2 learner preparing for Canadian immigration (TEF). Correct the learner's French, list each mistake with a one-line explanation in English, then give the corrected text.", user: "Hier je suis allé au travail et je travaille dans cette entreprise pendant trois ans." },
  { name: "Persian explanation", system: "You are a French tutor. Explain grammar in Persian (Farsi); keep French examples in French.", user: "What is the difference between depuis and pendant?" },
  { name: "Lesson item as JSON", system: "Return only JSON: {\"question\": string, \"options\": [string,string,string], \"correct_index\": number, \"explanation\": string}. One A2 multiple-choice item on passé composé with être.", user: "Create the item." },
];

if (import.meta.main) {
  const key = readSecret("NVIDIA_API_KEY");
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const models = await fetch(`${NVIDIA_BASE}/models`, { headers: H });
  if (!models.ok) { console.log(`models list failed: ${models.status}`); process.exit(1); }
  const ids = ((await models.json()).data ?? []).map((m: any) => m.id as string);
  const candidates = pickCandidates(ids);
  const report: string[] = [`# NVIDIA API spike (${new Date().toISOString().slice(0, 10)})`, "", `Models visible to this key: ${ids.length}. Candidates: ${candidates.join(", ")}`, ""];
  for (const model of candidates) for (const p of PROMPTS) {
    const t0 = Date.now();
    const r = await fetch(`${NVIDIA_BASE}/chat/completions`, { method: "POST", headers: H, body: JSON.stringify({ model, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], temperature: 0.3, max_tokens: 600 }) });
    const ms = Date.now() - t0;
    const limits = ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests"].map((h) => `${h}=${r.headers.get(h) ?? "n/a"}`).join(" ");
    const body: any = await r.json().catch(() => ({}));
    const text = body.choices?.[0]?.message?.content ?? `HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`;
    report.push(`## ${model} - ${p.name}`, `${ms} ms; tokens ${body.usage?.total_tokens ?? "n/a"}; ${limits}`, "", "```", text, "```", "");
  }
  mkdirSync("D:/AgentDevWork/repos/Parle/06_Build/export-decoupling/spikes", { recursive: true });
  writeFileSync("D:/AgentDevWork/repos/Parle/06_Build/export-decoupling/spikes/nvidia-report.md", report.join("\n"));
  console.log(`wrote report for ${candidates.length} models`);
}
