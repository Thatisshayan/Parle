-- Plan 7A (spec 06_Build/export-decoupling/specs/2026-10-16-plan-7-booking-payouts-design.md, sections 3-6).
-- The Buildy-era booking table held test requests only (requested / confirmed / declined, text columns): it is
-- dropped with its rows and rebuilt with real types. waitlist_signup and join_waitlist() are not visited.

create extension if not exists btree_gist with schema extensions;

drop table if exists public.booking cascade;

create table public.booking (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references auth.users(id) on delete set null,
  tutor_id uuid references auth.users(id) on delete set null,
  tutor_profile_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  minutes integer not null check (minutes in (30, 45, 60)),
  buffer_minutes integer not null default 0 check (buffer_minutes in (0, 10, 15)),
  blocked_until timestamptz not null,
  price_cents integer not null check (price_cents >= 800),
  commission_pct numeric(5,2) not null check (commission_pct >= 0 and commission_pct <= 50),
  status text not null check (status in ('pending_payment','confirmed','expired','cancelled_learner','cancelled_tutor','completed','learner_no_show','disputed')),
  learner_message text not null default '',
  reschedule_count integer not null default 0 check (reschedule_count between 0 and 1),
  hold_expires_at timestamptz,
  stripe_checkout_session_id text unique,
  booked_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  cancelled_by text check (cancelled_by in ('learner', 'tutor', 'account_deleted')),
  late_cancel boolean not null default false,
  completed_at timestamptz,
  attendance_marked_by text check (attendance_marked_by in ('tutor', 'auto')),
  disputed_from text check (disputed_from in ('completed', 'learner_no_show')),
  dispute_kind text check (dispute_kind in ('tutor_no_show', 'no_show_dispute', 'other')),
  dispute_details text not null default '',
  disputed_at timestamptz,
  confirmation_sent_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  review_request_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_not_self check (learner_id is null or tutor_id is null or learner_id <> tutor_id),
  constraint booking_length check (end_at = start_at + make_interval(mins => minutes)),
  -- No overlap (spec section 3): a tutor's live bookings, each extended by its frozen buffer, never overlap.
  constraint booking_no_overlap exclude using gist (tutor_id with =, tstzrange(start_at, blocked_until, '[)') with &&)
    where (status in ('pending_payment', 'confirmed'))
);
comment on table public.booking is 'Lessons (Plan 7A). Price, commission and buffer are frozen at booking. Written only by server functions.';

-- An index expression may not use timestamptz + interval (not immutable), so the blocked range is stored.
create or replace function public.booking_derive() returns trigger language plpgsql set search_path = '' as $$
begin
  new.blocked_until := new.end_at + make_interval(mins => new.buffer_minutes);
  new.updated_at := now();
  return new;
end; $$;
create trigger booking_derive before insert or update on public.booking for each row execute function public.booking_derive();

create index booking_tutor_start_idx on public.booking (tutor_id, start_at);
create index booking_learner_start_idx on public.booking (learner_id, start_at);
create index booking_status_start_idx on public.booking (status, start_at);
create index booking_open_hold_idx on public.booking (hold_expires_at) where status = 'pending_payment';

create table public.payment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.booking(id) on delete restrict,
  stripe_payment_intent_id text not null unique,
  stripe_checkout_session_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null check (status in ('succeeded', 'refunded', 'partly_refunded', 'disputed')),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.refund (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (reason in ('learner_cancelled', 'tutor_cancelled', 'account_deleted', 'slot_lost', 'admin')),
  stripe_refund_id text not null unique,
  decided_by text not null,
  created_at timestamptz not null default now(),
  constraint refund_once_per_reason unique (booking_id, reason)
);

create table public.lesson_brief (
  booking_id uuid primary key references public.booking(id) on delete cascade,
  content jsonb not null,
  built_at timestamptz not null default now()
);

create table public.lesson_notes (
  booking_id uuid primary key references public.booking(id) on delete cascade,
  skills jsonb not null default '{}'::jsonb,
  notes text not null default '',
  homework text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stripe events already acted on (the same event twice is recorded once).
create table public.stripe_event (id text primary key, type text not null, processed_at timestamptz not null default now());

-- Fake Stripe for local tests (function setting STRIPE_PROVIDER=fake); never read in production.
create table public.stripe_test_object (id text primary key, kind text not null, data jsonb not null, created_at timestamptz not null default now());
create table public.stripe_test_fail (id bigserial primary key, operation text not null);
create or replace function public.pop_stripe_test_failure(p_operation text) returns boolean
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.stripe_test_fail
     where id = (select id from public.stripe_test_fail where operation = p_operation order by id limit 1 for update skip locked)
    returning id
  )
  select exists (select 1 from gone);
