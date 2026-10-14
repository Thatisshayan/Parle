-- One-per-learner and natural-key rules (spec section 4; S5, S7, S14, S22). Existing duplicates are counted in
-- spikes/readability-report.md (by scripts/spikes/readability.ts UNIQUE_KEYS, which mirrors these predicates) and
-- resolved by the migration in Plan 4 before these rules see real data.
-- Deliberately not unique: placement_result (retakes allowed) and roadmap (versioned).
-- Buildy stores empty fields as "" (Plan 1 Task 4): text key parts that may be empty are excluded, so empty keys never
-- collide (review finding 3). usage_counter keeps a full index because increment_usage needs it for ON CONFLICT and
-- rejects empty keys itself; Plan 4 sums Buildy's usage rows per key before loading (review finding 6).
create unique index learner_profile_user_key on public.learner_profile (user_id) where user_id is not null and user_id <> '';
create unique index usage_counter_period_key on public.usage_counter (user_id, period, period_key);
create unique index week_plan_active_week_key on public.week_plan (user_id, week_start_local) where status = 'active' and user_id <> '' and week_start_local <> '';
create unique index coach_note_day_key on public."ParleCoachNote" (user_id, local_date) where user_id <> '' and local_date <> '';
create unique index subscriber_user_key on public."Subscriber" (user_id) where user_id is not null and user_id <> '';
create unique index app_setting_key on public.app_setting (key) where key <> '';
create unique index booking_live_slot_key on public.booking (tutor_user_id, start_time_utc) where status in ('requested', 'confirmed') and tutor_user_id <> '' and start_time_utc <> '';
create unique index tutor_booking_settings_tutor_key on public.tutor_booking_settings (tutor_user_id) where tutor_user_id <> '';
create unique index identity_owner_key on public."ParleIdentity" (owner_id) where owner_id is not null;
create unique index profile_owner_key on public."ParleProfile" (owner_id) where owner_id is not null;

-- One text form per instant or date, so the same slot or day cannot be stored twice in different spellings
-- (review finding 5). Times use JavaScript's toISOString() form; dates are YYYY-MM-DD. Empty stays allowed.
alter table public.booking add constraint booking_start_time_canonical
  check (start_time_utc is null or start_time_utc = '' or start_time_utc ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$');
alter table public.booking add constraint booking_end_time_canonical
  check (end_time_utc is null or end_time_utc = '' or end_time_utc ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$');
alter table public."ParleCoachNote" add constraint coach_note_local_date_format
  check (local_date is null or local_date = '' or local_date ~ '^\d{4}-\d{2}-\d{2}$');
alter table public.week_plan add constraint week_plan_week_start_format
  check (week_start_local is null or week_start_local = '' or week_start_local ~ '^\d{4}-\d{2}-\d{2}$');

-- Atomic AI-message counter (S18): the row is locked, so concurrent calls queue instead of overshooting.
-- Bad arguments raise instead of silently allowing unlimited use (review finding 7).
create or replace function public.increment_usage(p_user_id text, p_period text, p_period_key text, p_owner uuid, p_amount int, p_limit int)
returns json language plpgsql security definer set search_path = public as $$
declare v_used double precision;
begin
  if coalesce(p_user_id, '') = '' or coalesce(p_period, '') = '' or coalesce(p_period_key, '') = '' then
    raise exception 'increment_usage: user, period and period key are required';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'increment_usage: limit must be zero or more';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'increment_usage: amount must be positive';
  end if;
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
