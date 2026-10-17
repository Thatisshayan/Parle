import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { planApprove, planImport, readJsonl } from "../scripts/migrate/import-lesson-bank";

const FIX = `${import.meta.dir}/fixtures/lesson-bank-mini`;
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const run = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", "scripts/migrate/import-lesson-bank.ts", ...args], { cwd: `${import.meta.dir}/..` });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};
const clean = async () => {
  await service().from("question_item").delete().like("demo_code", "LBTEST-%");
  await service().from("prompt_item").delete().like("demo_code", "LBTEST-%");
};
const rowsLike = async (table: string) => ((await service().from(table).select("demo_code, status, reviewed_by, is_test_data").like("demo_code", "LBTEST-%").order("demo_code")).data ?? []);

beforeAll(clean);
afterAll(clean);

describe("planning the Lesson Bank import (Plan 13)", () => {
  it("skips codes already present and refuses rows that break the bank's rules", () => {
    const rows = readJsonl(`${FIX}/question_items.jsonl`);
    const plan = planImport("question_item", rows, new Set([rows[0].demo_code]));
    expect(plan.fresh.map((r) => r.demo_code)).toEqual([rows[1].demo_code, rows[2].demo_code]);
    expect(plan.skipped).toBe(1);
    expect(plan.problems).toEqual([]);
    const bad = planImport("question_item", readJsonl(`${FIX}/bad/question_items.jsonl`), new Set());
    expect(bad.problems.map((p) => p.code)).toEqual([rows[1].demo_code]);
  });
  it("approves only cleared codes that are still draft", () => {
    const have = [{ id: "1", demo_code: "A", status: "draft" }, { id: "2", demo_code: "B", status: "approved" }, { id: "3", demo_code: "C", status: "draft" }];
    expect(planApprove(have, new Set(["A", "B"])).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("running the Lesson Bank import on local (Plan 13)", () => {
  it("a dry run writes nothing", async () => {
    const r = run("local", "import", "--bank", FIX);
    expect(r.code).toBe(0);
    expect(r.out).toContain("DRY RUN");
    expect(await rowsLike("question_item")).toEqual([]);
  });
  it("--apply inserts drafts as delivered; a second run inserts nothing", async () => {
    expect(run("local", "import", "--bank", FIX, "--apply").code).toBe(0);
    const qs = await rowsLike("question_item");
    expect(qs.length).toBe(3);
    expect(qs.every((q: any) => q.status === "draft" && q.is_test_data === false && q.reviewed_by.startsWith("AI-generated"))).toBe(true);
    expect((await rowsLike("prompt_item")).length).toBe(2);
    const again = run("local", "import", "--bank", FIX, "--apply");
    expect(again.out).toContain("3 already present");
    expect((await rowsLike("question_item")).length).toBe(3);
  });
  it("a row that breaks a rule stops the import before anything is written", async () => {
    await clean();
    const r = run("local", "import", "--bank", `${FIX}/bad`, "--apply");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("LBTEST-READING-A1-001");
    expect(await rowsLike("question_item")).toEqual([]);
  });
  it("approve sets only the cleared drafts to approved and keeps reviewed_by", async () => {
    await clean();
    run("local", "import", "--bank", FIX, "--apply");
    const before = await rowsLike("question_item");
    expect(run("local", "approve", "--bank", FIX, "--apply").code).toBe(0);
    const after = await rowsLike("question_item");
    expect(after.map((q: any) => [q.demo_code, q.status])).toEqual([
      ["LBTEST-GRAMMAR_VOCABULARY-A1-001", "draft"], ["LBTEST-LISTENING-A1-001", "approved"], ["LBTEST-READING-A1-001", "approved"],
    ]);
    expect(after.map((q: any) => q.reviewed_by)).toEqual(before.map((q: any) => q.reviewed_by));
    expect((await rowsLike("prompt_item")).every((p: any) => p.status === "approved")).toBe(true);
  });
  it("production writes need the founder's go", () => {
    const r = run("prod", "import", "--bank", FIX, "--apply");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("--founder-go");
  });
});
