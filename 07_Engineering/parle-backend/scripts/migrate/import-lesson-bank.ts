import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promptProblems, questionProblems, type Row } from "../lib/bank-rules";

/**
 * Plan 13: imports the Lesson Bank v1 question bank (adapted from the Lesson Bank session's proposed-import.ts).
 *   import    inserts final/question_items.jsonl and final/prompt_items.jsonl as "draft", skipping demo_codes already in
 *             the table (demo_code has no unique constraint); refuses to write anything when a row breaks the bank's
 *             rules (scripts/lib/bank-rules.ts, the same rules as bank-audit.ts)
 *   approve   sets "approved" only for codes in final/cleared-codes.txt that are still "draft"; reviewed_by is kept as
 *             delivered (it is truthful per row; never "human reviewed")
 * A dry run unless --apply. Production writes also need --founder-go (the founder's explicit go). Prints counts and
 * demo_codes only.
 * usage: bun scripts/migrate/import-lesson-bank.ts <local|prod> <import|approve> [--apply] [--founder-go] [--bank <final dir>]
 */
const DEFAULT_BANK = "D:/AgentDevWork/repos/Parle Lesson Bank/final";
type Table = "question_item" | "prompt_item";
type Problem = { code: string; problems: string[] };
const stableJson = (value: unknown): string => JSON.stringify(value === null || value === undefined ? null : Array.isArray(value)
  ? value.map((entry) => JSON.parse(stableJson(entry)))
  : typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, JSON.parse(stableJson(entry))]))
    : value);

export const readJsonl = (file: string): Row[] => readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, index) => {
  if (!line.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(line); }
  catch (error) { throw new Error(`${file}:${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file}:${index + 1}: expected a JSON object`);
  return [value as Row];
});

export function rowProblems(table: Table, r: Row): string[] {
  const p = table === "question_item" ? questionProblems(r) : promptProblems(r);
  if (r.status !== "draft") p.push(`status is ${r.status}, expected draft`);
  if (r.is_test_data !== false) p.push("is_test_data must be false for the real bank");
  if (typeof r.demo_code !== "string" || !r.demo_code.trim()) p.push("demo_code must be non-empty text");
  else if (r.demo_code !== r.demo_code.trim()) p.push("demo_code must not have surrounding whitespace");
  return p;
}

/** Which rows to insert: new codes only; every new row must pass the rules, and codes must be unique in the file. */
export function planImport(table: Table, rows: Row[], existing: Set<string> | Row[]): { fresh: Row[]; skipped: number; problems: Problem[]; changedExisting: string[] } {
  const existingRows = Array.isArray(existing) ? existing : [];
  const existingCodes = new Set(Array.isArray(existing) ? existingRows.map((r) => String(r.demo_code ?? "")) : existing);
  const fresh = rows.filter((r) => !existingCodes.has(String(r.demo_code ?? "")));
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const r of rows) {
    const code = String(r.demo_code ?? "");
    const isExisting = existingCodes.has(code);
    const p = isExisting ? [] : rowProblems(table, r);
    if (seen.has(code)) p.push("demo_code repeated in the file");
    seen.add(code);
    if (p.length) problems.push({ code: String(r.demo_code), problems: p });
  }
  const changedExisting = rows.filter((row) => {
    if (!existingCodes.has(String(row.demo_code ?? ""))) return false;
    const stored = existingRows.find((item) => String(item.demo_code ?? "") === String(row.demo_code ?? ""));
    return Boolean(stored && Object.keys(row).some((key) => key !== "status" && key !== "reviewed_by" && stableJson(stored[key]) !== stableJson(row[key])));
  }).map((row) => String(row.demo_code));
  return { fresh, skipped: rows.length - fresh.length, problems, changedExisting: [...new Set(changedExisting)] };
}

/** Rows to approve: cleared codes still in draft (approved rows and uncleared codes are left alone). */
export const planApprove = (have: Row[], cleared: Set<string>): Row[] => have.filter((r) => cleared.has(r.demo_code) && r.status === "draft");

