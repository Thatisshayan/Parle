import { writeFileSync } from "node:fs";
import { readSecret } from "./lib/secrets";
import { validateJson } from "../supabase/functions/_shared/json-schema";
import { extractJson } from "../supabase/functions/_shared/ai";
import { PROMPTS } from "./lib/bakeoff-prompts";

/**
 * AI model bake-off (backend Plan 3, Task 15; spec section 7): the same four prompts through each candidate
 * NVIDIA model, so the founder can choose the chat model and the background model. The key is never printed.
 */
const BASE = "https://integrate.api.nvidia.com/v1";
const CANDIDATES = [
  "moonshotai/kimi-k3",
  "z-ai/glm-5.3",
  "google/gemma-4-31b-it",
  "deepseek-ai/deepseek-v4.1-flash",
  "nvidia/nemotron-3-super-120b-a12b",
];
const REPORT = `${import.meta.dir}/../../../06_Build/export-decoupling/spikes/ai-bakeoff-report.md`;


const key = readSecret("NVIDIA_API_KEY");
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const models = await fetch(`${BASE}/models`, { headers: H });
if (!models.ok) { console.log(`models list failed: ${models.status}`); process.exit(1); }
const available = new Set(((await models.json()).data ?? []).map((m: any) => m.id as string));
const present = CANDIDATES.filter((m) => available.has(m));
const missing = CANDIDATES.filter((m) => !available.has(m));
console.log(`candidates present: ${present.length}; missing: ${missing.join(", ") || "none"}`);

type Row = { model: string; prompt: string; seconds: number; ok: string; text: string };
const rows: Row[] = [];
for (const model of present) {
  for (const p of PROMPTS) {
    const system = p.schema
      ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(p.schema)}`
      : "You are Parle's French tutor. Reply in plain text.";
    const started = Date.now();
    let text = "", ok = "";
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: H, signal: AbortSignal.timeout(240_000),
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: p.prompt }], temperature: 0.3, max_tokens: 4096 }),
      });
      const body: any = await r.json().catch(() => ({}));
      text = String(body?.choices?.[0]?.message?.content ?? "");
      if (!r.ok) ok = `HTTP ${r.status}`;
      else if (!text.trim()) ok = "empty";
      else if (p.schema) {
        const value = extractJson(text);
        const problems = value === null ? ["not JSON"] : validateJson(value, p.schema);
        ok = problems.length ? `invalid (${problems.slice(0, 2).join("; ")})` : "valid";
      } else ok = "text";
    } catch (e) {
      ok = `error (${(e as Error).name})`;
    }
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    rows.push({ model, prompt: p.name, seconds, ok, text: text.slice(0, 1200) });
    console.log(`${model} | ${p.name} | ${seconds}s | ${ok}`);
  }
}

const table = ["| model | " + PROMPTS.map((p) => p.name).join(" | ") + " |", "|---|" + PROMPTS.map(() => "---").join("|") + "|"];
for (const model of present) {
  table.push(`| ${model} | ` + PROMPTS.map((p) => { const r = rows.find((x) => x.model === model && x.prompt === p.name)!; return `${r.seconds}s, ${r.ok}`; }).join(" | ") + " |");
}
const answers = rows.map((r) => [`### ${r.model} - ${r.prompt}`, `${r.seconds} s, ${r.ok}`, "", "```", r.text, "```", ""].join("\n"));
writeFileSync(REPORT, [
  "# AI model bake-off (backend Plan 3, Task 15)", "",
  `Date: ${new Date().toISOString().slice(0, 10)}. Same four prompts per model; JSON prompts use the app's schema instruction. Missing from the catalog: ${missing.join(", ") || "none"}.`, "",
  "## Results (time, outcome)", "", ...table, "",
  "## COO recommendation", "", "(added after reading the answers)", "",
  "## Answers (first 1,200 characters)", "", ...answers,
].join("\n"));
console.log("wrote report");
