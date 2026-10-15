-- The AI tutor's daily usage on our backend is one server-written total row per learner and day, marked
-- source_session_id = 'daily-total' so the ported counter tells it apart from Buildy's one-row-per-message events.
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
  insert into public.usage_counter (user_id, period, period_key, owner_id, ai_messages, source_session_id)
  values (p_user_id, p_period, p_period_key, p_owner, 0, 'daily-total')
  on conflict (user_id, period, period_key) do nothing;
  select ai_messages into v_used from public.usage_counter
   where user_id = p_user_id and period = p_period and period_key = p_period_key for update;
  if coalesce(v_used, 0) + p_amount > p_limit then
    return json_build_object('ok', false, 'used', coalesce(v_used, 0));
  end if;
  update public.usage_counter set ai_messages = coalesce(ai_messages, 0) + p_amount, source_session_id = 'daily-total'
   where user_id = p_user_id and period = p_period and period_key = p_period_key;
  return json_build_object('ok', true, 'used', coalesce(v_used, 0) + p_amount);
end; $$;
revoke all on function public.increment_usage(text, text, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.increment_usage(text, text, text, uuid, int, int) to service_role;
