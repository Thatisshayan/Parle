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
