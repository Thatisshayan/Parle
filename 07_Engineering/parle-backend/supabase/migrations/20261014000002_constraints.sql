-- One-per-learner and natural-key rules (spec section 4; S5, S7, S14, S22). Existing duplicates are counted in
-- spikes/readability-report.md and removed by the migration in Plan 4 before these rules see real data.
-- Deliberately not unique: placement_result (retakes allowed) and roadmap (versioned).
create unique index learner_profile_user_key on public.learner_profile (user_id) where user_id is not null and user_id <> '';
create unique index usage_counter_period_key on public.usage_counter (user_id, period, period_key);
create unique index week_plan_active_week_key on public.week_plan (user_id, week_start_local) where status = 'active';
create unique index coach_note_day_key on public."ParleCoachNote" (user_id, local_date);
create unique index subscriber_user_key on public."Subscriber" (user_id) where user_id is not null and user_id <> '';
create unique index app_setting_key on public.app_setting (key);
create unique index booking_live_slot_key on public.booking (tutor_user_id, start_time_utc) where status in ('requested', 'confirmed');
create unique index tutor_booking_settings_tutor_key on public.tutor_booking_settings (tutor_user_id);
create unique index identity_owner_key on public."ParleIdentity" (owner_id) where owner_id is not null;
create unique index profile_owner_key on public."ParleProfile" (owner_id) where owner_id is not null;

-- Atomic AI-message counter (S18): the row is locked, so concurrent calls queue instead of overshooting.
create or replace function public.increment_usage(p_user_id text, p_period text, p_period_key text, p_owner uuid, p_amount int, p_limit int)
returns json language plpgsql security definer set search_path = public as $$
declare v_used double precision;
begin
  insert into public.usage_counter (user_id, period, period_key, owner_id, ai_messages)
  values (p_user_id, p_period, p_period_key, p_owner, 0)
  on conflict (user_id, period, period_key) do nothing;
  select ai_messages into v_used from public.usage_counter
   where user_id = p_user_id and period = p_period and period_key = p_period_key for update;
  if coalesce(v_used, 0) + p_amount > p_limit then
    return json_build_object('ok', false, 'used', coalesce(v_used, 0));
  end if;
  update public.usage_counter set ai_messages = coalesce(ai_messages, 0) + p_amount
   where user_id = p_user_id and period = p_period and period_key = p_period_key;
  return json_build_object('ok', true, 'used', coalesce(v_used, 0) + p_amount);
end; $$;
revoke all on function public.increment_usage(text, text, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.increment_usage(text, text, text, uuid, int, int) to service_role;
