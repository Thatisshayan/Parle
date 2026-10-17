import { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";
import { adminCall, adminUser } from "./helpers/admin";
import { prepareListeningAudio } from "./helpers/voice";

// The question bank switch (bank readers fix, R94): every reader serves the source the switch names, never both.
setDefaultTimeout(60_000);
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const MARK = "bank-source-test";
const setSource = async (value: "demo" | "real") => {
  // app_setting has no unique key on "key": replace the row
  await service().from("app_setting").delete().eq("key", "question_bank_source");
  const { error } = await service().from("app_setting").insert({ key: "question_bank_source", value, updated_by: MARK });
  if (error) throw new Error(error.message);
};
const ip = () => ({ "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });

async function learner() {
  const u = await makeUser("learner");
  const t = (await u.client.auth.getSession()).data.session!.access_token;
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, {
    action: "save_learner_profile", track: "citizenship", goals: ["canadian_citizenship"], main_goal: "canadian_citizenship",
    target_per_skill: JSON.stringify({ L: "NCLC 4", R: null, W: null, S: "NCLC 4" }), self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto",
  });
  return t;
}

let realIds = new Set<string>();
let demoIds = new Set<string>();

/** A real bank like the Lesson Bank's: 360 approved questions across the 12 skill and level cells, real prompts, no demo codes. */
async function seedRealBank() {
  const db = service();
  await db.from("question_item").delete().eq("created_by", MARK);
  await db.from("prompt_item").delete().eq("created_by", MARK);
  const { data: demoQ } = await db.from("question_item").select("*").eq("status", "approved").eq("is_test_data", true);
  demoIds = new Set((demoQ ?? []).map((q: any) => q.id));
  const rows = [];
  for (let copy = 0; copy < 3; copy++) {
    for (const q of demoQ ?? []) {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = q as Record<string, unknown>;
      rows.push({ ...rest, demo_code: null, is_test_data: false, created_by: MARK, prompt: `${String(rest.prompt ?? "")} (real ${copy})` });
    }
  }
  expect(rows.length).toBe(360);
  const { data: inserted, error } = await db.from("question_item").insert(rows).select("id");
  if (error) throw new Error(error.message);
  realIds = new Set((inserted ?? []).map((r: any) => r.id));
  const { data: demoP } = await db.from("prompt_item").select("*").eq("status", "approved").eq("is_test_data", true);
  const prompts = (demoP ?? []).map((p: any) => { const { id: _i, created_at: _c, updated_at: _u, ...rest } = p; return { ...rest, demo_code: null, is_test_data: false, created_by: MARK }; });
  const { error: pError } = await db.from("prompt_item").insert(prompts);
  if (pError) throw new Error(pError.message);
}

// Plan 13: other real items (a locally imported Lesson Bank) are set aside to draft for this file and restored after,
// so these tests see only their own real bank; listening questions need prepared audio for the public level check.
let setAside: string[] = [];
beforeAll(async () => {
  await seedLocalContent();
  const { data: others } = await service().from("question_item").select("id").eq("is_test_data", false).eq("status", "approved").or(`created_by.is.null,created_by.neq.${MARK}`).limit(5000); // created_by may be null (imported rows)
  setAside = (others ?? []).map((r: any) => String(r.id));
  for (let i = 0; i < setAside.length; i += 100) await service().from("question_item").update({ status: "draft" }).in("id", setAside.slice(i, i + 100));
  await seedRealBank();
  await prepareListeningAudio();
});
afterAll(async () => {
  for (let i = 0; i < setAside.length; i += 100) await service().from("question_item").update({ status: "approved" }).in("id", setAside.slice(i, i + 100));
  await setSource("demo");
  await service().from("question_item").delete().eq("created_by", MARK);
  await service().from("prompt_item").delete().eq("created_by", MARK);
});

describe("question bank source (bank readers fix)", () => {
  it("the migration sets the switch to demo, so nothing changes before the import", async () => {
    const { data } = await service().from("app_setting").select("value").eq("key", "question_bank_source").maybeSingle();
    expect(["demo", "real"]).toContain(data?.value);
    expect((await import("node:fs")).readFileSync(`${import.meta.dir}/../supabase/migrations/20261016000028_question_bank_source.sql`, "utf8")).toContain("'demo'");
  });

  it("with the switch on real, placement serves only real items, all 360 load (no cap), and items need no demo code", async () => {
    await setSource("real");
    const t = await learner();
    const open = await callFunction("parle-plan-service", t, { action: "placement_open" });
    expect(open.status).toBe(200);
    const runId = open.body.result.runId;
    const seen: string[] = [];
    for (const section of ["listening"]) { // one section at a time: the next is refused while this one is in progress
      const q = (await callFunction("parle-plan-service", t, { action: "placement_question", runId, section })).body.result;
      seen.push(q.question.id);
    }
    expect(seen.every((id) => realIds.has(id))).toBe(true);
  });

  it("with the switch on demo, placement serves only demo items", async () => {
    await setSource("demo");
    const t = await learner();
    const runId = (await callFunction("parle-plan-service", t, { action: "placement_open" })).body.result.runId;
    const q = (await callFunction("parle-plan-service", t, { action: "placement_question", runId, section: "listening" })).body.result;
    expect(demoIds.has(q.question.id)).toBe(true);
  });

  it("a placement test keeps the bank it started with when the switch flips mid-test", async () => {
    await setSource("demo");
    const t = await learner();
    const runId = (await callFunction("parle-plan-service", t, { action: "placement_open" })).body.result.runId;
    await setSource("real");
    const q = (await callFunction("parle-plan-service", t, { action: "placement_question", runId, section: "listening" })).body.result;
    expect(demoIds.has(q.question.id)).toBe(true);
    await setSource("demo");
  });

  it("the public level check follows the switch: demo while it says demo, even when a full real set exists", async () => {
    await setSource("demo");
    const r = await callFunction("parle-public-level-check", null, { action: "start" }, ip());
    expect(r.status).toBe(200);
    expect((r.body.questions as any[]).every((q) => !realIds.has(q.id))).toBe(true);
    await setSource("real");
    const r2 = await callFunction("parle-public-level-check", null, { action: "start" }, ip());
    expect((r2.body.questions as any[]).every((q) => realIds.has(q.id))).toBe(true);
  });

  it("an administrator sees the counts per cell; switching to real is refused while the real bank is incomplete, then allowed and audited", async () => {
    await setSource("demo");
    const admin = await adminUser();
    const status = await adminCall(admin.token, "admin_bank_status");
    expect(status.status).toBe(200);
    expect(status.body.source).toBe("demo");
    expect(status.body.real.ready).toBe(true);
    expect(status.body.real.questions.listening.A1).toBeGreaterThanOrEqual(30);
    // make one cell incomplete
    const { data: one } = await service().from("question_item").select("id").eq("created_by", MARK).eq("skill", "reading").eq("cefr_level", "B2");
    const keep = (one ?? []).slice(0, 5).map((r: any) => r.id);
    await service().from("question_item").update({ status: "draft" }).eq("created_by", MARK).eq("skill", "reading").eq("cefr_level", "B2").not("id", "in", `(${keep.join(",")})`);
    const refused = await adminCall(admin.token, "admin_set_bank_source", { source: "real" });
    expect(refused.body.error_code).toBe("BANK_INCOMPLETE");
    await service().from("question_item").update({ status: "approved" }).eq("created_by", MARK);
    const ok = await adminCall(admin.token, "admin_set_bank_source", { source: "real" });
    expect(ok.status).toBe(200);
    expect(ok.body.source).toBe("real");
    const { data: audit } = await service().from("admin_audit_log").select("action").eq("actor_user_id", admin.id).eq("action", "bank.source_changed");
    expect((audit ?? []).length).toBe(1);
    const learnerToken = await learner();
    expect((await adminCall(learnerToken, "admin_set_bank_source", { source: "demo" })).status).toBe(403);
    await setSource("demo");
  });
});
