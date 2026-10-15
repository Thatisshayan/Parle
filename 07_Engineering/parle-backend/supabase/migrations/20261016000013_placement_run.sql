-- Server-side placement test runs (backend Plan 3): answer keys and scoring stay on the server (S9, S12, S17).
create table if not exists public.placement_run (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  user_id text not null,
  status text not null default 'open' check (status in ('open', 'finished', 'abandoned')),
  state_json text not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists placement_run_one_open on public.placement_run (user_id) where status = 'open';
alter table public.placement_run enable row level security;
revoke all on public.placement_run from anon, authenticated;
