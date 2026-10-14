# Spike: can every Buildy row be exported? (Plan 1, Task 3)

- **Date:** 2026-10-14, ~7:30-8:00 pm ET
- **Method:** `07_Engineering/parle-backend/scripts/spikes/readability.ts` signed in to Buildy's API as each of the 6
  test accounts and read every entity (paged, `q={}`); `scripts/spikes/owner-counts.js` ran inside the signed-in owner
  preview page and returned counts only (the owner token never left the page). Raw rows were saved only to
  `D:\AgentDevWork\parle-migration-data\spike\` (outside the repo). This report holds counts, not contents.

## Password resets (Task 2)
- `imm1`, `learner1`, `tutor1` had no saved password: reset through Buildy's forgot-password flow, mail read from the
  AgentMail inbox, new password confirmed by a sign-in before saving. All three: **OK**.
- Incident during this task: a layout check printed the saved passwords of `m3cit`, `m3imm`, `m5tut1` into the agent's
  tool output. Rotated the same way: `m3cit` and `m3imm` **rotated**; `m5tut1` hit Buildy's rate limit (429) and is
  retried automatically every 5 minutes (outcome recorded in the Plan 1 report).

## Result
**Every row visible to the owner or to one of the 6 test accounts was readable; no 403 answer occurred.** Caveat
(final review): Buildy filters rows per user and answers 0 rows rather than 403 for rows a user may not see, so a table
"empty" here is only empty for these 7 accounts. Today Buildy has exactly 6 accounts (Admin > Users) plus the owner,
all covered, so per-account export is sufficient for Plan 4; Plan 4 must re-check the user list before concluding
and stop if any user cannot be signed in.

| entity | rows | exportable by |
|---|---|---|
| question_item | 121 | any account (all learners can read the answer keys: S9 confirmed) |
| prompt_item | 16 | any account |
| app_setting | 9 | any account |
| tutor_payout_country | 5 | any account |
| tutor_public_profile | 1 | any account |
| ParleIdentity | 6 | owner (all); each account its own |
| ParleProfile | 5 | owner (all); each account its own (tutor1 has none) |
| admin_audit_log | 23 | owner |
| ParlePublicLevelCheckRun | 2 | owner |
| ParleCompStatus | 1 | owner |
| tutor_application_review | 1 | owner, m5tut1 |
| tutor_profile, tutor_profile_public_edits | 1 each | owner, m5tut1 |
| availability_rule | 2 | owner, m5tut1 |
| practice_report | 1 | owner, m3imm |
| learner rows (learner_profile, placement_result, roadmap, milestone, week_plan, learner_task, checkin, skill_estimate, topic_mastery, mistake_log, ai_session, ai_message, usage_counter, ParleCoachNote, Subscriber) | m3cit: 1/1/1/4/2/7/0/4/7/5/8/43/11/1/0; m3imm: 1/1/1/13/2/35/1/4/9/6/18/39/9/1/1; imm1: learner_profile 1, placement_result 2 | each learner only (owner reads 0) |
| availability_exception, booking, tutor_booking_settings, tutor_document, tutor_review, tutor_review_reply | 0 | 0 rows for all 7 accounts (see caveat above) |

## Duplicates that break the new unique rules (Plan 4 must clean before loading)
| table | key | duplicates |
|---|---|---|
| usage_counter | user_id + period + period_key | m3cit 9 of 11 rows, m3imm 7 of 9 rows. **On Buildy this table is an append-only usage log** (one row per AI exchange, `source_event_id`): Plan 4 must **sum** `ai_messages` and `voice_minutes` per key, never drop rows |
| all other keys in `UNIQUE_KEYS` | | 0 (recounted after the final review with predicates that mirror the indexes) |

## Notes for later plans
- `imm1` has **2** `placement_result` rows: confirms the decision not to make placement results unique.
- The owner (admin) cannot read learners' private rows on Buildy (0 everywhere): the migration must read as each
  learner, as designed.
- The total in the Admin coverage screen (137) = 121 questions + 16 prompts.
