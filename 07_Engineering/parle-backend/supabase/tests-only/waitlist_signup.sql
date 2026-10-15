-- Test-only stand-in for production's waitlist table (production migration 20261014211111). Applied by
-- tests/clean-app-tables.test.ts with docker exec psql; never part of supabase/migrations.
create table if not exists public.waitlist_signup (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.waitlist_signup enable row level security;
