-- Plan 7B fixes after the final review, and lessons in CAD (decision #55). A fix of 000025, which is applied in
-- production. waitlist_signup and join_waitlist() are not visited.

-- Lessons are charged in CAD from now on; payments recorded before stay as they were (usd in test mode).
alter table public.payment alter column currency set default 'cad';

-- What the transfer actually sent: CAD, converted at Stripe's rate for a lesson that was paid in another currency.
alter table public.payout add column if not exists transfer_currency text;
alter table public.payout add column if not exists transfer_cents int check (transfer_cents is null or transfer_cents >= 0);

-- A split refunds with its own reason and idempotency key, so a later full refund is not refused (Important 7).
alter table public.refund drop constraint refund_reason_check;
alter table public.refund add constraint refund_reason_check
  check (reason in ('learner_cancelled', 'tutor_cancelled', 'account_deleted', 'slot_lost', 'admin', 'admin_split', 'admin_after_payout'));

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
  -- locked, so a learner's report in the same moment waits and the payout is created held (Plan 7B review, Important 6)
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
  insert into public.payout (booking_id, tutor_id, amount_cents, commission_cents, release_at, status, hold_reason, held_at)
  values (b.id, b.tutor_id, b.price_cents - v_commission, v_commission, v_base + make_interval(hours => p_delay_hours),
          case when v_hold is null then 'scheduled' else 'held' end, v_hold, case when v_hold is null then null else now() end)
  on conflict (booking_id) do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then 'scheduled' else 'exists' end;
end; $$;

-- Holds an unpaid payout. A chargeback never ends a claim while the transfer is being sent (Important 1): the
-- sender records the transfer or holds it itself; the caller alerts the administrator.
create or replace function public.payout_hold(p_payout uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  if p_reason = 'chargeback' and exists (select 1 from public.payout where id = p_payout and status in ('scheduled', 'held')
                                          and stripe_transfer_id is null and transfer_started_at is not null) then
    return 'in_flight';
  end if;
  update public.payout set status = 'held', hold_reason = p_reason, held_at = now(), transfer_started_at = null, updated_at = now()
   where id = p_payout and status in ('scheduled', 'held') and stripe_transfer_id is null;
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'held' else 'unchanged' end;
end; $$;

-- A reversal of the tutor's transfer. p_amount is Stripe's total reversed on that transfer, so a reversal seen twice
-- (the webhook and the administrator's action, or a retried press) is never added twice (Important 3).
create or replace function public.payout_record_reversal(p_payout uuid, p_reversal text, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout set reversed_cents = least(amount_cents, greatest(reversed_cents, p_amount)), stripe_reversal_id = p_reversal, updated_at = now()
   where id = p_payout and (stripe_reversal_id is distinct from p_reversal or reversed_cents < p_amount);
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'recorded' else 'already' end;
end; $$;

-- The safety net (Important 5): every lesson with a paying outcome and a tutor but no payout row, oldest first.
create or replace function public.payout_missing(p_limit int) returns table (booking_id uuid)
language sql security definer set search_path = '' as $$
  select b.id from public.booking b
   where b.tutor_id is not null
     and (b.status in ('completed', 'learner_no_show', 'disputed') or (b.status = 'cancelled_learner' and b.late_cancel))
     and not exists (select 1 from public.payout p where p.booking_id = b.id)
   order by b.status_changed_at nulls first
   limit greatest(1, least(p_limit, 5000));
$$;

-- Due payouts the jobs can actually claim (Important 6): a payout of a disputed lesson waits for its hold instead
-- of filling the batch.
create or replace function public.payout_due(p_limit int) returns table (id uuid)
language sql security definer set search_path = '' as $$
  select p.id from public.payout p join public.booking b on b.id = p.booking_id
   where p.status = 'scheduled' and p.transfer_started_at is null and p.decision is null and p.release_at <= now()
     and b.status in ('completed', 'learner_no_show', 'cancelled_learner')
   order by p.release_at
   limit greatest(1, least(p_limit, 5000));
$$;

-- What the transfer sent, recorded after payout_mark_paid.
create or replace function public.payout_record_transfer(p_payout uuid, p_currency text, p_cents int) returns void
language sql security definer set search_path = '' as $$
  update public.payout set transfer_currency = p_currency, transfer_cents = p_cents, updated_at = now()
   where id = p_payout and status = 'paid';
$$;

revoke all on function public.payout_missing(int) from public, anon, authenticated;
revoke all on function public.payout_due(int) from public, anon, authenticated;
revoke all on function public.payout_record_transfer(uuid, text, int) from public, anon, authenticated;
grant execute on function public.payout_missing(int) to service_role;
grant execute on function public.payout_due(int) to service_role;
grant execute on function public.payout_record_transfer(uuid, text, int) to service_role;
