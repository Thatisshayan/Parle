-- Plan 11 (pre-launch close-out), booking fixes: A52 (R60), A53 (R61), A57 (R65), A59 (R67), A80 (R88).

-- A52 (R60): a move expires the tutor's lapsed holds first (lesson_hold does; lesson_reschedule did not), so a time
-- shown free is not refused for up to 10 minutes. The expiry stays even when the move then fails.
create or replace function public.lesson_reschedule(p_booking uuid, p_learner uuid, p_start timestamptz, p_window_hours int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.booking set status = 'expired', status_changed_at = now()
   where tutor_id = (select tutor_id from public.booking where id = p_booking)
     and status = 'pending_payment' and hold_expires_at < now();
  begin
    update public.booking
       set start_at = p_start, end_at = p_start + make_interval(mins => minutes), reschedule_count = reschedule_count + 1,
           booked_at = now(), reminder_24h_sent_at = null, reminder_1h_sent_at = null, status_changed_at = now()
     where id = p_booking and learner_id = p_learner and status = 'confirmed' and reschedule_count = 0
       and start_at >= now() + make_interval(hours => p_window_hours);
    get diagnostics v_changed = row_count;
  exception when exclusion_violation then
    return 'slot_taken';
  end;
  if v_changed = 0 then return 'not_allowed'; end if;
  delete from public.lesson_brief where booking_id = p_booking;
  return 'rescheduled';
end; $$;

-- A53 (R61): one cancel at a time per lesson. A claim older than 2 minutes (a function that died) can be taken again.
alter table public.booking add column if not exists cancel_claimed_at timestamptz;
create or replace function public.lesson_claim_cancel(p_booking uuid) returns boolean
language sql security definer set search_path = '' as $$
  with c as (update public.booking set cancel_claimed_at = now()
              where id = p_booking and status = 'confirmed'
                and (cancel_claimed_at is null or cancel_claimed_at < now() - interval '2 minutes') returning id)
  select exists (select 1 from c);
$$;
revoke all on function public.lesson_claim_cancel(uuid) from public, anon, authenticated;
grant execute on function public.lesson_claim_cancel(uuid) to service_role;

-- A57 (R65): a tutor never reads holds, and the browser reads only the columns the lesson_brief and lesson_notes rules
-- need (every screen reads lessons through parle-lesson-service).
drop policy if exists "booking: participants read" on public.booking;
create policy "booking: participants read" on public.booking for select to authenticated
  using (learner_id = (select auth.uid()) or (tutor_id = (select auth.uid()) and status not in ('pending_payment', 'expired')));
revoke select on public.booking from authenticated;
grant select (id, learner_id, tutor_id, tutor_profile_id, start_at, end_at, minutes, status, reschedule_count,
  booked_at, status_changed_at, cancelled_by, late_cancel, completed_at, created_at) on public.booking to authenticated;

-- A59 (R67) and A80 (R88): a hold ended by an account deletion or a pause (cancelled_by set) is refunded when a late
-- payment arrives, never confirmed. Body as before except the late-payment branch.
create or replace function public.lesson_confirm_payment(p_session text, p_payment_intent text, p_amount integer, p_event text) returns text
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
  elsif b.status = 'expired' and b.cancelled_by is null then
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
