-- Audit Phase 47: hold tutor payouts whenever a learner refund is recorded.
-- A partial refund requires an explicit finance decision; do not infer an adjusted tutor share.

alter table public.payout drop constraint if exists payout_hold_reason_check;
alter table public.payout add constraint payout_hold_reason_check
  check (hold_reason is null or hold_reason in ('dispute', 'tutor_no_show', 'chargeback', 'account_not_ready', 'transfer_failed', 'payment_refund'));

-- Separate the worker lease from the point where an external transfer is allowed to start.
alter table public.payout add column if not exists transfer_claim_lock_at timestamptz;
alter table public.payout add column if not exists refund_payout_release_authorized_at timestamptz;

-- Hold already scheduled payouts for which Stripe has recorded any refund.
update public.payout p
   set status = 'held', hold_reason = 'payment_refund', held_at = now(), updated_at = now()
 where p.status = 'scheduled' and p.transfer_started_at is null and p.stripe_transfer_id is null
   and exists (select 1 from public.payment pay where pay.booking_id = p.booking_id and pay.refunded_cents > 0);

-- New payouts for partially refunded lessons also start held for finance review.
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
  select * into b from public.booking where id = p_booking for update;
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
  if v_hold is null and exists (select 1 from public.payment p where p.booking_id = b.id and p.refunded_cents > 0) then v_hold := 'payment_refund'; end if;
  insert into public.payout (booking_id, tutor_id, amount_cents, commission_cents, release_at, status, hold_reason, held_at)
  values (b.id, b.tutor_id, b.price_cents - v_commission, v_commission, v_base + make_interval(hours => p_delay_hours),
          case when v_hold is null then 'scheduled' else 'held' end, v_hold, case when v_hold is null then null else now() end)
  on conflict (booking_id) do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then 'scheduled' else 'exists' end;
end; $$;

