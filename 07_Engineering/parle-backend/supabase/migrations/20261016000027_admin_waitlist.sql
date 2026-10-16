-- Plan 8 (spec 06_Build/export-decoupling/specs/2026-10-16-plan-8-account-admin-waitlist-design.md).
-- Paused accounts, the waitlist send records, unsubscribes and campaigns, and the server-side SQL the admin service
-- uses. waitlist_signup and join_waitlist() are NOT altered: no column, rule, grant, trigger, index or foreign key is
-- added to them. waitlist_overview() and waitlist_queue() read the list; waitlist_delete_all() (the owner's
-- "Delete the waitlist (after launch)" button, spec 4.6) is the only code that deletes from it. Functions that touch
-- the list are plpgsql, so this file also applies where the list does not exist (a fresh local stack).

-- 3.1 Paused accounts. A missing row means active. Server-only.
create table public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'disabled')),
  reason text not null default '' check (char_length(reason) <= 500),
  lessons_choice text not null default 'keep' check (lessons_choice in ('keep', 'cancel')),
  unpublished_listing_ids text[] not null default '{}',
  changed_by text not null,
  changed_at timestamptz not null default now()
);
comment on table public.account_status is 'Plan 8: paused accounts (status disabled, with the reason). Missing row = active. Written only by parle-admin-service.';
alter table public.account_status enable row level security;
revoke all on public.account_status from anon, authenticated;

-- An administrator's cancellation (spec 3.2) is its own "cancelled by".
alter table public.booking drop constraint booking_cancelled_by_check;
alter table public.booking add constraint booking_cancelled_by_check check (cancelled_by in ('learner', 'tutor', 'account_deleted', 'admin'));

-- Ends every session of a person (the Auth ban also refuses refreshes; Plan 8 ruling 2).
create or replace function public.account_end_sessions(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- 4.1 Waitlist campaigns, send records and unsubscribes. Server-only.
create table public.waitlist_campaign (
  campaign text primary key check (campaign in ('founding_tutor', 'launch')),
  blanks jsonb not null default '{}'::jsonb,
  started_by text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.waitlist_campaign (campaign) values ('founding_tutor'), ('launch') on conflict (campaign) do nothing;

create table public.waitlist_send (
  id uuid primary key default gen_random_uuid(),
  campaign text not null references public.waitlist_campaign(campaign),
  signup_id uuid not null, -- waitlist_signup.id; deliberately no foreign key: the list is never altered (spec 4.1)
  email text check (email is null or email = lower(email)), -- set to null when the list is deleted (spec 4.6)
  role text not null default '',
  goal text not null default '',
  joined_on date,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped_unsubscribed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  resend_id text,
  sent_at timestamptz,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_send_once unique (campaign, signup_id)
);
create unique index waitlist_send_once_per_address on public.waitlist_send (campaign, email) where email is not null;
create index waitlist_send_queue_idx on public.waitlist_send (created_at) where status = 'queued';

create table public.waitlist_unsubscribe (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  unsubscribed_at timestamptz not null default now(),
  source text not null check (source in ('link', 'header', 'admin'))
);
comment on table public.waitlist_unsubscribe is 'Plan 8: addresses that asked for no more Parle email. Kept after the list is deleted (spec 4.6).';

alter table public.waitlist_campaign enable row level security;
revoke all on public.waitlist_campaign from anon, authenticated;
alter table public.waitlist_send enable row level security;
revoke all on public.waitlist_send from anon, authenticated;
alter table public.waitlist_unsubscribe enable row level security;
revoke all on public.waitlist_unsubscribe from anon, authenticated;

-- Counts for the Waitlist page (spec 4.3). Reads the list; never writes it.
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
        'skipped', (select count(*) from public.waitlist_send s where s.campaign = c.campaign and s.status = 'skipped_unsubscribed')))
       from public.waitlist_campaign c),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'campaign', f.campaign, 'email', f.email, 'error', f.error) order by f.updated_at desc)
       from (select * from public.waitlist_send where status = 'failed' order by updated_at desc limit 50) f), '[]'::jsonb));
end; $$;

