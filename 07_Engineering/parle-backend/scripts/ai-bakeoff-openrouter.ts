import { writeFileSync } from "node:fs";
import { readSecret } from "./lib/secrets";
import { PROMPTS, EXTRA_PROMPTS } from "./lib/bakeoff-prompts";
import { chatOpenRouter, ProviderCallError } from "../supabase/functions/_shared/ai-provider";
import { extractJson, validateJson } from "../supabase/functions/_shared/ai";

/**
 * Plan 10 quality test: the same production request (zero-retention routing) for each candidate, every task three
 * times, so the founder picks the text model from real answers and times. The key is never printed.
 */
const CANDIDATES = ["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite", "nvidia/nemotron-3-super-120b-a12b", "google/gemma-4-31b-it"];
const RUNS = 3;
const REPORT = `${import.meta.dir}/../../../06_Build/export-decoupling/spikes/ai-bakeoff-openrouter-report.md`;
const key = readSecret("OPENROUTER_API_KEY");
const tasks = [...PROMPTS, ...EXTRA_PROMPTS];

type Row = { model: string; task: string; run: number; seconds: number; ok: string; text: string };
const rows: Row[] = [];
for (const model of CANDIDATES) {
  for (const t of tasks) {
    for (let run = 1; run <= RUNS; run++) {
      const system = t.schema ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(t.schema)}` : "You are Parle's French tutor. Reply in plain text.";
      const started = Date.now();
      let text = "", ok = "";
      try {
        text = await chatOpenRouter(key, { model, system, prompt: t.prompt, json: Boolean(t.schema), signal: AbortSignal.timeout(120_000) });
        if (t.schema) {
          const value = extractJson(text);
          const problems = value === null ? ["not JSON"] : validateJson(value, t.schema);
          ok = problems.length ? `invalid (${problems.slice(0, 2).join("; ")})` : "valid";
        } else ok = "text";
      } catch (e) {
        ok = e instanceof ProviderCallError ? `error ${e.status}` : `error (${(e as Error).name})`;
      }
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      rows.push({ model, task: t.name, run, seconds, ok, text: text.slice(0, 1200) });
      console.log(`${model} | ${t.name} | run ${run} | ${seconds}s | ${ok}`);
    }
  }
}

const cell = (model: string, task: string) => {
  const rs = rows.filter((r) => r.model === model && r.task === task);
  const good = rs.filter((r) => r.ok === "valid" || r.ok === "text").length;
  const times = rs.map((r) => r.seconds).sort((a, b) => a - b);
  return `${good}/${rs.length} ok, median ${times[Math.floor(times.length / 2)]}s, max ${times[times.length - 1]}s`;
};
const table = ["| model | " + tasks.map((t) => t.name).join(" | ") + " |", "|---|" + tasks.map(() => "---").join("|") + "|"];
for (const model of CANDIDATES) table.push(`| ${model} | ` + tasks.map((t) => cell(model, t.name)).join(" | ") + " |");
const answers = rows.filter((r) => r.run === 1).map((r) => [`### ${r.model} - ${r.task}`, `${r.seconds} s, ${r.ok}`, "", "```", r.text, "```", ""].join("\n"));
const errors = rows.filter((r) => r.ok.startsWith("error")).map((r) => `- ${r.model}, ${r.task}, run ${r.run}: ${r.ok}`);
writeFileSync(REPORT, [
  "# AI quality test through OpenRouter (Plan 10, Task 3)", "",
  `Date: ${new Date().toISOString().slice(0, 10)}. Production request (zero-retention routing: data_collection deny, zdr true). ${RUNS} runs per task; prices per 1M tokens from OpenRouter's catalogue.`, "",
  "## Results (runs ok, median and slowest time)", "", ...table, "",
  "## Errors", "", ...(errors.length ? errors : ["none"]), "",
  "## COO recommendation and founder decision", "", "(added after reading the answers)", "",
  "## Answers (first run, first 1,200 characters)", "", ...answers,
].join("\n"));
console.log("wrote report");
