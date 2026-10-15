import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";

const SPIKE = "D:/AgentDevWork/parle-migration-data/spike";
const read = (f: string) => JSON.parse(readFileSync(`${SPIKE}/${f}`, "utf8"));
function bundle() {
  const tasks = read("m3imm.learner_task.json");
  const email = `migrated-${crypto.randomUUID()}@example.test`;
  const buildyId = crypto.randomUUID();
  const rows = tasks.map((t: any) => ({ ...t, id: crypto.randomUUID(), user_id: buildyId, created_by: email }));
  return { exportedAt: "t", people: [{ buildyId, email, fullName: "Mig Rated", buildyRole: "user" as const }], rows: { learner_task: rows } };
}
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("migration loader", () => {
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
});
