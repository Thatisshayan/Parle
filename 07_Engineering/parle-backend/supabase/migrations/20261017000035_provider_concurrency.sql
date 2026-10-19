-- Bounded, cross-instance leases for paid provider calls (AUD-P2-07).
create table if not exists public.provider_request_lease (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('ai_openrouter', 'ai_nvidia', 'speech_stt', 'speech_tts')),
  expires_at timestamptz not null
);
create index if not exists provider_request_lease_role_expiry_idx
  on public.provider_request_lease (provider_role, expires_at);
alter table public.provider_request_lease enable row level security;
revoke all on public.provider_request_lease from public, anon, authenticated;

-- Serialize admission per role so concurrent Edge Function instances cannot exceed the active lease limit.
create or replace function public.acquire_provider_lease(p_role text, p_max_active int, p_lease_seconds int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_role is null or p_role not in ('ai_openrouter', 'ai_nvidia', 'speech_stt', 'speech_tts')
     or p_max_active is null or p_max_active < 1 or p_max_active > 100
     or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 120 then
    raise exception 'acquire_provider_lease: invalid role or limit';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_role, 0));
  delete from public.provider_request_lease where provider_role = p_role and expires_at <= now();
  if (select count(*) from public.provider_request_lease where provider_role = p_role) >= p_max_active then
    return null;
  end if;
  insert into public.provider_request_lease (provider_role, expires_at)
    values (p_role, now() + make_interval(secs => p_lease_seconds)) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.acquire_provider_lease(text, int, int) from public, anon, authenticated;
grant execute on function public.acquire_provider_lease(text, int, int) to service_role;

create or replace function public.release_provider_lease(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  delete from public.provider_request_lease where id = p_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end; $$;
revoke all on function public.release_provider_lease(uuid) from public, anon, authenticated;
grant execute on function public.release_provider_lease(uuid) to service_role;
