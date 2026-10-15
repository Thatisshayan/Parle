-- AI models chosen by the founder after the bake-off (decision #49, 2026-10-15). Values are JSON strings, as Buildy stored settings.
do $$
declare v record;
begin
  for v in select * from (values
    ('ai_model_fast', '"google/gemma-4-31b-it"'),
    ('ai_model_standard', '"z-ai/glm-5.3"'),
    ('ai_global_daily_cap', '2000')
  ) as t(k, val) loop
    update public.app_setting set value = v.val, updated_at = now() where key = v.k;
    if not found then
      insert into public.app_setting (key, value, updated_by) values (v.k, v.val, 'decision-49');
    end if;
  end loop;
end $$;
