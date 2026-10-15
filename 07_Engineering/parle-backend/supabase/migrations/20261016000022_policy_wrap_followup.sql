-- R31 (Plan 4 final review), follow-up to 000019:
--  1. a rule that mixed (select auth.uid()) with a bare auth.uid() was skipped: every bare call is now wrapped;
--  2. waitlist_signup predates the backend and is never visited;
--  3. is_admin() is wrapped the same way (no rule uses it today; this keeps future rules once-per-query).
-- The work is a function so the test (and a later migration) can run it again; a second run changes nothing.
create or replace function private.wrap_policy_auth_calls() returns int
language plpgsql set search_path = '' as $$
declare
  p record;
  q text;
  c text;
  changed int := 0;
  uid_re constant text := '(?<!SELECT )auth\.uid\(\)';
  adm_re constant text := '(?<!SELECT )(?<!SELECT public\.)(public\.)?is_admin\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename <> 'waitlist_signup'
  loop
    if p.qual is not null then
      q := regexp_replace(regexp_replace(p.qual, uid_re, '(select auth.uid())', 'g'), adm_re, '(select public.is_admin())', 'g');
      if q <> p.qual then
        execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
        changed := changed + 1;
      end if;
    end if;
    if p.with_check is not null then
      c := regexp_replace(regexp_replace(p.with_check, uid_re, '(select auth.uid())', 'g'), adm_re, '(select public.is_admin())', 'g');
      if c <> p.with_check then
        execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
        changed := changed + 1;
      end if;
    end if;
  end loop;
  return changed;
end $$;
revoke all on function private.wrap_policy_auth_calls() from public, anon, authenticated;

select private.wrap_policy_auth_calls();