-- A refund received while a claim is in flight must remain visible for reconciliation; do not clear the in-flight marker.
create or replace function public.payout_hold(p_payout uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  if p_reason in ('chargeback', 'payment_refund') and exists (
    select 1 from public.payout where id = p_payout and status in ('scheduled', 'held')
      and stripe_transfer_id is null and transfer_started_at is not null
  ) then
    return 'in_flight';
  end if;
  if p_reason = 'payment_refund' and exists (
    select 1 from public.payout where id = p_payout and status in ('scheduled', 'held')
      and decision = 'split' and refund_payout_release_authorized_at is not null and transfer_started_at is null
  ) then
    return 'authorized_split';
  end if;
  update public.payout set status = 'held', hold_reason = p_reason, held_at = now(), transfer_started_at = null,
         transfer_claim_lock_at = null, refund_payout_release_authorized_at = null, updated_at = now()
   where id = p_payout and status in ('scheduled', 'held') and stripe_transfer_id is null;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'held' else 'unchanged' end;
end; $$;

-- Due enumeration and the atomic claim both require an unrefunded succeeded payment.
create or replace function public.payout_due(p_limit int) returns table (id uuid)
language sql security definer set search_path = '' as $$
  select p.id from public.payout p join public.booking b on b.id = p.booking_id
   where p.status = 'scheduled' and p.transfer_started_at is null and p.decision is null and p.release_at <= now()
     and b.status in ('completed', 'learner_no_show', 'cancelled_learner')
     and exists (select 1 from public.payment pay where pay.booking_id = p.booking_id and pay.refunded_cents = 0)
   order by p.release_at
   limit greatest(1, least(p_limit, 5000));
$$;

create or replace function public.payout_claim(p_payout uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout p set transfer_claim_lock_at = now(), transfer_claimed_at = coalesce(p.transfer_claimed_at, now()), updated_at = now()
   where p.id = p_payout and p.status = 'scheduled' and p.transfer_started_at is null and p.decision is null and p.release_at <= now()
     and (p.transfer_claim_lock_at is null or p.transfer_claim_lock_at < now() - interval '15 minutes')
     and exists (select 1 from public.booking b where b.id = p.booking_id and b.status in ('completed', 'learner_no_show', 'cancelled_learner'))
     and exists (select 1 from public.payment pay where pay.booking_id = p.booking_id and pay.refunded_cents = 0);
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'claimed' else 'not_due' end;
end; $$;

-- Lock payment before payout, matching lesson_record_refund's lock order. Whichever commits first
-- decides whether the transfer has started or the payout is held for refund reconciliation.
create or replace function public.payout_transfer_start(p_payout uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_booking uuid; v_refunded int; v_authorized boolean; v_changed int;
begin
  select booking_id into v_booking from public.payout where id = p_payout;
  if not found then return 'not_claimed'; end if;
  select refunded_cents into v_refunded from public.payment where booking_id = v_booking for update;
  if not found then return 'refunded'; end if;
  select refund_payout_release_authorized_at is not null into v_authorized from public.payout where id = p_payout;
  if coalesce(v_refunded, 0) > 0 and not coalesce(v_authorized, false) then return 'refunded'; end if;
  update public.payout p set transfer_started_at = now(), transfer_claim_lock_at = null,
         refund_payout_release_authorized_at = null, updated_at = now()
   where p.id = p_payout and p.status = 'scheduled' and p.transfer_started_at is null
     and p.transfer_claim_lock_at is not null and p.decision is null and p.stripe_transfer_id is null;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'started' else 'not_claimed' end;
end; $$;
revoke all on function public.payout_transfer_start(uuid) from public, anon, authenticated;
grant execute on function public.payout_transfer_start(uuid) to service_role;

create or replace function public.payout_split_authorize(p_payout uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set refund_payout_release_authorized_at = now(), updated_at = now()
   where id = p_payout and decision = 'split' and status in ('scheduled', 'held')
     and transfer_started_at is null and stripe_transfer_id is null;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'authorized' else 'not_claimed' end;
end; $$;
revoke all on function public.payout_split_authorize(uuid) from public, anon, authenticated;
grant execute on function public.payout_split_authorize(uuid) to service_role;

create or replace function public.payout_decision_abort(p_payout uuid, p_kind text) returns void
language sql security definer set search_path = '' as $$
  update public.payout set decision = null, decision_by = null, decision_at = null,
    refund_payout_release_authorized_at = null, updated_at = now()
   where id = p_payout and decision = p_kind;
$$;

-- Reports and admin decisions must respect an active worker lease as well as an actual Stripe start.
create or replace function public.payout_decision_begin(p_payout uuid, p_kind text, p_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set decision = p_kind, decision_by = p_by, decision_at = now(), updated_at = now()
   where id = p_payout and (decision is null or decision_at < now() - interval '5 minutes')
     and case when p_kind = 'refund_after_payout' then status = 'paid'
              else status in ('scheduled', 'held') and transfer_started_at is null and stripe_transfer_id is null
                and (transfer_claim_lock_at is null or transfer_claim_lock_at < now() - interval '15 minutes') end;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'claimed' else 'busy' end;
end; $$;

create or replace function public.lesson_report_problem(p_booking uuid, p_learner uuid, p_kind text, p_details text) returns text
language plpgsql security definer set search_path = '' as $$
declare b public.booking%rowtype; v_payout uuid; v_changed int;
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
     where id = v_payout and status in ('scheduled', 'held') and transfer_started_at is null and stripe_transfer_id is null and decision is null
       and (transfer_claim_lock_at is null or transfer_claim_lock_at < now() - interval '15 minutes');
    get diagnostics v_changed = row_count;
    if v_changed = 0 then return 'closed'; end if;
  end if;
  update public.booking set status = 'disputed', disputed_from = b.status, dispute_kind = p_kind, dispute_details = coalesce(p_details, ''),
         disputed_at = now(), status_changed_at = now()
   where id = b.id;
  return 'reported';
end; $$;

-- Admin release/split also creates a worker lease; the transfer-start RPC is the only place
-- that marks an external transfer as in flight.
create or replace function public.payout_decide(p_payout uuid, p_kind text, p_amount integer, p_commission integer, p_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.payout%rowtype;
begin
  select * into v from public.payout where id = p_payout for update;
  if not found or v.decision is distinct from p_kind then return 'not_claimed'; end if;
  if p_kind = 'refund' then
    update public.payout set status = 'cancelled', hold_reason = null, held_at = null, decision = null, decision_by = null, decision_at = null,
           decided_by = p_by, decided_at = now(), transfer_claim_lock_at = null, refund_payout_release_authorized_at = null, updated_at = now() where id = v.id;
  elsif p_kind in ('release', 'split') then
    update public.payout set status = 'scheduled', release_at = now(), hold_reason = null, held_at = null, transfer_started_at = null,
           transfer_claim_lock_at = now(), refund_payout_release_authorized_at = case when p_kind = 'split' then now() else null end,
           transfer_claimed_at = coalesce(transfer_claimed_at, now()),
           amount_cents = coalesce(p_amount, amount_cents), commission_cents = coalesce(p_commission, commission_cents),
           transfer_attempt = transfer_attempt + case when v.transfer_claimed_at is not null or v.hold_reason = 'transfer_failed' or p_kind = 'split' then 1 else 0 end,
           decision = null, decision_by = null, decision_at = null, decided_by = p_by, decided_at = now(), updated_at = now()
     where id = v.id;
  elsif p_kind = 'refund_after_payout' then
    update public.payout set after_payout_decisions = after_payout_decisions + 1, decision = null, decision_by = null, decision_at = null,
           decided_by = p_by, decided_at = now(), updated_at = now() where id = v.id;
  else
    return 'invalid';
  end if;
  update public.booking set status = disputed_from, status_changed_at = now()
   where id = v.booking_id and status = 'disputed' and disputed_from is not null;
  return 'decided';
end; $$;
