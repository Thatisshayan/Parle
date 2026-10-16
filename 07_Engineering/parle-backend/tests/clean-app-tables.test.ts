import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";
import { cleanAppTables, APP_TABLES } from "../scripts/migrate/clean-app-tables";

const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "-i", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("cut-over clean (Review Focus 3)", () => {
  it("empties every app table and removes logins except the admin, and never touches the waitlist", async () => {
    psql(readFileSync(`${import.meta.dir}/../supabase/tests-only/waitlist_signup.sql`, "utf8"));
    psql("delete from public.waitlist_signup; insert into public.waitlist_signup (email) values ('a@x.test'), ('b@x.test'), ('c@x.test')");
    const admin = `admin-${crypto.randomUUID()}@example.test`, email = `clean-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const admin2 = `admin2-${crypto.randomUUID()}@example.test`;
    await service().auth.admin.createUser({ email: admin, email_confirm: true });
    await service().auth.admin.createUser({ email: admin2, email_confirm: true });
    await loadBundle({ url: LOCAL_URL, serviceKey: localKeys().service }, { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" }], rows: { learner_task: [{ id: crypto.randomUUID(), user_id: buildyId, created_by: email, status: "planned" }] } }, { adminEmail: "n@x" });
    const r = await cleanAppTables({ url: LOCAL_URL, serviceKey: localKeys().service }, [admin, admin2]);
    expect(r.waitlistBefore).toBe(3);
    expect(r.waitlistAfter).toBe(3);
    expect(APP_TABLES.length).toBe(48);
    // settings written by migrations (AI models, global AI cap) are not Buildy data and stay
    for (const t of APP_TABLES.filter((x) => x !== "app_setting")) expect(`${t}: ${psql(`select count(*) from public."${t}"`)}`).toBe(`${t}: 0`);
    expect(psql("select string_agg(key, ',' order by key) from public.app_setting")).toBe("ai_global_daily_cap,ai_model_fast,ai_model_standard,require_payout_account");
    expect(psql("select string_agg(email, ',' order by email) from auth.users")).toBe([admin, admin2].sort().join(","));
    expect(psql("select count(*) from public.waitlist_signup")).toBe("3");
  }, 120000);
  it("finishes when someone joins the waitlist during the clean, and stops if the waitlist shrinks (A23, R33)", async () => {
    psql(readFileSync(`${import.meta.dir}/../supabase/tests-only/waitlist_signup.sql`, "utf8"));
    psql("delete from public.waitlist_signup; insert into public.waitlist_signup (email) values ('a@x.test'), ('b@x.test')");
    const admin = `admin-${crypto.randomUUID()}@example.test`;
    await service().auth.admin.createUser({ email: admin, email_confirm: true });
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const r = await cleanAppTables(target, [admin], { afterTables: async () => { psql("insert into public.waitlist_signup (email) values ('late@x.test')"); } });
    expect([r.waitlistBefore, r.waitlistAfter]).toEqual([2, 3]);
    await expect(cleanAppTables(target, [admin], { afterTables: async () => { psql("delete from public.waitlist_signup where email = 'late@x.test'"); } })).rejects.toThrow("waitlist shrank");
  }, 120000);
});
