import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  BANK_SOURCE_KEY,
  bankSourceFrom,
  selectApprovedQuestionItems,
  validatePromptBank,
  validateQuestionBank,
  type BankSource,
  type PromptItem,
} from "../../_app/src/lib/placement-test.ts";
import { AdminError, audit, type AdminContext } from "./context.ts";

// The question bank switch on the admin Content page (bank readers fix, R94): which bank every reader serves.
const SKILLS = ["listening", "reading", "grammar_vocabulary"] as const;
const KINDS = ["writing", "speaking"] as const;
const LEVELS = ["A1", "A2", "B1", "B2"] as const;

async function rowsOf(db: SupabaseClient, table: "question_item" | "prompt_item", demo: boolean): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await db.from(table).select("*").eq("status", "approved").eq("is_test_data", demo).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Counts per cell and whether the bank meets the placement test's completeness rules. */
async function bankSummary(db: SupabaseClient, source: BankSource) {
  const questions = selectApprovedQuestionItems(await rowsOf(db, "question_item", source === "demo"), source);
  const prompts = (await rowsOf(db, "prompt_item", source === "demo")) as unknown as PromptItem[];
  const questionCounts = Object.fromEntries(SKILLS.map((s) => [s, Object.fromEntries(LEVELS.map((l) => [l, questions.filter((q) => q.skill === s && q.cefr_level === l).length]))]));
  const promptCounts = Object.fromEntries(KINDS.map((k) => [k, Object.fromEntries(LEVELS.map((l) => [l, prompts.filter((p) => p.kind === k && p.cefr_level === l).length]))]));
  return { questions: questionCounts, prompts: promptCounts, ready: validateQuestionBank(questions) && validatePromptBank(prompts) };
}

async function currentSource(db: SupabaseClient): Promise<BankSource> {
  const { data, error } = await db.from("app_setting").select("value").eq("key", BANK_SOURCE_KEY).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return bankSourceFrom(data?.value);
}

export async function bankStatus(ctx: AdminContext): Promise<Record<string, unknown>> {
  const [source, demo, real] = await Promise.all([currentSource(ctx.db), bankSummary(ctx.db, "demo"), bankSummary(ctx.db, "real")]);
  return { source, demo, real };
}

/** Switches the bank; switching to real is refused while the real bank is incomplete. Audited. */
export async function setBankSource(ctx: AdminContext): Promise<Record<string, unknown>> {
  const next = ctx.body.source === "demo" ? "demo" : ctx.body.source === "real" ? "real" : null;
  if (!next) throw new AdminError("SOURCE_INVALID", 400, "Choose the demo bank or the real bank.");
  const before = await currentSource(ctx.db);
  if (next === "real" && !(await bankSummary(ctx.db, "real")).ready) {
    throw new AdminError("BANK_INCOMPLETE", 409, "The real bank is not complete yet: every skill and level needs enough approved questions and prompts.");
  }
  const { data: updated, error } = await ctx.db.from("app_setting").update({ value: next, updated_by: ctx.caller.email }).eq("key", BANK_SOURCE_KEY).select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) {
    const { error: insertError } = await ctx.db.from("app_setting").insert({ key: BANK_SOURCE_KEY, value: next, updated_by: ctx.caller.email });
    if (insertError) throw new Error(insertError.message);
  }
  await audit(ctx, { action: "bank.source_changed", targetType: "app_setting", targetId: BANK_SOURCE_KEY, oldValue: { source: before }, newValue: { source: next } });
  return { source: next };
}
