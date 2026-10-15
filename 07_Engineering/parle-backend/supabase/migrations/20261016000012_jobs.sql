create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Where scheduled jobs call functions, and the secret they present. Set by setup-local-functions-env.ts (staging) and Plan 4 (production).
create table if not exists private.job_config (name text primary key, value text not null);

create or replace function public.set_job_config(p_functions_url text, p_cron_secret text) returns void
language sql security definer set search_path = private, public as $$
  insert into private.job_config (name, value) values ('functions_url', p_functions_url), ('cron_secret', p_cron_secret)
  on conflict (name) do update set value = excluded.value;
$$;
create or replace function public.job_config_names() returns text[] language sql security definer set search_path = private as $$
  select coalesce(array_agg(name order by name), '{}') from private.job_config;
$$;
revoke all on function public.set_job_config(text, text), public.job_config_names() from public, anon, authenticated;
grant execute on function public.set_job_config(text, text), public.job_config_names() to service_role;

create or replace function private.call_function(p_name text) returns bigint language plpgsql security definer set search_path = private, public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.job_config where name = 'functions_url';
  select value into v_secret from private.job_config where name = 'cron_secret';
  if v_url is null or v_secret is null then raise warning 'job_config missing; % not called', p_name; return null; end if;
  return net.http_post(url := v_url || '/' || p_name, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), timeout_milliseconds := 120000);
end; $$;

-- Daily clean-up: expired public level-check runs (S29) and old rate-limit windows.
create or replace function private.daily_cleanup() returns void language sql security definer set search_path = public as $$
  delete from public."ParlePublicLevelCheckRun" where coalesce(expires_at, '') <> '' and expires_at::timestamptz < now() - interval '1 day';
  select public.clean_rate_limits();
$$;

select cron.schedule('parle-marketplace-refresh', '7 * * * *', $$select private.call_function('parle-marketplace-refresh')$$);
select cron.schedule('parle-daily-cleanup', '23 3 * * *', $$select private.daily_cleanup()$$);
select cron.schedule('parle-billing-recheck', '41 4 * * *', $$select private.call_function('parle-billing-recheck')$$);