const cellOf = (table: Table, r: Row) => `${table === "question_item" ? r.skill : r.kind} ${r.cefr_level}`;
function cells(table: Table, rows: Row[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(cellOf(table, r), (counts.get(cellOf(table, r)) ?? 0) + 1);
  return [...counts.entries()].sort().map(([k, v]) => `${k}: ${v}`).join(", ");
}

async function existing(db: SupabaseClient, table: Table): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from(table).select("*").order("id").range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

async function importTable(db: SupabaseClient, table: Table, file: string, apply: boolean) {
  const rows = readJsonl(file);
  const have = await existing(db, table);
  const plan = planImport(table, rows, have);
  console.log(`${table}: ${rows.length} in file, ${plan.skipped} already present (skipped), ${plan.fresh.length} to insert, ${plan.problems.length} with problems`);
  if (plan.fresh.length) console.log(`  to insert by cell: ${cells(table, plan.fresh)}`);
  if (plan.changedExisting.length) console.log(`  ! existing codes have changed source content; left unchanged for manual review: ${plan.changedExisting.join(", ")}`);
  for (const p of plan.problems) console.log(`  ! ${p.code}: ${p.problems.join("; ")}`);
  if (plan.problems.length) throw new Error(`${table}: fix the rows with problems first; nothing was written`);
  return plan.fresh;
}

async function main() {
  const args = process.argv.slice(2);
  const [where, step] = args;
  const apply = args.includes("--apply");
  const bankIndex = args.indexOf("--bank");
  if (bankIndex >= 0 && (!args[bankIndex + 1] || args[bankIndex + 1].startsWith("--"))) {
    throw new Error("--bank needs a directory path");
  }
  const bankDir = bankIndex >= 0 ? args[bankIndex + 1] : DEFAULT_BANK;
  if (where !== "local" && where !== "prod") throw new Error("usage: bun scripts/migrate/import-lesson-bank.ts <local|prod> <import|approve> [--apply] [--founder-go] [--bank <dir>]");
  if (step !== "import" && step !== "approve") throw new Error("step must be import or approve");
  if (where === "prod" && apply && !args.includes("--founder-go")) throw new Error("production writes need the founder's explicit go: add --founder-go only after it is given");
  let url: string, key: string;
  if (where === "prod") {
    const { PROD_REF, serviceKey } = await import("../prod/management");
    url = `https://${PROD_REF}.supabase.co`; key = await serviceKey(PROD_REF);
  } else {
    const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
    url = LOCAL_URL; key = localKeys().service;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`${apply ? "APPLY" : "DRY RUN (add --apply to write)"}: ${step} on ${where}, bank ${bankDir}`);

  if (step === "import") {
    // both files are checked before either is written
    const questions = await importTable(db, "question_item", join(bankDir, "question_items.jsonl"), apply);
    const prompts = await importTable(db, "prompt_item", join(bankDir, "prompt_items.jsonl"), apply);
    if (!apply) return;
    const { error } = await db.rpc("import_lesson_bank_atomic", { p_questions: questions, p_prompts: prompts });
    if (error) throw new Error(`atomic Lesson Bank import: ${error.message}`);
    console.log(`question_item: inserted ${questions.length}`);
    console.log(`prompt_item: inserted ${prompts.length}`);
    return;
  }

  const cleared = new Set(readFileSync(join(bankDir, "cleared-codes.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  for (const table of ["question_item", "prompt_item"] as const) {
    const have = await existing(db, table);
    const todo = planApprove(have, cleared);
    const present = new Set(have.map((r) => r.demo_code));
    const isPrompt = (c: string) => /^[A-Z]+-(WRITING|SPEAKING)-/.test(c);
    const missing = [...cleared].filter((c) => !present.has(c) && (table === "prompt_item") === isPrompt(c));
    console.log(`${table}: ${todo.length} cleared drafts to approve${missing.length ? `; ${missing.length} cleared codes not in the table (import first)` : ""}`);
    if (!apply || !todo.length) continue;
    for (let i = 0; i < todo.length; i += 100) {
      const { error } = await db.from(table).update({ status: "approved" }).in("id", todo.slice(i, i + 100).map((r) => r.id)).eq("status", "draft");
      if (error) throw new Error(`${table} approve at ${i}: ${error.message}`);
    }
    console.log(`${table}: approved ${todo.length}`);
  }
}

if (import.meta.main) await main();
