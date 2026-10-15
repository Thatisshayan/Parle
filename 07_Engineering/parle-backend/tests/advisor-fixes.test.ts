import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();

/** Supabase advisor findings from the first production deploy (Plan 4 Task 11; prod-advisors-2026-10-15.md). */
describe("advisor fixes", () => {
  it("helper functions have a fixed search path", () => {
    const loose = psql("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('set_updated_at','app_role','is_admin') and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))");
    expect(loose).toBe("");
  });
  it("read rules work out the signed-in user once per query, not once per row", () => {
    const perRow = psql("select tablename || ': ' || policyname from pg_policies where schemaname = 'public' and (qual ~ 'auth\\.uid\\(\\)' and qual !~ 'SELECT auth\\.uid\\(\\)')");
    expect(perRow).toBe("");
  });
  it("payout countries have a single read rule, and placement runs are indexed by owner", () => {
    expect(psql("select count(*) from pg_policies where schemaname = 'public' and tablename = 'tutor_payout_country' and cmd = 'SELECT'")).toBe("1");
    expect(psql("select count(*) from pg_indexes where schemaname = 'public' and tablename = 'placement_run' and indexdef like '%(owner_id)%'")).toBe("1");
  });
});

describe("payout countries are public, their authors are not (final review, Minor 6 raised)", () => {
  it("a signed-in learner reads the country list but not who created the rows", async () => {
    const { makeUser } = await import("./helpers/users");
    const u = await makeUser("learner");
    expect((await u.client.from("tutor_payout_country").select("country_name, country_code, status").limit(1)).error).toBeNull();
    expect((await u.client.from("tutor_payout_country").select("created_by").limit(1)).error).not.toBeNull();
    expect((await u.client.from("tutor_payout_country").select("owner_id").limit(1)).error).not.toBeNull();
  });
});

describe("policy wrap follow-up (A22, R31)", () => {
  it("wraps every bare call in a rule that mixes wrapped and bare auth.uid(), and wraps is_admin()", () => {
    psql("drop table if exists public.r31_probe; create table public.r31_probe (id int, owner_id uuid); alter table public.r31_probe enable row level security; create policy r31_mixed on public.r31_probe for select using (owner_id = (select auth.uid()) or owner_id = auth.uid() or public.is_admin())");
    try {
      expect(Number(psql("select private.wrap_policy_auth_calls()"))).toBeGreaterThan(0);
      const qual = psql("select qual from pg_policies where tablename = 'r31_probe'");
      expect(qual).not.toMatch(/(?<!SELECT )auth\.uid\(\)/);
      expect(qual).toMatch(/SELECT (public\.)?is_admin\(\)/);
      expect(psql("select private.wrap_policy_auth_calls()")).toBe("0"); // running it again changes nothing (Review Focus 4)
    } finally {
      psql("drop table if exists public.r31_probe");
    }
  });
  it("never rewrites the waitlist's rules", () => {
    psql(readFileSync(`${import.meta.dir}/../supabase/tests-only/waitlist_signup.sql`, "utf8"));
    psql("drop policy if exists r31_waitlist_probe on public.waitlist_signup; create policy r31_waitlist_probe on public.waitlist_signup for select to authenticated using (auth.uid() is not null)");
    try {
      psql("select private.wrap_policy_auth_calls()");
      expect(psql("select qual from pg_policies where policyname = 'r31_waitlist_probe'")).toMatch(/^\(auth\.uid\(\) IS NOT NULL\)$/);
    } finally {
      psql("drop policy if exists r31_waitlist_probe on public.waitlist_signup");
    }
  });
  it("no rule in public evaluates auth.uid() or is_admin() once per row, mixed rules included", () => {
    const rows = psql("select tablename || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') from pg_policies where schemaname = 'public' and tablename <> 'waitlist_signup'").split("\n").filter(Boolean);
    expect(rows.filter((r) => /(?<!SELECT )auth\.uid\(\)/.test(r) || /(?<!SELECT )(?<!SELECT public\.)(public\.)?is_admin\(\)/.test(r))).toEqual([]);
  });
  it("only the database owner may run the wrap", () => {
    expect(psql("select has_function_privilege('authenticated', 'private.wrap_policy_auth_calls()', 'execute')")).toBe("f");
  });
});
