-- Test-only stand-in for production's waitlist (production migration 20261014211111, decision #43). Applied by the
-- tests with docker exec psql; never part of supabase/migrations and never run against production. It mirrors the
-- real columns, the unique index and join_waitlist() exactly as read from production in Plan 8 Task 1 Step 1
-- (2026-10-16): one row per address and role, so an address can be on the list once as a learner and once as a tutor.
create table if not exists public.waitlist_signup (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
-- an older local stack has only the first three columns
alter table public.waitlist_signup add column if not exists role text not null default 'learner';
alter table public.waitlist_signup add column if not exists goal text;
alter table public.waitlist_signup add column if not exists locale text;
alter table public.waitlist_signup add column if not exists source text;
alter table public.waitlist_signup add column if not exists consent_at timestamptz not null default now();
create unique index if not exists waitlist_signup_email_role_key on public.waitlist_signup (lower(email), role);
alter table public.waitlist_signup enable row level security;
revoke all on public.waitlist_signup from anon, authenticated;

-- Production's function, verbatim apart from formatting (a local re-run may meet an older version with another
-- return type, so it is dropped first).
drop function if exists public.join_waitlist(text, text, text, text, text);
create function public.join_waitlist(p_email text, p_role text default 'learner', p_goal text default null, p_locale text default null, p_source text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    return json_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if coalesce(p_role, 'learner') not in ('learner', 'tutor') then
    return json_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if p_goal is not null and p_goal not in ('immigration', 'citizenship', 'work', 'conversation', 'travel', 'other') then
    return json_build_object('ok', false, 'error', 'invalid_goal');
  end if;
  insert into public.waitlist_signup (email, role, goal, locale, source)
  values (v_email, coalesce(p_role, 'learner'), p_goal, left(p_locale, 20), left(p_source, 100))
  on conflict (lower(email), role) do nothing;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.join_waitlist(text, text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text) to service_role;
