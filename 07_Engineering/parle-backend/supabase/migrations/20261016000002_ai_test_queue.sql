-- Deterministic AI answers for tests. Read only when the function setting AI_PROVIDER=fake (local staging).
create table if not exists public.ai_test_queue (id bigserial primary key, response text not null, created_at timestamptz not null default now());
alter table public.ai_test_queue enable row level security;
revoke all on public.ai_test_queue from anon, authenticated;
create or replace function public.pop_ai_test_response() returns text language sql security definer set search_path = public as $$
  delete from public.ai_test_queue where id = (select id from public.ai_test_queue order by id limit 1 for update skip locked) returning response;
$$;
revoke all on function public.pop_ai_test_response() from public, anon, authenticated;
grant execute on function public.pop_ai_test_response() to service_role;
