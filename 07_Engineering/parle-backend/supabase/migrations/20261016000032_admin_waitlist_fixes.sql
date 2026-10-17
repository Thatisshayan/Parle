-- Plan 11 (pre-launch close-out), administration and waitlist fixes: A73 (R81), A79 (R87).

-- A73 (R81): no path publishes a paused tutor's listing (Buildy-era approval and demo-review code, the hourly refresh,
-- SQL). The listing is remembered on the pause so that enabling the account republishes it.
create or replace function private.keep_paused_listing_hidden() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user text := coalesce(new.tutor_user_id, new.owner_id::text);
begin
  if new.is_published is true and exists (select 1 from public.account_status s where s.user_id::text = v_user and s.status = 'disabled') then
    new.is_published := false;
    update public.account_status set unpublished_listing_ids = array_append(coalesce(unpublished_listing_ids, '{}'), new.id::text)
     where user_id::text = v_user and not (new.id::text = any(coalesce(unpublished_listing_ids, '{}')));
  end if;
  return new;
end; $$;
revoke all on function private.keep_paused_listing_hidden() from public, anon, authenticated;
drop trigger if exists keep_paused_listing_hidden on public.tutor_public_profile;
create trigger keep_paused_listing_hidden before insert or update of is_published on public.tutor_public_profile
  for each row execute function private.keep_paused_listing_hidden();

-- A79 (R87): the Send screen counts the addresses Send would queue now (the same rules as waitlist_queue: one per
-- address, tutors only for the founding-tutor email, unsubscribed and already-queued addresses left out).
create or replace function public.waitlist_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'learners', (select count(distinct lower(trim(w.email))) from public.waitlist_signup w where coalesce(w.role, 'learner') <> 'tutor'),
    'tutors', (select count(distinct lower(trim(w.email))) from public.waitlist_signup w where w.role = 'tutor'),
    'unsubscribed', (select count(*) from public.waitlist_unsubscribe),
    'campaigns', (select jsonb_object_agg(c.campaign, jsonb_build_object(
        'blanks', c.blanks, 'started_at', c.started_at, 'finished_at', c.finished_at, 'last_error', c.last_error,
        'queued', (select count(*) from public.waitlist_send s where s.campaign = c.campaign and s.status = 'queued'),
        'sent', (select count(*) from public.waitlist_send s where s.campaign = c.campaign and s.status = 'sent'),
        'failed', (select count(*) from public.waitlist_send s where s.campaign = c.campaign and s.status = 'failed'),
        'skipped', (select count(*) from public.waitlist_send s where s.campaign = c.campaign and s.status = 'skipped_unsubscribed'),
        'to_send', (select count(distinct lower(trim(w.email))) from public.waitlist_signup w
                     where coalesce(trim(w.email), '') <> '' and (c.campaign = 'launch' or w.role = 'tutor')
                       and not exists (select 1 from public.waitlist_unsubscribe u where u.email = lower(trim(w.email)))
                       and not exists (select 1 from public.waitlist_send s where s.campaign = c.campaign and s.email = lower(trim(w.email))))))
       from public.waitlist_campaign c),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'campaign', f.campaign, 'email', f.email, 'error', f.error) order by f.updated_at desc)
       from (select * from public.waitlist_send where status = 'failed' order by updated_at desc limit 50) f), '[]'::jsonb));
end; $$;
grant execute on function public.waitlist_overview() to service_role;
