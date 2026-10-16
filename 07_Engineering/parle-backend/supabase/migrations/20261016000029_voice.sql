-- Plan 9 (spec 06_Build/export-decoupling/specs/2026-10-16-plan-9-voice-design.md): voice counters, speaking results,
-- the read-aloud preference and the listening audio cache. Recordings are never stored: only transcripts (like typed
-- answers) and generated listening audio (Parle's own content). Every table is server-only. Settings keep their
-- defaults in code (parle-admin-settings.helper.ts): this migration writes no app_setting row.

-- One row per use of the voice relay. Answers and placement recordings stay 'pending' (holding the transcript) until
-- they are scored; 'void' rows (too short, not French, provider failure, nothing heard) do not count.
create table public.voice_use (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('answer', 'message', 'reply', 'placement')),
  day date not null,
  ref text not null default '' check (char_length(ref) <= 200),
  status text not null default 'counted' check (status in ('pending', 'counted', 'void')),
  void_reason text not null default '' check (void_reason in ('', 'too_short', 'not_french', 'provider_failed', 'empty', 'abandoned')),
  parts integer not null default 0 check (parts between 0 and 4),
  transcript text not null default '' check (char_length(transcript) <= 6000),
  duration_ms integer not null default 0 check (duration_ms between 0 and 200000),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
comment on table public.voice_use is 'Plan 9: voice uses per learner and day (the daily limits); an answer keeps its transcript until scored. Server-only.';
create index voice_use_count on public.voice_use (user_id, kind, day);
create unique index voice_use_reply_once on public.voice_use (user_id, day, ref) where kind = 'reply';
alter table public.voice_use enable row level security;
revoke all on public.voice_use from anon, authenticated;

create table public.speaking_result (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('task', 'placement')),
  mode text not null default 'spoken' check (mode in ('spoken', 'typed')),
  task_id text not null default '',
  placement_run_id uuid,
  ticket_id uuid unique references public.voice_use(id) on delete set null,
  prompt_text text not null default '' check (char_length(prompt_text) <= 2000),
  transcript text not null check (char_length(transcript) <= 6000),
  criteria jsonb not null,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  corrections jsonb not null default '[]'::jsonb,
  tip text not null default '' check (char_length(tip) <= 600),
  duration_ms integer not null default 0,
  word_count integer not null default 0,
  words_per_minute integer,
  created_at timestamptz not null default now()
);
comment on table public.speaking_result is 'Plan 9: scored speaking answers (transcript, four criteria, level, corrections, tip). No audio. Server-only.';
create index speaking_result_task on public.speaking_result (user_id, task_id);
alter table public.speaking_result enable row level security;
revoke all on public.speaking_result from anon, authenticated;

create table public.voice_preference (
  user_id uuid primary key references auth.users(id) on delete cascade,
  read_aloud boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.voice_preference is 'Plan 9: the tutor''s "Read replies aloud" switch, per learner. Server-only.';
alter table public.voice_preference enable row level security;
revoke all on public.voice_preference from anon, authenticated;

-- Generated listening audio, keyed by the item and a hash of its script (works for real bank items, R94).
create table public.listening_audio (
  cache_key text primary key check (char_length(cache_key) <= 200),
  item_kind text not null check (item_kind in ('question_item', 'learner_task')),
  item_id text not null,
  owner_id uuid references auth.users(id) on delete cascade, -- set for a learner's own task audio
  script_hash text not null,
  path text not null default '',
  status text not null default 'pending' check (status in ('pending', 'ready')),
  claimed_at timestamptz not null default now(),
  ready_at timestamptz
);
comment on table public.listening_audio is 'Plan 9: index of generated listening audio in the private bucket listening-audio. Server-only.';
alter table public.listening_audio enable row level security;
revoke all on public.listening_audio from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listening-audio', 'listening-audio', false, 10485760, array['audio/mpeg'])
on conflict (id) do nothing;

-- A scored speaking answer moves the speaking estimate (Plan 9 ruling 10). Same check as 20261014000001, one value added.
alter table public."skill_estimate" drop constraint if exists "skill_estimate_source_check";
alter table public."skill_estimate" add constraint "skill_estimate_source_check"
  check ("source" in ('placement','self_assessment','self_assessment_fallback','checkin','retake','speaking_task',''));

-- Takes one use of a kind for a learner's day, under the limit, one learner and kind at a time.
create or replace function public.voice_take(p_user uuid, p_kind text, p_day date, p_limit int, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_used int; v_id uuid;
begin
  if p_user is null or p_day is null or p_kind not in ('answer', 'message', 'reply', 'placement') or p_limit is null or p_limit < 0 then
    raise exception 'voice_take: user, day, a known kind and a limit of zero or more are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('voice:' || p_user::text || ':' || p_kind, 0));
  if p_kind = 'reply' then
    select id into v_id from public.voice_use where user_id = p_user and kind = 'reply' and day = p_day and ref = coalesce(p_ref, '');
    if v_id is not null then
      select count(*) into v_used from public.voice_use where user_id = p_user and kind = 'reply' and day = p_day and status <> 'void';
      return jsonb_build_object('ok', true, 'ticket_id', v_id, 'used', v_used, 'again', true);
    end if;
  end if;
  -- an answer or placement recording never scored within 15 minutes (scoring failed, a part never arrived) gives its
  -- use back, and its transcript goes (Plan 9 final review, Important 1)
  if p_kind in ('answer', 'placement') then
    update public.voice_use set status = 'void', void_reason = 'abandoned', transcript = '', settled_at = now()
     where user_id = p_user and kind = p_kind and status = 'pending' and created_at < now() - interval '15 minutes';
  end if;
  if p_kind = 'placement' then
    select count(*) into v_used from public.voice_use where user_id = p_user and kind = 'placement' and ref = coalesce(p_ref, '');
  else
    select count(*) into v_used from public.voice_use where user_id = p_user and kind = p_kind and day = p_day and status <> 'void';
  end if;
  if v_used >= p_limit then
    return jsonb_build_object('ok', false, 'used', v_used);
  end if;
  insert into public.voice_use (user_id, kind, day, ref, status)
  values (p_user, p_kind, p_day, coalesce(p_ref, ''), case when p_kind in ('answer', 'placement') then 'pending' else 'counted' end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'ticket_id', v_id, 'used', v_used + 1, 'again', false);
end; $$;
revoke all on function public.voice_take(uuid, text, date, int, text) from public, anon, authenticated;
grant execute on function public.voice_take(uuid, text, date, int, text) to service_role;

-- One generation per listening item and script, even when two learners open it at once.
create or replace function public.listening_claim(p_key text, p_kind text, p_item text, p_owner uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.listening_audio;
begin
  insert into public.listening_audio (cache_key, item_kind, item_id, owner_id, script_hash)
  values (p_key, p_kind, p_item, p_owner, p_hash)
  on conflict (cache_key) do nothing;
  if found then
    return jsonb_build_object('state', 'claimed');
  end if;
  select * into v from public.listening_audio where cache_key = p_key for update;
  if v.status = 'ready' then
    return jsonb_build_object('state', 'ready', 'path', v.path);
  end if;
  if v.claimed_at < now() - interval '90 seconds' then
    update public.listening_audio set claimed_at = now() where cache_key = p_key;
    return jsonb_build_object('state', 'claimed');
  end if;
  return jsonb_build_object('state', 'busy');
end; $$;
revoke all on function public.listening_claim(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.listening_claim(text, text, text, uuid, text) to service_role;
