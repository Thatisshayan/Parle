-- Serialize slot-hold creation for one tutor. The cleanup UPDATE and the booking
-- exclusion constraint can otherwise deadlock when several learners race for
-- slots with that tutor. The lock is transaction-scoped and is released when
-- lesson_hold returns to its caller.
create or replace function public.lesson_hold(p_learner uuid, p_tutor uuid, p_profile text, p_start timestamptz, p_minutes int,
  p_buffer int, p_price int, p_commission numeric, p_message text, p_hold_minutes int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(74201, hashtext(p_tutor::text));

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

revoke all on function public.lesson_hold(uuid, uuid, text, timestamptz, int, int, int, numeric, text, int) from public, anon, authenticated;
grant execute on function public.lesson_hold(uuid, uuid, text, timestamptz, int, int, int, numeric, text, int) to service_role;
