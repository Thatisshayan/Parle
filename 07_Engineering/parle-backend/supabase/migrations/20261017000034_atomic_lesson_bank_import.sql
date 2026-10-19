-- Plan 13: import both bank files in one transaction so a failure cannot leave a partial import.
create or replace function public.import_lesson_bank_atomic(p_questions jsonb, p_prompts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  code text;
  question_count integer;
  prompt_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_typeof(p_prompts) <> 'array' then
    raise exception 'question and prompt payloads must be arrays';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('parle.lesson_bank.import'));

  for item in select value from jsonb_array_elements(p_questions) as entries(value) loop
    code := item->>'demo_code';
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'demo_code') is distinct from 'string'
      or nullif(pg_catalog.btrim(code), '') is null
      or item->>'status' is distinct from 'draft'
      or item->>'is_test_data' is distinct from 'false'
      or item->>'format' is distinct from 'multiple_choice'
      or coalesce(item->>'skill', '') not in ('listening', 'reading', 'grammar_vocabulary')
      or coalesce(item->>'cefr_level', '') not in ('A1', 'A2', 'B1', 'B2')
      or jsonb_typeof(item->'prompt') is distinct from 'string'
      or nullif(pg_catalog.btrim(item->>'prompt'), '') is null
      or nullif(pg_catalog.btrim(item->>'explanation'), '') is null
      or jsonb_typeof(item->'answer') is distinct from 'string'
      or jsonb_typeof(item->'options') is distinct from 'array'
      or coalesce(jsonb_array_length(item->'options'), 0) not between 2 and 4
      or exists (select 1 from jsonb_array_elements(item->'options') o where jsonb_typeof(o) is distinct from 'object' or nullif(pg_catalog.btrim(o->>'id'), '') is null or nullif(pg_catalog.btrim(o->>'text'), '') is null)
      or (select count(*) <> count(distinct o->>'id') from jsonb_array_elements(item->'options') o)
      or not exists (select 1 from jsonb_array_elements(item->'options') o where o->>'id' = item->>'answer_option_id') then
      raise exception 'invalid question row: %', code;
    end if;
    if exists (select 1 from public.question_item q where q.demo_code = code) then
      raise exception 'question demo_code already exists: %', code;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_prompts) as entries(value) loop
    code := item->>'demo_code';
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'demo_code') is distinct from 'string'
      or nullif(pg_catalog.btrim(code), '') is null
      or item->>'status' is distinct from 'draft'
      or item->>'is_test_data' is distinct from 'false'
      or coalesce(item->>'kind', '') not in ('writing', 'speaking')
      or coalesce(item->>'cefr_level', '') not in ('A1', 'A2', 'B1', 'B2')
      or item->>'track' is distinct from 'all'
      or jsonb_typeof(item->'text') is distinct from 'string'
      or nullif(pg_catalog.btrim(item->>'text'), '') is null then
      raise exception 'invalid prompt row: %', code;
    end if;
    if exists (select 1 from public.prompt_item p where p.demo_code = code) then
      raise exception 'prompt demo_code already exists: %', code;
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_questions)) <>
     (select count(distinct value->>'demo_code') from jsonb_array_elements(p_questions)) then
    raise exception 'duplicate question demo_code in payload';
  end if;
  if (select count(*) from jsonb_array_elements(p_prompts)) <>
     (select count(distinct value->>'demo_code') from jsonb_array_elements(p_prompts)) then
    raise exception 'duplicate prompt demo_code in payload';
  end if;

  insert into public.question_item (
    demo_code, skill, cefr_level, format, prompt, passage, transcript, audio_url,
    options, answer_option_id, answer, explanation, status, created_by_type,
    reviewed_by, content_audit_version, is_test_data
  )
  select demo_code, skill, cefr_level, format, prompt, passage, transcript, audio_url,
    options, answer_option_id, answer, explanation, status, created_by_type,
    reviewed_by, content_audit_version, is_test_data
  from jsonb_to_recordset(p_questions) as q(
    demo_code text, skill text, cefr_level text, format text, prompt text,
    passage text, transcript text, audio_url text, options jsonb,
    answer_option_id text, answer text, explanation text, status text,
    created_by_type text, reviewed_by text, content_audit_version text, is_test_data boolean
  );

  insert into public.prompt_item (
    demo_code, kind, cefr_level, track, text, status, created_by_type,
    reviewed_by, content_audit_version, is_test_data
  )
  select demo_code, kind, cefr_level, track, text, status, created_by_type,
    reviewed_by, content_audit_version, is_test_data
  from jsonb_to_recordset(p_prompts) as p(
    demo_code text, kind text, cefr_level text, track text, text text,
    status text, created_by_type text, reviewed_by text,
    content_audit_version text, is_test_data boolean
  );

  question_count := jsonb_array_length(p_questions);
  prompt_count := jsonb_array_length(p_prompts);
  return jsonb_build_object('questions', question_count, 'prompts', prompt_count);
end;
$$;

revoke all on function public.import_lesson_bank_atomic(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_lesson_bank_atomic(jsonb, jsonb) to service_role;
