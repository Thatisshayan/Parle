-- Plan 12 (R122): a payout webhook claim records when it was taken and is cleared once handled; a claim older than
-- the stale window (a worker stopped before finishing) may be taken again, so Stripe's retry is handled. Rows written
-- by the lesson webhook and every existing row have claimed_at null (handled).
alter table public.stripe_event add column if not exists claimed_at timestamptz;

create or replace function public.stripe_event_retake(p_id text, p_stale_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.stripe_event set claimed_at = now()
  where id = p_id and claimed_at is not null and claimed_at < now() - make_interval(secs => p_stale_seconds);
  return found;
end; $$;
revoke all on function public.stripe_event_retake(text, int) from public, anon, authenticated;
grant execute on function public.stripe_event_retake(text, int) to service_role;

-- Plan 12 (R128): one AI reply at a time per learner, so two tabs with one message left cannot both run the AI. A
-- claim left by a stopped worker frees itself after p_seconds.
create table if not exists public.tutor_reply_claim (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_until timestamptz not null
);
alter table public.tutor_reply_claim enable row level security;
revoke all on public.tutor_reply_claim from anon, authenticated;

-- The claim returns its own token (claimed_until), or null when another reply holds it; only that token releases it, so a
-- holder whose claim went stale never frees someone else's (Plan 12 final review).
drop function if exists public.tutor_reply_claim(uuid, int);
drop function if exists public.tutor_reply_release(uuid);
create or replace function public.tutor_reply_claim(p_user uuid, p_seconds int) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz := clock_timestamp() + make_interval(secs => p_seconds); v_rows int;
begin
  insert into public.tutor_reply_claim (user_id, claimed_until) values (p_user, v_until)
  on conflict (user_id) do update set claimed_until = excluded.claimed_until
    where public.tutor_reply_claim.claimed_until < now();
  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then v_until end;
end; $$;
create or replace function public.tutor_reply_release(p_user uuid, p_token timestamptz) returns void
language sql security definer set search_path = '' as $$
  delete from public.tutor_reply_claim where user_id = p_user and claimed_until = p_token;
$$;
revoke all on function public.tutor_reply_claim(uuid, int) from public, anon, authenticated;
revoke all on function public.tutor_reply_release(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.tutor_reply_claim(uuid, int) to service_role;
grant execute on function public.tutor_reply_release(uuid, timestamptz) to service_role;
