# Backend decoupling, Plan 1 report (Phase 0 spikes + Phase 1 schema)

- **Date:** 2026-10-14
- **Branch:** `backend-plan-1` (from master 32798cf); 12 tasks, executed inline by the COO agent
- **Code:** `07_Engineering/parle-backend/`; **tests:** 52 of 52 pass after the final-review fix pass (40 before) (`bun test`, local stack running);
  `bunx supabase db lint`: no schema errors.

## Phase 0: spike decisions
| spike | finding | decision |
|---|---|---|
| Buildy readability (`spikes/readability-report.md`) | Every table with data is readable by the owner or by the account that owns the rows; no 403 anywhere | **Per-account export is enough for Plan 4**; the fallback export function is not needed. The 3 password-less test accounts now have known passwords (reset via AgentMail) |
| Buildy filters (`spikes/filter-report.md`) | App code uses equality only, 4 sort strings, limit, skip. Buildy stores empty fields as `""`; it ignores `$in` | Plan 2: equality + sorts + limit/skip, unknown sort ignored, `null` -> `is.null`. Plan 4: keep `""` as `""` |
| NVIDIA (`spikes/nvidia-report.md`) | 80 models; Kimi K3 excellent French and Persian but 40-60 s; Nemotron 3 Super fast (3-6 s) but poor Persian; DeepSeek V4.1 returned empty answers (reasoning used all tokens) | Plan 3: Kimi K3 for lessons, writing scores, drafts, coach note; bake-off GLM 5.3 / Gemma 4 / DeepSeek (more tokens) for the live chat before the founder chooses |
| Local Supabase (`spikes/local-supabase-report.md`) | First start 7 min (image downloads), ~1.05 GiB for 10 containers | Staging works on this PC; stop the stack after each session |

## Phase 1: schema
- **Tables:** 36, generated from `entities/*.json` (`20261014000001_app_tables.sql`); system columns `id`, `created_at`,
  `updated_at`, `created_by`, `owner_id`; strings stay `text`; enum checks accept `""`.
- **Unique rules + atomic usage counter** (`...0002_constraints.sql`): learner profile, active week plan, coach note per
  day, subscriber, setting key, live booking slot, tutor booking settings, identity and profile per owner; 20
  simultaneous AI-message increments against a limit of 10 record exactly 10. Not unique by design: placement result
  (retakes; `imm1` already has 2) and roadmap (versioned).
- **Roles** (`...0003_roles.sql`): `app_role()` / `is_admin()` from `app_metadata`; a user cannot make themselves admin.
- **Access rules** (`...0004_access_rules.sql`, generated from `schema/access-tiers.json`): 28 owner-read tables, booking
  readable by its learner and tutor, published tutor profiles / visible reviews / replies public, question and prompt
  banks, settings, audit log and level-check runs server-only. **No browser writes** on any app table.
- Without the rules a new table was readable and writable by anyone (the access tests failed for that reason before
  the rules were applied); with them all 6 access tests pass.

## Hand-over to Plan 2 (compatibility layer + sign-in + Resend)
1. Seven direct browser writes must move to server functions: `ParleIdentity.create`, `ParleProfile.create/update`,
   `learner_profile.create/update`, `placement_result.create/update` (`src/lib/parle-profile.ts`, `src/pages/Onboarding.tsx`,
   `src/pages/PlacementTest.tsx`).
2. Browser reads of `question_item` and `prompt_item` in `src/pages/PlacementTest.tsx` must move to a server action
   (the banks are server-only now).
3. `src/pages/LearnerTutorPlaceholder.tsx` imports `ai_message`, `ai_session`, `mistake_log`, `topic_mastery` (reads are
   owner-read, fine).
4. Replay `07_Engineering/parle-backend/tests/fixtures/filter-cases.json` against the new layer.

## Hand-over to Plan 4 (migration)
- `usage_counter` on Buildy is an append-only log: m3cit 9 of 11 rows, m3imm 7 of 9 rows share user + period + key.
  **Sum** `ai_messages` / `voice_minutes` per key before load; never drop rows.
- Re-check Buildy's full user list before export ("0 rows" for an account is not proof a table is empty).
- Rewrite `booking.learner_user_id` / `tutor_user_id` to the new Supabase user ids, and write times in `toISOString()`
  form and dates as YYYY-MM-DD (new format checks).
- Raw spike exports in `D:\AgentDevWork\parle-migration-data\spike\` are a rehearsal sample only; the real migration
  re-exports.

## Open items
- `m5tut1` password rotation (after the agent printed it during Task 3) is still rate-limited by Buildy (429 for 25+
  minutes); retry later with `bun scripts/spikes/reset-passwords.ts m5tut1`. m3cit and m3imm are rotated.
- The founder rotates the temporary NVIDIA key (it was pasted in chat).

## Final review (fresh reviewer, most capable model)
1 Critical and 8 Important findings, all fixed in one pass, each with a test that failed first (`tests/review-fixes.test.ts`,
plus unit tests): public tables exposed `created_by` / `tutor_email` / `owner_id` / `tutor_user_id` to anyone (now
column-limited grants); replies were public regardless of their review (now follow the review's visibility); six unique
indexes collided on `""` and the duplicate counter did not mirror the indexes; the same booking slot could be stored
twice in two time spellings (format checks); `increment_usage` accepted null / empty / negative arguments; a failed
confirming sign-in could lose a reset password (pending file); two report statements overclaimed (reworded above).
Minor findings are deferred and listed in the session's final message.
