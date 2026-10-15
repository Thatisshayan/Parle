# Migration rehearsal report (local staging)

Date: 2026-10-15. Plan 4, Task 5. Local Supabase staging (Docker) only; production was not touched.

## What was run

1. Export from Buildy (Task 2): the six test accounts plus the owner preview (shayanezraeil@gmail.com, administrator).
   Bundle: 7 people, 434 rows. Stored outside the repo at `D:/AgentDevWork/parle-migration-data/export-20261015-0515/`.
2. `supabase db reset --local --no-seed` (empty app tables, as production will be after the cut-over clean).
3. `bun scripts/migrate/verify.ts <bundle> shayanezraeil@gmail.com local`: creates logins, loads, verifies.
4. `bun scripts/migrate/stripe-retag.ts <bundle> local`: re-tags the Stripe sandbox subscription and customer with
   the new login id (2 changed, no problems).
5. Set-password email for m3imm, the owner and m5tut1 through local Mailpit; each password set from the email link.
6. Signed in to the local app as each of them and checked the pages below.

## Counts (exported = loaded)

| Table | Rows | Table | Rows |
|---|---|---|---|
| ParleCoachNote | 2 | milestone | 17 |
| ParleCompStatus | 1 | mistake_log | 11 |
| ParleIdentity | 6 | placement_result | 4 |
| ParleProfile | 5 | practice_report | 1 |
| ParlePublicLevelCheckRun | 2 | prompt_item | 16 |
| Subscriber | 1 | question_item | 121 |
| admin_audit_log | 23 | roadmap | 2 |
| ai_message | 82 | skill_estimate | 8 |
| ai_session | 26 | topic_mastery | 16 |
| app_setting | 9 (12 with the 3 AI-model settings from migrations) | tutor_application_review | 1 |
| availability_rule | 2 | tutor_payout_country | 5 |
| checkin | 1 | tutor_profile | 1 |
| learner_profile | 3 | tutor_profile_public_edits | 1 |
| learner_task | 42 | tutor_public_profile | 1 |
| usage_counter | 4 (20 Buildy rows merged into daily totals) | week_plan | 4 |

Empty in Buildy and so empty here: availability_exception, booking, tutor_booking_settings, tutor_document,
tutor_review, tutor_review_reply.

## Verifier

82 checks `ok`, 0 `FAIL`, `VERIFIED`. Included: no migrated row without an owner, 0 person ids without an account,
0 rows whose creator has no account, 138 rows written by Buildy itself (question bank, prompts, anonymous level-check
runs; no owner by design), 0 values pointing at Buildy hosts, question bank 121, prompts 16, R-A2-01 keeps its
options, the subscription row carries status and signature, tutor availability present.

## Checks in the app

| Who | Check | Result |
|---|---|---|
| m3imm (paying learner) | Today shows the migrated plan, levels and last check-in change | ok |
| m3imm | Your plan: "Premium plan (monthly), renews on November 13, 2026", 300 messages a day | ok (after the Stripe re-tag) |
| m3imm | Progress: migrated week, 10 minutes, streak | ok |
| m3imm | AI tutor history: 18 sessions, 39 messages owned by the new login (database check) | ok; the tutor page itself could not open a new session because local functions use the fake AI provider with an empty queue (test setting, not a migration issue) |
| owner | Admin opens as administrator; Applications shows Camille T. approved | ok |
| owner | Users: the 6 learner and tutor accounts | ok |
| owner | Content: 137 items (121 questions + 16 prompts) | ok |
| owner | Settings: saved settings loaded | ok |
| m5tut1 (tutor) | Dashboard: "Your profile is visible to learners", administrator comment, availability Tue and Thu (America/Toronto) | ok (after the timestamp fix) |

## What failed and how it was fixed

Each fix has a test that failed first.

1. **Settings clash with an existing key.** Loading stopped on the one-setting-per-key rule when the key already
   existed. Fix: an existing row with the same key takes Buildy's id and value.
   Test: "a setting whose key already exists takes Buildy's value instead of failing".
2. **Verifier too broad.** It counted rows that were not part of the export, and content written by Buildy itself
   (creator "ai" or "anonymous") as rows without an owner. Fix: it judges only exported rows, and only email creators
   need an account. Test: "judges only the exported rows, and content written by Buildy's AI needs no owner".
3. **Paying learner showed as Free (Review Focus 5).** Stripe tags the subscription and customer with the Buildy user
   id, so the server's re-check with Stripe could not match the new login. Fix (founder chose this option): new step
   `scripts/migrate/stripe-retag.ts` re-tags both with the new login id. Sandbox keys only; runs twice safely; a tag
   from an earlier practice run is replaced only when Stripe confirms the customer's email or the subscription's
   customer. Test: "the paying learner is still Premium after migration and a set-password".
4. **Loading twice reset every row's "last changed" time (Review Focus 2).** The database stamps `updated_at` on
   every update, so a second load made the tutor's approved profile look edited after the review, and the dashboard
   said the listing was not confirmed. Fix: rows already loaded are left untouched on a second load (settings
   excepted). Test: "loading the same export again keeps every row's own timestamps".

## Notes for production (Tasks 11 and 12)

- Run `stripe-retag` after every load into a new database (preview and final); it is part of the cut-over steps.
- The preview load and the final load each start from empty app tables, so the final load is all new rows.
- A setting row re-loaded over itself gets a new `updated_at`; nothing reads that time today.
