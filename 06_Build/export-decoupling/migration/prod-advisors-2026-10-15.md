# Production advisors after the first deploy (2026-10-15)

Project "Parle" (hcphvipeplkfenugikrf), right after the 16 migrations and the functions deploy, before any data.
For the Task 11 security pass. Each finding gets a decision there: fix, or accept with the reason.

## Security

| Level | Finding | First reading |
|---|---|---|
| INFO | RLS on, no policy: ParlePublicLevelCheckRun, admin_audit_log, ai_test_queue, app_setting, placement_run, prompt_item, question_item, rate_limit_hit, waitlist_signup | Intended: server-only tables, read only by the functions with the service key (Plan 1 tiers). Accept. |
| WARN | Mutable search_path: set_updated_at, app_role, is_admin | Fix: `set search_path = ''` (or `public`) on each. app_role and is_admin are used in policies. |
| WARN | pg_net installed in schema public | Check whether it can move to `extensions` without breaking `private.call_function`; otherwise accept. |
| WARN | join_waitlist is SECURITY DEFINER and callable by anon and authenticated | Intended: the waitlist form calls it without signing in. Existing before Plan 4; never touch the waitlist. Accept. |

## Performance

| Level | Finding | First reading |
|---|---|---|
| WARN | auth.uid() re-evaluated per row in 28 "owner reads" / "participants read" policies | Fix later: `(select auth.uid())`; low data volume today. |
| WARN | tutor_payout_country has two permissive SELECT policies for authenticated (owner reads + public reads, R1) | Fix: drop "owner reads" now that public reads covers it. |
| INFO | placement_run.owner_id foreign key has no index | Fix: add the index. |
| INFO | 36 unused owner_id indexes | Expected on an empty database. Ignore. |
