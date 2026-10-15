import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { itemStemIsMalformed } from "../../../parle-app/functions/parle-item-stem.helper.ts";

/**
 * B6 (D3): reads every question and prompt in the bank (production read-only, or local) and lists rule problems for the
 * founder to decide. Writes 06_Build/export-decoupling/migration/bank-audit-2026-10.md; prints counts only.
 * usage: bun scripts/checks/bank-audit.ts <prod|local>
 */
type Row = Record<string, any>;
type Option = { id: string; text: string };
const where = process.argv[2];
let url: string, key: string;
if (where === "prod") {
  const { PROD_REF, serviceKey } = await import("../prod/management");
  url = `https://${PROD_REF}.supabase.co`; key = await serviceKey(PROD_REF);
} else if (where === "local") {
  const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
  url = LOCAL_URL; key = localKeys().service;
} else throw new Error("usage: bun scripts/checks/bank-audit.ts <prod|local>");
const db = createClient(url, key, { auth: { persistSession: false } });

async function all(table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from(table).select("*").order("id").range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}
const plain = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function optionsOf(q: Row): Option[] {
  let raw = q.options;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  return (Array.isArray(raw) ? raw : []).map((o: any) => (typeof o === "string" ? { id: o, text: o } : { id: String(o?.id ?? ""), text: String(o?.text ?? "") }));
}
function questionProblems(q: Row): string[] {
  const p: string[] = [];
  const options = optionsOf(q);
  const ids = options.map((o) => o.id);
  const correct = options.find((o) => o.id === q.answer_option_id);
  if (options.length < 2 || options.length > 4) p.push(`${options.length} options (2 to 4 expected)`);
  if (new Set(ids).size !== ids.length) p.push("duplicate option ids");
  if (new Set(options.map((o) => plain(o.text))).size !== options.length) p.push("duplicate option texts");
  if (options.some((o) => !o.id || !o.text.trim())) p.push("an empty option");
  if (!correct) p.push("the answer id is not one of the options");
  if (correct && q.answer && plain(q.answer) !== plain(correct.text)) p.push("saved answer text differs from the correct option");
  if (!String(q.explanation ?? "").trim()) p.push("no explanation");
  if (q.skill === "listening" && !String(q.transcript ?? "").trim()) p.push("listening item without a transcript");
  if (correct && itemStemIsMalformed({ prompt: String(q.prompt ?? ""), options, answer_option_id: q.answer_option_id })) p.push("the stem already holds the answer's subject");
  const stem = plain(`${q.prompt ?? ""}`);
  // plain() strips accents, so "où" is "ou"; the conjunction "ou" can also match, and the founder reads every flagged row
  if (correct && /(^|[\s,«"])ou\s/.test(stem) && stem.includes("?") && !/^(a|au|aux|dans|chez|en|sur|sous|pres|devant|derriere|par|vers)\b/.test(plain(correct.text))) p.push("a where-question whose answer is not a place");
  if (correct && /\bpourquoi\b/.test(stem) && !/^(parce|pour|a cause|car)\b/.test(plain(correct.text))) p.push("a why-question whose answer gives no reason");
  return p;
}
function promptProblems(r: Row): string[] {
  const p: string[] = [];
  if (!String(r.text ?? "").trim()) p.push("no text");
  if (r.kind !== "writing" && r.kind !== "speaking") p.push(`kind "${r.kind}"`);
  if (!["A1", "A2", "B1", "B2"].includes(String(r.cefr_level))) p.push(`level "${r.cefr_level}"`);
  return p;
}

const questions = await all("question_item"), prompts = await all("prompt_item");
const seen = new Map<string, string>();
const lines: string[] = [];
for (const q of questions) {
  const problems = questionProblems(q);
  const sig = plain(`${q.prompt} ${q.passage ?? ""}`);
  if (seen.has(sig)) problems.push(`same question as ${seen.get(sig)}`); else seen.set(sig, q.demo_code || q.id);
  if (problems.length) lines.push(`| ${q.demo_code || q.id} | question | ${q.skill} ${q.cefr_level} | ${q.status} | ${String(q.prompt ?? "").replace(/\|/g, "/").slice(0, 80)} | ${problems.join("; ")} |`);
}
for (const r of prompts) {
  const problems = promptProblems(r);
  if (problems.length) lines.push(`| ${r.demo_code || r.id} | prompt | ${r.kind} ${r.cefr_level} | ${r.status} | ${String(r.text ?? "").replace(/\|/g, "/").slice(0, 80)} | ${problems.join("; ")} |`);
}
const count = (rows: Row[], f: (r: Row) => boolean) => rows.filter(f).length;
const report = [
  `# Question bank audit (B6, D3)`, ``,
  `Run ${new Date().toISOString()} against ${where}. Read only. The founder decides each row (fix, retire, keep).`, ``,
  `Questions: ${questions.length} (approved ${count(questions, (q) => q.status === "approved")}, test data ${count(questions, (q) => q.is_test_data === true)}). Prompts: ${prompts.length}. Total: ${questions.length + prompts.length}.`, ``,
  `| Item | Kind | Skill / level | Status | Text (start) | Problems |`, `|---|---|---|---|---|---|`, ...lines,
  ``, lines.length ? `${lines.length} items have at least one problem.` : `No rule problems found.`, ``,
  `Rules: 2 to 4 options, unique ids and texts, answer among the options and matching the saved answer, an explanation, a transcript for listening, no stem that holds the answer's subject, where-questions answered with a place, why-questions with a reason, no duplicate question; prompts with text, kind and level.`,
].join("\n");
writeFileSync(`${import.meta.dir}/../../../../06_Build/export-decoupling/migration/bank-audit-2026-10.md`, report + "\n");
console.log(`questions ${questions.length}, prompts ${prompts.length}, items with problems ${lines.length}`);