$$;

alter table public.tutor_profile add column if not exists founding_until date;
alter table public.tutor_review add column if not exists booking_id uuid unique references public.booking(id) on delete set null;
alter table public.tutor_review add column if not exists learner_id uuid references auth.users(id) on delete set null;
comment on table public.tutor_review is 'Tutor reviews: administrator test reviews, and from Plan 7A one learner review per completed lesson (booking_id). Learners and visitors read visible, non-test reviews.';

-- Read rules (spec section 3). Payments, refunds and Stripe records: server actions only.
alter table public.booking enable row level security;
revoke all on public.booking from anon, authenticated;
grant select on public.booking to authenticated;
create policy "booking: participants read" on public.booking for select to authenticated
  using (learner_id = (select auth.uid()) or tutor_id = (select auth.uid()));
alter table public.payment enable row level security;
revoke all on public.payment from anon, authenticated;
alter table public.refund enable row level security;
revoke all on public.refund from anon, authenticated;
alter table public.stripe_event enable row level security;
revoke all on public.stripe_event from anon, authenticated;
alter table public.stripe_test_object enable row level security;
revoke all on public.stripe_test_object from anon, authenticated;
alter table public.stripe_test_fail enable row level security;
revoke all on public.stripe_test_fail from anon, authenticated;
alter table public.lesson_brief enable row level security;
revoke all on public.lesson_brief from anon, authenticated;
grant select on public.lesson_brief to authenticated;
create policy "lesson_brief: the booking's tutor reads" on public.lesson_brief for select to authenticated
  using (exists (select 1 from public.booking b where b.id = booking_id and b.tutor_id = (select auth.uid())));
alter table public.lesson_notes enable row level security;
revoke all on public.lesson_notes from anon, authenticated;
grant select on public.lesson_notes to authenticated;
create policy "lesson_notes: both parties read" on public.lesson_notes for select to authenticated
  using (exists (select 1 from public.booking b where b.id = booking_id and (b.learner_id = (select auth.uid()) or b.tutor_id = (select auth.uid()))));

