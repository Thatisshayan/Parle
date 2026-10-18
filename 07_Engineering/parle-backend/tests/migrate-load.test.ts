import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";
import { HAS_M3IMM_TASK_FIXTURE, MIGRATION_SPIKE_DIR } from "./helpers/migration-fixtures";

const SPIKE = MIGRATION_SPIKE_DIR;
const read = (f: string) => JSON.parse(readFileSync(`${SPIKE}/${f}`, "utf8"));
function bundle() {
  const tasks = read("m3imm.learner_task.json");
  const email = `migrated-${crypto.randomUUID()}@example.test`;
  const buildyId = crypto.randomUUID();
  const rows = tasks.map((t: any) => ({ ...t, id: crypto.randomUUID(), user_id: buildyId, created_by: email }));
  return { exportedAt: "t", people: [{ buildyId, email, fullName: "Mig Rated", buildyRole: "user" as const }], rows: { learner_task: rows } };
}
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe.skipIf(!HAS_M3IMM_TASK_FIXTURE)("migration loader", () => {
  const target = () => ({ url: LOCAL_URL, serviceKey: localKeys().service });
  it("creates a confirmed login without a password and loads the rows as that person's", async () => {
    const b = bundle();
    const res = await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    expect(res.created).toBe(1);
    const { data: users } = await service().auth.admin.listUsers({ perPage: 1000 });
    const u = users.users.find((x) => x.email === b.people[0].email)!;
    expect(u.email_confirmed_at).toBeTruthy();
    expect(u.user_metadata.full_name).toBe("Mig Rated");
    const { data } = await service().from("learner_task").select("owner_id, user_id").eq("created_by", b.people[0].email);
    expect(data!.length).toBe(35);
    expect(data!.every((r) => r.owner_id === u.id && r.user_id === u.id)).toBe(true);
  }, 30000);
  it("loading the same export twice changes nothing (Review Focus 2)", async () => {
    const b = bundle();
    await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    const again = await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    expect({ created: again.created, reused: again.reused }).toEqual({ created: 0, reused: 1 });
    expect((await service().from("learner_task").select("id").eq("created_by", b.people[0].email)).data!.length).toBe(35);
  }, 30000);
  it("never writes the waitlist table", async () => {
    await expect(loadBundle(target(), { exportedAt: "t", people: [], rows: { waitlist_signup: [{ id: "x" }] } } as any, { adminEmail: "n@x" })).rejects.toThrow("waitlist_signup");
  });
  it("a setting whose key already exists takes Buildy's value instead of failing", async () => {
    const key = `test_setting_${crypto.randomUUID().slice(0, 8)}`;
    await service().from("app_setting").insert({ key, value: "1", updated_by: "seed" });
    const email = `set-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID(), id = crypto.randomUUID();
    const b = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { app_setting: [{ id, key, value: "2", updated_by: buildyId, created_by: email }] } };
    await loadBundle(target(), b, { adminEmail: "n@x" });
    const { data } = await service().from("app_setting").select("id, value").eq("key", key);
    expect(data).toEqual([{ id, value: "2" }]);
  }, 30000);
  it("loading the same export again keeps every row's own timestamps (Review Focus 2)", async () => {
    const b = bundle();
    const stamp = "2026-10-12T05:54:33.636+00:00";
    b.rows.learner_task = b.rows.learner_task.map((r: any) => ({ ...r, created_at: stamp, updated_at: stamp }));
    await loadBundle(target(), b, { adminEmail: "n@x" });
    await loadBundle(target(), b, { adminEmail: "n@x" });
    const { data } = await service().from("learner_task").select("updated_at").eq("id", b.rows.learner_task[0].id).single();
    expect(new Date(data!.updated_at).toISOString()).toBe(new Date(stamp).toISOString());
  }, 30000);
  it("makes every listed admin an administrator, creating a login for an admin who is not in the export", async () => {
    const b = bundle();
    const outside = `admin2-${crypto.randomUUID()}@example.test`;
    await loadBundle(target(), b, { adminEmail: [b.people[0].email, outside] });
    const { data } = await service().auth.admin.listUsers({ perPage: 1000 });
    const roleOf = (e: string) => data.users.find((u) => u.email === e)?.app_metadata?.role;
    expect(roleOf(b.people[0].email)).toBe("admin");
    expect(roleOf(outside)).toBe("admin");
  }, 30000);
  it("refuses before writing anything when a row names someone who is not in the export (final review, Important 2)", async () => {
    const b = bundle();
    const stranger = crypto.randomUUID();
    b.rows.learner_task[0] = { ...b.rows.learner_task[0], user_id: stranger };
    await expect(loadBundle(target(), b, { adminEmail: "n@x" })).rejects.toThrow("not in the export");
    expect((await service().from("learner_task").select("id").eq("created_by", b.people[0].email)).data!.length).toBe(0);
  }, 30000);
  it("takes roles from Buildy only as learner or tutor; admin comes from the admin list alone (final review, Minor 1 raised)", async () => {
    const b = bundle();
    b.rows.ParleIdentity = [{ id: crypto.randomUUID(), created_by: b.people[0].email, role: "admin" }];
    // the database also refuses an "admin" identity row; the login is created first and must not become admin
    await loadBundle(target(), b, { adminEmail: "n@x" }).catch(() => {});
    const { data } = await service().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.find((u) => u.email === b.people[0].email)?.app_metadata?.role).toBe("learner");
  }, 30000);
  it("sets every exported login's role on each load, demoting a former admin (A24, R35)", async () => {
    const b = bundle();
    const { data: made } = await service().auth.admin.createUser({ email: b.people[0].email, email_confirm: true, app_metadata: { role: "admin" } });
    await loadBundle(target(), b, { adminEmail: "n@x" });
    expect((await service().auth.admin.getUserById(made.user!.id)).data.user!.app_metadata.role).toBe("learner");
  }, 30000);
});
