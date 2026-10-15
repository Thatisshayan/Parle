-- Gives back one AI message when the AI tutor's reply failed after the message was counted (final review 4).
create or replace function public.release_usage(p_user_id text, p_period text, p_period_key text, p_amount int)
returns void language sql security definer set search_path = public as $$
  update public.usage_counter set ai_messages = greatest(0, coalesce(ai_messages, 0) - greatest(p_amount, 0))
   where user_id = p_user_id and period = p_period and period_key = p_period_key and source_session_id = 'daily-total';
$$;
revoke all on function public.release_usage(text, text, text, int) from public, anon, authenticated;
grant execute on function public.release_usage(text, text, text, int) to service_role;
