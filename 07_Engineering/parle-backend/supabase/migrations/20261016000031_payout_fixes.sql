-- Plan 11 (pre-launch close-out), payout fixes: A60 (R68), A61 (R69), A64 (R72), A65 (R73), A67 (R75).

-- A60 (R68): the jobs release account_not_ready holds whose account can now receive payouts (an account.updated
-- that arrived just before a job held the payout would otherwise leave it held for good).
create or replace function public.payout_release_ready(p_limit int) returns table (id uuid)
language sql security definer set search_path = '' as $$
  update public.payout p set status = 'scheduled', hold_reason = null, held_at = null, updated_at = now()
   where p.id in (select p2.id from public.payout p2 join public.tutor_payout_account a on a.tutor_id = p2.tutor_id
                   where p2.status = 'held' and p2.hold_reason = 'account_not_ready' and p2.decision is null
                     and a.stripe_account_id is not null and a.payouts_enabled
                   order by p2.held_at limit greatest(1, least(p_limit, 500)) for update of p2 skip locked)
     and p.status = 'held' and p.hold_reason = 'account_not_ready' and p.decision is null
  returning p.id;
$$;
revoke all on function public.payout_release_ready(int) from public, anon, authenticated;
grant execute on function public.payout_release_ready(int) to service_role;

-- A61 (R69): a mark that a transfer was ever claimed, never cleared (a report overwrites the hold reason, and Release
-- must still use a new transfer attempt so Stripe does not replay the old refusal). A64 (R72): decisions after payout.
alter table public.payout add column if not exists transfer_claimed_at timestamptz;
alter table public.payout add column if not exists after_payout_decisions int not null default 0;
update public.payout set transfer_claimed_at = coalesce(transfer_started_at, updated_at)
 where transfer_claimed_at is null and (transfer_started_at is not null or hold_reason = 'transfer_failed' or stripe_transfer_id is not null);
update public.payout p set after_payout_decisions = 1 where p.status = 'paid' and p.after_payout_decisions = 0
   and exists (select 1 from public.admin_audit_log l where l.target_id = p.id::text and l.action = 'payout.refund_after_payout');

create or replace function public.payout_claim(p_payout uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.payout p set transfer_started_at = now(), transfer_claimed_at = coalesce(p.transfer_claimed_at, now()), updated_at = now()
   where p.id = p_payout and p.status = 'scheduled' and p.transfer_started_at is null and p.decision is null and p.release_at <= now()
     and exists (select 1 from public.booking b where b.id = p.booking_id and b.status in ('completed', 'learner_no_show', 'cancelled_learner'));
  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'claimed' else 'not_due' end;
end; $$;

create or replace function public.payout_decide(p_payout uuid, p_kind text, p_amount integer, p_commission integer, p_by text) returns text
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

-- A65 (R73): the Connect account key counts attempts, and a second account can never replace the first
alter table public.tutor_payout_account add column if not exists connect_attempt int not null default 0;
create or replace function public.payout_account_connect_failed(p_tutor uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.tutor_payout_account (tutor_id, connect_attempt) values (p_tutor, 1)
  on conflict (tutor_id) do update set connect_attempt = public.tutor_payout_account.connect_attempt + 1, updated_at = now()
   where public.tutor_payout_account.stripe_account_id is null;
$$;
create or replace function public.payout_account_link(p_tutor uuid, p_account text, p_country text, p_enabled boolean, p_submitted boolean, p_reason text) returns text
language sql security definer set search_path = '' as $$
  insert into public.tutor_payout_account (tutor_id, stripe_account_id, country, payouts_enabled, details_submitted, disabled_reason, waitlisted_at)
  values (p_tutor, p_account, p_country, p_enabled, p_submitted, coalesce(p_reason, ''), null)
  on conflict (tutor_id) do update set stripe_account_id = excluded.stripe_account_id, country = excluded.country, payouts_enabled = excluded.payouts_enabled,
    details_submitted = excluded.details_submitted, disabled_reason = excluded.disabled_reason, waitlisted_at = null, updated_at = now()
   where public.tutor_payout_account.stripe_account_id is null
  returning stripe_account_id;
$$;
revoke all on function public.payout_account_connect_failed(uuid) from public, anon, authenticated;
grant execute on function public.payout_account_connect_failed(uuid) to service_role;
revoke all on function public.payout_account_link(uuid, text, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.payout_account_link(uuid, text, text, boolean, boolean, text) to service_role;

-- A67 (R75): refunded_cents is the refund rows' sum, or Stripe's higher total already set by charge.refunded (a
-- dashboard refund), never our amount added on top of Stripe's total
create or replace function public.lesson_record_refund(p_booking uuid, p_amount integer, p_refund_id text, p_reason text, p_by text, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_inserted int; v_rows int;
begin
  perform 1 from public.payment where booking_id = p_booking for update;
  insert into public.refund (booking_id, amount_cents, reason, stripe_refund_id, decided_by)
  values (p_booking, p_amount, p_reason, p_refund_id, p_by)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    select coalesce(sum(amount_cents), 0)::int into v_rows from public.refund where booking_id = p_booking;
    update public.payment
       set refunded_cents = least(amount_cents, greatest(refunded_cents, v_rows)),
           status = case when status = 'disputed' then 'disputed' when greatest(refunded_cents, v_rows) >= amount_cents then 'refunded' else 'partly_refunded' end,
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
