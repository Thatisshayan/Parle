-- Fixed-window counters for AI and public actions (spec section 6; S10, S15, S29). Server only.
create table if not exists public.rate_limit_hit (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hit enable row level security;
revoke all on public.rate_limit_hit from anon, authenticated;

create or replace function public.take_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_hits int;
begin
  if coalesce(p_key, '') = '' or p_window_seconds is null or p_window_seconds <= 0 or p_max is null or p_max < 0 then
    raise exception 'take_rate_limit: key, a positive window and a max of zero or more are required';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hit as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end; $$;
revoke all on function public.take_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, int, int) to service_role;

create or replace function public.clean_rate_limits() returns int language sql security definer set search_path = public as $$
  with gone as (delete from public.rate_limit_hit where window_start < now() - interval '2 days' returning 1) select count(*)::int from gone;
$$;
revoke all on function public.clean_rate_limits() from public, anon, authenticated;
grant execute on function public.clean_rate_limits() to service_role;
