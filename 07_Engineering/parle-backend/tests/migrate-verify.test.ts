import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";
import { verifyLoad } from "../scripts/migrate/verify";

describe("migration verifier", () => {
  it("passes a clean load and flags rows without an owner (Review Focus 1)", async () => {
    const email = `ver-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const rows = Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), user_id: buildyId, created_by: email, status: "planned" }));
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { learner_task: rows } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    const good = await verifyLoad(target, bundle, res);
    expect(good.ok).toBe(true);
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    await db.from("learner_task").update({ owner_id: null }).eq("id", rows[0].id);
    const bad = await verifyLoad(target, bundle, res);
    expect(bad.ok).toBe(false);
    expect(bad.lines.join("\n")).toContain("without an owner");
  }, 30000);
  it("fails when a person id has no account", async () => {
    const email = `ver2-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const rows = [{ id: crypto.randomUUID(), user_id: "someone-unknown", created_by: email, status: "planned" }];
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { learner_task: rows } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    const v = await verifyLoad(target, bundle, res);
    expect(v.ok).toBe(false);
    expect(v.lines.join("\n")).toContain("person ids without an account: 1");
  }, 30000);
});
