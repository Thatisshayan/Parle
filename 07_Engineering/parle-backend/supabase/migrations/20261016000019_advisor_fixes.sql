-- Supabase advisor findings after the first production deploy (Plan 4 Task 11; migration/prod-advisors-2026-10-15.md).

-- Fixed search path for the helpers used by triggers and read rules (their bodies are fully qualified).
alter function public.set_updated_at() set search_path = '';
alter function public.app_role() set search_path = '';
alter function public.is_admin() set search_path = '';

-- Read rules work out the signed-in user once per query instead of once per row: auth.uid() -> (select auth.uid()).
do $$
declare p record;
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    if p.qual ~ 'auth\.uid\(\)' and p.qual !~ 'SELECT auth\.uid\(\)' then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, replace(p.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if p.with_check ~ 'auth\.uid\(\)' and p.with_check !~ 'SELECT auth\.uid\(\)' then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, replace(p.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;
  end loop;
end $$;

-- Payout countries are public (R1, migration 000018); the owner-only read rule is redundant.
drop policy if exists "tutor_payout_country: owner reads" on public."tutor_payout_country";

-- Owner lookups on placement runs (account deletion, cleanup).
create index if not exists placement_run_owner_id_idx on public.placement_run (owner_id);