-- Holds the slot for the learner while they pay. A lapsed hold of this tutor stops blocking first.
create or replace function public.lesson_hold(p_learner uuid, p_tutor uuid, p_profile text, p_start timestamptz, p_minutes int,
  p_buffer int, p_price int, p_commission numeric, p_message text, p_hold_minutes int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.booking set status = 'expired', status_changed_at = now()
   where tutor_id = p_tutor and status = 'pending_payment' and hold_expires_at < now();
  begin
    insert into public.booking (learner_id, tutor_id, tutor_profile_id, start_at, end_at, minutes, buffer_minutes, price_cents,
                                commission_pct, status, learner_message, hold_expires_at, booked_at)
    values (p_learner, p_tutor, p_profile, p_start, p_start + make_interval(mins => p_minutes), p_minutes, p_buffer, p_price,
            p_commission, 'pending_payment', coalesce(p_message, ''), now() + make_interval(mins => p_hold_minutes), now())
    returning id into v_id;
  exception when exclusion_violation then
    return null;
  end;
  return v_id;
end; $$;

-- Only Stripe's payment event (or the reconciliation job reading Stripe) confirms a lesson (spec section 4).
create or replace function public.lesson_confirm_payment(p_session text, p_payment_intent text, p_amount int, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking%rowtype;
  v_result text;
begin
  if p_event is not null and exists (select 1 from public.stripe_event where id = p_event) then return 'duplicate'; end if;
  select * into b from public.booking where stripe_checkout_session_id = p_session for update;
  if not found then return 'not_found'; end if;
  if exists (select 1 from public.payment where booking_id = b.id) then
    -- a slot_lost refund that failed earlier is tried again by the caller
    if b.status in ('pending_payment', 'expired') and not exists (select 1 from public.refund where booking_id = b.id) then return 'slot_lost'; end if;
    if p_event is not null then insert into public.stripe_event (id, type) values (p_event, 'checkout.session.completed') on conflict (id) do nothing; end if;
    return 'duplicate';
  end if;
  insert into public.payment (booking_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, status)
  values (b.id, p_payment_intent, p_session, p_amount, 'succeeded');
  if p_amount <> b.price_cents or b.learner_id is null or b.tutor_id is null then
    v_result := 'slot_lost';
  elsif b.status = 'pending_payment' then
    update public.booking set status = 'confirmed', status_changed_at = now(), hold_expires_at = null where id = b.id;
    v_result := 'confirmed';
  elsif b.status = 'expired' then
    begin
      update public.booking set status = 'confirmed', status_changed_at = now(), hold_expires_at = null where id = b.id;
      v_result := 'confirmed_late';
    exception when exclusion_violation then
      v_result := 'slot_lost';
    end;
  else
    v_result := 'slot_lost';
  end if;
  if v_result <> 'slot_lost' and p_event is not null then
    insert into public.stripe_event (id, type) values (p_event, 'checkout.session.completed') on conflict (id) do nothing;
  end if;
  return v_result;
end; $$;

-- Records a refund once per reason and updates the payment; a refunded hold stops blocking.
create or replace function public.lesson_record_refund(p_booking uuid, p_amount int, p_refund_id text, p_reason text, p_by text, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_inserted int;
begin
  insert into public.refund (booking_id, amount_cents, reason, stripe_refund_id, decided_by)
  values (p_booking, p_amount, p_reason, p_refund_id, p_by)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.payment
       set refunded_cents = least(amount_cents, refunded_cents + p_amount),
           status = case when status = 'disputed' then 'disputed' when refunded_cents + p_amount >= amount_cents then 'refunded' else 'partly_refunded' end,
           updated_at = now()
     where booking_id = p_booking;
  end if;
  if p_reason = 'slot_lost' then
    update public.booking set status = 'expired', status_changed_at = now(), hold_expires_at = null
     where id = p_booking and status = 'pending_payment';
  end if;
  if p_event is not null then insert into public.stripe_event (id, type) values (p_event, 'refund') on conflict (id) do nothing; end if;
  return case when v_inserted > 0 then 'recorded' else 'already' end;
end; $$;

-- Cancels a confirmed lesson and records its refund (if any) in one transaction.
create or replace function public.lesson_cancel(p_booking uuid, p_status text, p_cancelled_by text, p_late boolean, p_refund_cents int,
  p_refund_id text, p_reason text, p_decided_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  if coalesce(p_refund_cents, 0) > 0 then
    perform public.lesson_record_refund(p_booking, p_refund_cents, p_refund_id, p_reason, p_decided_by, null);
  end if;
  update public.booking set status = p_status, cancelled_by = p_cancelled_by, late_cancel = p_late, status_changed_at = now()
   where id = p_booking and status = 'confirmed';
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'cancelled' else 'unchanged' end;
end; $$;

-- Moves a lesson once: the new time is held and the old one freed in this one statement (spec section 5).
create or replace function public.lesson_reschedule(p_booking uuid, p_learner uuid, p_start timestamptz, p_window_hours int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.booking
     set start_at = p_start, end_at = p_start + make_interval(mins => minutes), reschedule_count = reschedule_count + 1,
         booked_at = now(), reminder_24h_sent_at = null, reminder_1h_sent_at = null, status_changed_at = now()
   where id = p_booking and learner_id = p_learner and status = 'confirmed' and reschedule_count = 0
     and start_at >= now() + make_interval(hours => p_window_hours);
  get diagnostics v_changed = row_count;
  if v_changed = 0 then return 'not_allowed'; end if;
  delete from public.lesson_brief where booking_id = p_booking;
  return 'rescheduled';
exception when exclusion_violation then
  return 'slot_taken';
end; $$;

revoke all on function public.lesson_hold(uuid, uuid, text, timestamptz, int, int, int, numeric, text, int) from public, anon, authenticated;
revoke all on function public.lesson_confirm_payment(text, text, int, text) from public, anon, authenticated;
revoke all on function public.lesson_record_refund(uuid, int, text, text, text, text) from public, anon, authenticated;
revoke all on function public.lesson_cancel(uuid, text, text, boolean, int, text, text, text) from public, anon, authenticated;
revoke all on function public.lesson_reschedule(uuid, uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function public.pop_stripe_test_failure(text) from public, anon, authenticated;
grant execute on function public.lesson_hold(uuid, uuid, text, timestamptz, int, int, int, numeric, text, int) to service_role;
grant execute on function public.lesson_confirm_payment(text, text, int, text) to service_role;
grant execute on function public.lesson_record_refund(uuid, int, text, text, text, text) to service_role;
grant execute on function public.lesson_cancel(uuid, text, text, boolean, int, text, text, text) to service_role;
grant execute on function public.lesson_reschedule(uuid, uuid, timestamptz, int) to service_role;
grant execute on function public.pop_stripe_test_failure(text) to service_role;

-- Holds, reconciliation, confirmations, briefs, reminders and auto-complete: every 10 minutes, in batches.
select cron.schedule('parle-booking-jobs', '*/10 * * * *', $$select private.call_function('parle-booking-jobs')$$);
