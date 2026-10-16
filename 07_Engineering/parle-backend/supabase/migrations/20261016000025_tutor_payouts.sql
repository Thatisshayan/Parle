-- Plan 7B (spec 06_Build/export-decoupling/specs/2026-10-16-plan-7-booking-payouts-design.md, sections 3 and 7).
-- Tutor payouts in Stripe test mode: one payout per lesson, the tutor's Connect account, and the switch that opens
-- booking only for tutors who can receive payouts. waitlist_signup and join_waitlist() are not visited.

-- The tutor's Stripe Connect account. No foreign key to the login: after a tutor's deletion the row is kept, minimised,
-- until their last payout is sent (spec section 3), then the jobs delete it.
create table public.tutor_payout_account (
  tutor_id uuid primary key,
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  disabled_reason text not null default '',
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  waitlisted_at timestamptz,
  tutor_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tutor_payout_account is 'Plan 7B: the tutor''s Stripe Connect Express account (id, country, payouts_enabled from account.updated). Kept, minimised, after deletion until the last payout is sent.';

-- One payout per lesson. The amount is the frozen price minus the frozen commission, fixed when the row is created.
create table public.payout (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.booking(id) on delete restrict,
  tutor_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  commission_cents integer not null check (commission_cents >= 0),
  release_at timestamptz not null,
  status text not null check (status in ('scheduled', 'held', 'paid', 'cancelled')),
  hold_reason text check (hold_reason in ('dispute', 'tutor_no_show', 'chargeback', 'account_not_ready', 'transfer_failed')),
  held_at timestamptz,
  transfer_attempt integer not null default 0,
  transfer_started_at timestamptz,
  stripe_transfer_id text unique,
  paid_at timestamptz,
  reversed_cents integer not null default 0 check (reversed_cents >= 0),
  stripe_reversal_id text,
  decision text check (decision in ('release', 'refund', 'split', 'refund_after_payout')),
  decision_by text,
  decision_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_hold_has_reason check ((status = 'held') = (hold_reason is not null))
);
comment on table public.payout is 'Plan 7B: the tutor''s share of one lesson. Written only by server functions; transfers carry transfer_group payout-<id>.';
create index payout_due_idx on public.payout (release_at) where status = 'scheduled';
create index payout_tutor_idx on public.payout (tutor_id, created_at desc);
create index payout_status_idx on public.payout (status);

-- An administrator's refund after the tutor was paid is its own reason (one refund per reason per booking, 7A rule).
alter table public.refund drop constraint refund_reason_check;
alter table public.refund add constraint refund_reason_check
  check (reason in ('learner_cancelled', 'tutor_cancelled', 'account_deleted', 'slot_lost', 'admin', 'admin_after_payout'));

-- Payouts and payout accounts: server actions only (spec section 3).
alter table public.payout enable row level security;
revoke all on public.payout from anon, authenticated;
alter table public.tutor_payout_account enable row level security;
revoke all on public.tutor_payout_account from anon, authenticated;

-- Creates the lesson's payout once: completed or learner_no_show (base: the later of the end and the completion), or
-- a learner's late cancellation (base: the scheduled end). A disputed lesson's payout starts held.
create or replace function public.payout_schedule(p_booking uuid, p_delay_hours int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking%rowtype;
  v_outcome text;
  v_base timestamptz;
  v_commission int;
  v_hold text;
  v_inserted int;
begin
  select * into b from public.booking where id = p_booking;
  if not found or b.tutor_id is null then return 'not_eligible'; end if;
  v_outcome := case when b.status = 'disputed' then b.disputed_from else b.status end;
  if v_outcome in ('completed', 'learner_no_show') then
    v_base := greatest(b.end_at, coalesce(b.completed_at, b.end_at));
  elsif b.status = 'cancelled_learner' and b.late_cancel then
    v_base := b.end_at;
  else
    return 'not_eligible';
  end if;
  if not exists (select 1 from public.payment p where p.booking_id = b.id and p.status in ('succeeded', 'partly_refunded', 'disputed')) then
    return 'not_eligible';
  end if;
  v_commission := round(b.price_cents * b.commission_pct / 100.0)::int;
  v_hold := case when b.status <> 'disputed' then null when b.dispute_kind = 'tutor_no_show' then 'tutor_no_show' else 'dispute' end;
  if exists (select 1 from public.payment p where p.booking_id = b.id and p.status = 'disputed') then v_hold := 'chargeback'; end if;
  insert into public.payout (booking_id, tutor_id, amount_cents, commission_cents, release_at, status, hold_reason, held_at)
  values (b.id, b.tutor_id, b.price_cents - v_commission, v_commission, v_base + make_interval(hours => p_delay_hours),
          case when v_hold is null then 'scheduled' else 'held' end, v_hold, case when v_hold is null then null else now() end)
  on conflict (booking_id) do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then 'scheduled' else 'exists' end;
end; $$;

-- The jobs claim a due payout before calling Stripe. Not while a decision runs, not for a lesson that is disputed.
create or replace function public.payout_claim(p_payout uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout p set transfer_started_at = now(), updated_at = now()
   where p.id = p_payout and p.status = 'scheduled' and p.transfer_started_at is null and p.decision is null and p.release_at <= now()
     and exists (select 1 from public.booking b where b.id = p.booking_id and b.status in ('completed', 'learner_no_show', 'cancelled_learner'));
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'claimed' else 'not_due' end;
end; $$;

-- Holds an unpaid payout (account not ready, transfer failed, chargeback); the claim, if any, ends.
create or replace function public.payout_hold(p_payout uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set status = 'held', hold_reason = p_reason, held_at = now(), transfer_started_at = null, updated_at = now()
   where id = p_payout and status in ('scheduled', 'held') and stripe_transfer_id is null;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'held' else 'unchanged' end;
end; $$;

-- Records the transfer (from the jobs, an administrator's release, or Stripe's transfer.created event). Idempotent.
create or replace function public.payout_mark_paid(p_payout uuid, p_transfer text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set status = 'paid', stripe_transfer_id = p_transfer, paid_at = coalesce(paid_at, now()), hold_reason = null,
         held_at = null, transfer_started_at = coalesce(transfer_started_at, now()), updated_at = now()
   where id = p_payout and (status in ('scheduled', 'held') or (status = 'paid' and stripe_transfer_id = p_transfer));
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'paid' else 'unchanged' end;
end; $$;

-- One administrator decision at a time (a crashed decision frees itself after 5 minutes). Release, refund and split
-- need an unpaid payout that is not being sent; refund_after_payout needs a paid one.
create or replace function public.payout_decision_begin(p_payout uuid, p_kind text, p_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set decision = p_kind, decision_by = p_by, decision_at = now(), updated_at = now()
   where id = p_payout and (decision is null or decision_at < now() - interval '5 minutes')
     and case when p_kind = 'refund_after_payout' then status = 'paid'
              else status in ('scheduled', 'held') and transfer_started_at is null and stripe_transfer_id is null end;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'claimed' else 'busy' end;
end; $$;

create or replace function public.payout_decision_abort(p_payout uuid, p_kind text) returns void
language sql security definer set search_path = '' as $$
  update public.payout set decision = null, decision_by = null, decision_at = null, updated_at = now() where id = p_payout and decision = p_kind;
$$;

-- Ends a claimed decision and turns a disputed lesson back into what it was (spec section 3, booking states).
create or replace function public.payout_decide(p_payout uuid, p_kind text, p_amount int, p_commission int, p_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.payout%rowtype;
begin
  select * into v from public.payout where id = p_payout for update;
  if not found or v.decision is distinct from p_kind then return 'not_claimed'; end if;
  if p_kind = 'refund' then
    update public.payout set status = 'cancelled', hold_reason = null, held_at = null, decision = null, decision_by = null, decision_at = null,
           decided_by = p_by, decided_at = now(), updated_at = now() where id = v.id;
  elsif p_kind in ('release', 'split') then
    -- claimed for sending in the same step, so no other decision and no job run can slip in before the transfer
    update public.payout set status = 'scheduled', release_at = now(), hold_reason = null, held_at = null, transfer_started_at = now(),
           amount_cents = coalesce(p_amount, amount_cents), commission_cents = coalesce(p_commission, commission_cents),
           transfer_attempt = transfer_attempt + case when v.hold_reason = 'transfer_failed' or p_kind = 'split' then 1 else 0 end,
           decision = null, decision_by = null, decision_at = null, decided_by = p_by, decided_at = now(), updated_at = now()
     where id = v.id;
  elsif p_kind = 'refund_after_payout' then
    update public.payout set decision = null, decision_by = null, decision_at = null, decided_by = p_by, decided_at = now(), updated_at = now() where id = v.id;
  else
    return 'invalid';
  end if;
  update public.booking set status = disputed_from, status_changed_at = now()
   where id = v.booking_id and status = 'disputed' and disputed_from is not null;
  return 'decided';
end; $$;

-- A reversal of the tutor's transfer, recorded once per Stripe reversal id.
create or replace function public.payout_record_reversal(p_payout uuid, p_reversal text, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set reversed_cents = least(amount_cents, reversed_cents + p_amount), stripe_reversal_id = p_reversal, updated_at = now()
   where id = p_payout and stripe_reversal_id is distinct from p_reversal;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'recorded' else 'already' end;
end; $$;

-- The learner's report and the payout hold in one transaction (Review Focus 1): a payout already being sent, or
-- sent, closes the report; otherwise the payout is held for an administrator.
create or replace function public.lesson_report_problem(p_booking uuid, p_learner uuid, p_kind text, p_details text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking%rowtype;
  v_payout uuid;
  v_changed int;
begin
  select * into b from public.booking where id = p_booking and learner_id = p_learner for update;
  if not found or b.status not in ('completed', 'learner_no_show') then return 'closed'; end if;
  if not ((b.status = 'completed' and p_kind in ('tutor_no_show', 'other')) or (b.status = 'learner_no_show' and p_kind in ('no_show_dispute', 'other'))) then
    return 'invalid';
  end if;
  select id into v_payout from public.payout where booking_id = b.id;
  if found then
    update public.payout set status = 'held', hold_reason = case when p_kind = 'tutor_no_show' then 'tutor_no_show' else 'dispute' end,
           held_at = now(), updated_at = now()
     where id = v_payout and status in ('scheduled', 'held') and transfer_started_at is null and stripe_transfer_id is null and decision is null;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then return 'closed'; end if;
  end if;
  update public.booking set status = 'disputed', disputed_from = b.status, dispute_kind = p_kind, dispute_details = coalesce(p_details, ''),
         disputed_at = now(), status_changed_at = now()
   where id = b.id;
  return 'reported';
end; $$;

revoke all on function public.payout_schedule(uuid, int) from public, anon, authenticated;
revoke all on function public.payout_claim(uuid) from public, anon, authenticated;
revoke all on function public.payout_hold(uuid, text) from public, anon, authenticated;
revoke all on function public.payout_mark_paid(uuid, text) from public, anon, authenticated;
revoke all on function public.payout_decision_begin(uuid, text, text) from public, anon, authenticated;
revoke all on function public.payout_decision_abort(uuid, text) from public, anon, authenticated;
revoke all on function public.payout_decide(uuid, text, int, int, text) from public, anon, authenticated;
revoke all on function public.payout_record_reversal(uuid, text, int) from public, anon, authenticated;
revoke all on function public.lesson_report_problem(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.payout_schedule(uuid, int) to service_role;
grant execute on function public.payout_claim(uuid) to service_role;
grant execute on function public.payout_hold(uuid, text) to service_role;
grant execute on function public.payout_mark_paid(uuid, text) to service_role;
grant execute on function public.payout_decision_begin(uuid, text, text) to service_role;
grant execute on function public.payout_decision_abort(uuid, text) to service_role;
grant execute on function public.payout_decide(uuid, text, int, int, text) to service_role;
grant execute on function public.payout_record_reversal(uuid, text, int) to service_role;
grant execute on function public.lesson_report_problem(uuid, uuid, text, text) to service_role;

-- Lessons that ended before 7B get their payouts now (the admin's payout_delay_hours, 72 by default).
do $$
declare
  v_delay int := coalesce((select value::int from public.app_setting where key = 'payout_delay_hours' and value ~ '^[0-9]+$' limit 1), 72);
  r record;
begin
  for r in select id from public.booking
            where status in ('completed', 'learner_no_show', 'disputed') or (status = 'cancelled_learner' and late_cancel) loop
    perform public.payout_schedule(r.id, v_delay);
  end loop;
end $$;

-- From now on a tutor is bookable only when their payout account can receive payouts (spec section 4).
update public.app_setting set value = 'true', updated_by = 'plan-7b', updated_at = now() where key = 'require_payout_account';
insert into public.app_setting (key, value, updated_by)
select 'require_payout_account', 'true', 'plan-7b' where not exists (select 1 from public.app_setting where key = 'require_payout_account');
