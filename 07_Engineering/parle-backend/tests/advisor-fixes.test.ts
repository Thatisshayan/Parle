import { describe, it, expect } from "bun:test";

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