-- Queues one row per eligible address (spec 4.3): the campaign's role, not unsubscribed, not already queued or sent.
-- An address listed twice (any case) is queued once (Review Focus 3). Pressing Send again queues nothing new.
create or replace function public.waitlist_queue(p_campaign text, p_by text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if p_campaign not in ('founding_tutor', 'launch') then raise exception 'unknown campaign %', p_campaign; end if;
  update public.waitlist_campaign
     set started_by = coalesce(started_by, p_by), started_at = coalesce(started_at, now()), finished_at = null, last_error = '', updated_at = now()
   where campaign = p_campaign;
  insert into public.waitlist_send (campaign, signup_id, email, role, goal, joined_on)
  select p_campaign, s.id, lower(trim(s.email)), coalesce(s.role, ''), coalesce(s.goal, ''), (s.created_at at time zone 'UTC')::date
    -- production keeps one row per address and role: the role filter comes first, and for the launch email a
    -- person on the list as both a learner and a tutor gets the tutor's version (Plan 8 Task 1 ruling)
    from (select distinct on (lower(trim(w.email))) w.* from public.waitlist_signup w
           where coalesce(trim(w.email), '') <> '' and (p_campaign = 'launch' or w.role = 'tutor')
           order by lower(trim(w.email)), (w.role = 'tutor') desc, w.created_at) s
   where not exists (select 1 from public.waitlist_unsubscribe u where u.email = lower(trim(s.email)))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  perform public.waitlist_refresh_campaigns();
  return v_count;
end; $$;

-- The sending job claims up to p_limit queued rows; a claim older than 5 minutes (a run that stopped) is taken again,
-- and Resend's Idempotency-Key stops a second delivery (Review Focus 2).
create or replace function public.waitlist_claim(p_limit int) returns setof public.waitlist_send
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.waitlist_send w set claimed_at = now(), attempts = w.attempts + 1, updated_at = now()
   where w.id in (select q.id from public.waitlist_send q
                   where q.status = 'queued' and (q.claimed_at is null or q.claimed_at < now() - interval '5 minutes')
                   order by q.created_at limit p_limit for update skip locked)
  returning w.*;
end; $$;

-- Records an unsubscribe once (spec 4.5); queued emails to that address are skipped at once.
create or replace function public.waitlist_record_unsubscribe(p_email text, p_source text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count int;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+$' or length(v_email) > 254 then return 'invalid'; end if;
  insert into public.waitlist_unsubscribe (email, source) values (v_email, p_source) on conflict (email) do nothing;
  get diagnostics v_count = row_count;
  update public.waitlist_send set status = 'skipped_unsubscribed', claimed_at = null, updated_at = now()
   where email = v_email and status = 'queued';
  perform public.waitlist_refresh_campaigns();
  return case when v_count > 0 then 'recorded' else 'already' end;
end; $$;

create or replace function public.waitlist_retry_failed(p_campaign text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.waitlist_send set status = 'queued', attempts = 0, error = '', claimed_at = null, updated_at = now()
   where campaign = p_campaign and status = 'failed';
  get diagnostics v_count = row_count;
  if v_count > 0 then update public.waitlist_campaign set finished_at = null, updated_at = now() where campaign = p_campaign; end if;
  return v_count;
end; $$;

-- A started campaign with nothing queued is finished.
create or replace function public.waitlist_refresh_campaigns() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.waitlist_campaign c set finished_at = now(), updated_at = now()
   where c.started_at is not null and c.finished_at is null
     and not exists (select 1 from public.waitlist_send s where s.campaign = c.campaign and s.status = 'queued');
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Spec 4.6, the one deliberate exception: after the launch campaign has finished, the owner's button removes every
-- waitlist_signup row and the send records' addresses (counts stay), and writes the audit row in the same transaction.
-- waitlist_unsubscribe is kept.
create or replace function public.waitlist_delete_all(p_actor uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_signups int;
  v_sends int;
begin
  if not exists (select 1 from public.waitlist_campaign where campaign = 'launch' and started_at is not null and finished_at is not null)
     or exists (select 1 from public.waitlist_send where campaign = 'launch' and status in ('queued', 'failed'))
     -- failed launch emails can still be retried, and founding-tutor emails still waiting would be lost (review, Minor 5)
     or exists (select 1 from public.waitlist_send where campaign = 'founding_tutor' and status = 'queued') then
    return jsonb_build_object('status', 'launch_not_finished');
  end if;
  delete from public.waitlist_signup where true; -- the API layer refuses a DELETE without WHERE (pg_safeupdate)
  get diagnostics v_signups = row_count;
  update public.waitlist_send set email = null, updated_at = now() where email is not null;
  get diagnostics v_sends = row_count;
  insert into public.admin_audit_log (actor_user_id, actor_label, action, target_type, target_id, old_value, new_value, occurred_at_utc, owner_id, created_by)
  values (p_actor::text, p_label, 'waitlist.deleted', 'waitlist', 'waitlist_signup',
          jsonb_build_object('signups', v_signups)::text, jsonb_build_object('signups', 0, 'send_records_cleared', v_sends)::text,
          to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), p_actor, p_label);
  return jsonb_build_object('status', 'deleted', 'signups', v_signups, 'send_records_cleared', v_sends);
end; $$;

-- Text timestamps from the Buildy-era tables; an unreadable value counts as missing.
create or replace function private.safe_ts(p text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  return nullif(trim(coalesce(p, '')), '')::timestamptz;
exception when others then
  return null;
end; $$;

-- 3.5 Metrics counts for a range, computed with full access on the server (D24).
create or replace function public.admin_metrics(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'signups_by_week', coalesce((select jsonb_agg(x.w order by x.w->>'week') from (
        select jsonb_build_object('week', to_char(date_trunc('week', i.created_at), 'YYYY-MM-DD'),
               'learners', count(*) filter (where i.role = 'learner'), 'tutors', count(*) filter (where i.role = 'tutor')) as w
          from public."ParleIdentity" i where i.created_at >= p_from and i.created_at < p_to
         group by date_trunc('week', i.created_at)) x), '[]'::jsonb),
    'active_learners_by_week', coalesce((select jsonb_agg(x.w order by x.w->>'week') from (
        select jsonb_build_object('week', to_char(date_trunc('week', d.at), 'YYYY-MM-DD'), 'learners', count(distinct d.owner_id)) as w
          from (select t.owner_id, private.safe_ts(t.completed_at_utc) as at from public.learner_task t where t.status = 'done') d
         where d.at >= p_from and d.at < p_to group by date_trunc('week', d.at)) x), '[]'::jsonb),
    'premium', jsonb_build_object(
       'paid', (select count(distinct s.user_id) from public."Subscriber" s where s.stripe_status in ('active', 'trialing', 'past_due')),
       'complimentary', (select count(*) from public."ParleIdentity" i where i.role = 'learner' and i.premium_comp_active is true),
       'started', (select count(*) from public."Subscriber" s where s.created_at >= p_from and s.created_at < p_to
                     and coalesce(s.stripe_status, '') not in ('', 'incomplete', 'incomplete_expired')),
       'ended', (select count(*) from public."Subscriber" s where s.stripe_status = 'canceled' and s.updated_at >= p_from and s.updated_at < p_to)),
    'practice_completed', (select count(*) from public.learner_task t where t.status = 'done'
                             and private.safe_ts(t.completed_at_utc) >= p_from and private.safe_ts(t.completed_at_utc) < p_to),
    'checkins_submitted', (select count(*) from public.checkin c where c.status = 'submitted' and c.created_at >= p_from and c.created_at < p_to),
    'ai_messages', (select count(*) from public.ai_message m where m.sender = 'learner' and m.created_at >= p_from and m.created_at < p_to),
    'lessons', jsonb_build_object(
       'booked', (select count(*) from public.booking b where b.booked_at >= p_from and b.booked_at < p_to and b.status not in ('pending_payment', 'expired')),
       'completed', (select count(*) from public.booking b where b.status = 'completed' and coalesce(b.completed_at, b.end_at) >= p_from and coalesce(b.completed_at, b.end_at) < p_to),
       'cancelled_by_learner', (select count(*) from public.booking b where b.status = 'cancelled_learner' and b.cancelled_by = 'learner'
                                  and b.status_changed_at >= p_from and b.status_changed_at < p_to),
       'cancelled_by_tutor', (select count(*) from public.booking b where b.status = 'cancelled_tutor' and b.cancelled_by = 'tutor'
                                and b.status_changed_at >= p_from and b.status_changed_at < p_to),
       'cancelled_by_parle', (select count(*) from public.booking b where b.status in ('cancelled_learner', 'cancelled_tutor') and b.cancelled_by in ('admin', 'account_deleted')
                                and b.status_changed_at >= p_from and b.status_changed_at < p_to),
       'refunded_cents', coalesce((select sum(r.amount_cents) from public.refund r where r.created_at >= p_from and r.created_at < p_to), 0),
       'revenue_cents', coalesce((select sum(p.amount_cents - p.refunded_cents) from public.payment p where p.created_at >= p_from and p.created_at < p_to), 0),
       'commission_cents', coalesce((select sum(round(b.price_cents * b.commission_pct / 100.0)) from public.booking b
                                      where b.booked_at >= p_from and b.booked_at < p_to and b.status in ('confirmed', 'completed', 'learner_no_show', 'disputed')), 0),
       'booked_hours', coalesce((select round(sum(b.minutes) / 60.0, 1) from public.booking b
                                  where b.start_at >= p_from and b.start_at < p_to and b.status in ('confirmed', 'completed', 'learner_no_show', 'disputed')), 0)));
end; $$;

revoke all on function public.account_end_sessions(uuid) from public, anon, authenticated;
revoke all on function public.waitlist_overview() from public, anon, authenticated;
revoke all on function public.waitlist_queue(text, text) from public, anon, authenticated;
revoke all on function public.waitlist_claim(int) from public, anon, authenticated;
revoke all on function public.waitlist_record_unsubscribe(text, text) from public, anon, authenticated;
revoke all on function public.waitlist_retry_failed(text) from public, anon, authenticated;
revoke all on function public.waitlist_refresh_campaigns() from public, anon, authenticated;
revoke all on function public.waitlist_delete_all(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_metrics(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.safe_ts(text) from public, anon, authenticated;
grant execute on function public.account_end_sessions(uuid) to service_role;
grant execute on function public.waitlist_overview() to service_role;
grant execute on function public.waitlist_queue(text, text) to service_role;
grant execute on function public.waitlist_claim(int) to service_role;
grant execute on function public.waitlist_record_unsubscribe(text, text) to service_role;
grant execute on function public.waitlist_retry_failed(text) to service_role;
grant execute on function public.waitlist_refresh_campaigns() to service_role;
grant execute on function public.waitlist_delete_all(uuid, text) to service_role;
grant execute on function public.admin_metrics(timestamptz, timestamptz) to service_role;

-- 4.4 Every minute, but the function is called only while a send is queued.
select cron.schedule('parle-waitlist-jobs', '* * * * *',
  $$select private.call_function('parle-waitlist-jobs') where exists (select 1 from public.waitlist_send where status = 'queued')$$);
