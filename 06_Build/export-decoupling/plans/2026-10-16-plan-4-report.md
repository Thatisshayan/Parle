# Plan 4 report: migration, production, private preview, cut-over

Date: 2026-10-15. Branch `backend-plan-4`. Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-4-migration-production-cutover.md`.
Detailed reports: `migration/rehearsal-report.md`, `migration/preview-report.md`, `migration/cutover-report.md`,
`migration/prod-advisors-2026-10-15.md`. Final state: backend 195 pass (1 opt-in skip), app 370 pass.

## Tasks

- Task 1: complete (commits 02536ed..2688f32, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/migrate-transform.test.ts' → Ran 4 tests across 1 file. [68.00ms])
- Task 3: complete (commits 2688f32..fdc60d6, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/migrate-load.test.ts tests/buildy-client.test.ts' → Ran 8 tests across 2 files. [1.93s])
- Task 4: complete (commits fdc60d6..f1166f1, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/migrate-verify.test.ts' → Ran 2 tests across 1 file. [1.85s])
- Task 6: complete (commits f3028f4..541ba5a, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/cors.test.ts tests/access-coverage.test.ts tests/app-code-sync.test.ts && cd ../parle-app && bun run test' → Ran 365 tests across 30 files. [2.91s])
- Task 2: complete (commits 2688f32..541ba5a, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/buildy-client.test.ts tests/migrate-transform.test.ts' → Ran 9 tests across 2 files. [85.00ms])
- Task 5: complete (commits f1166f1..ea51b38, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/set-password-mail.test.ts tests/migrate-load.test.ts tests/migrate-verify.test.ts tests/migrate-transform.test.ts' → Ran 14 tests across 4 files. [5.93s])
- Task 7: complete (commits 555b09e..c581335, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/prod-management.test.ts' → Ran 2 tests across 1 file. [59.00ms])
- Task 8: complete (commits c581335..382dff1, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/prod-management.test.ts' → Ran 2 tests across 1 file. [46.00ms])
- Task 9: complete (commits 382dff1..9685e8f, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/prod-management.test.ts' → Ran 3 tests across 1 file. [52.00ms])
- Task 10: complete (commits 9685e8f..d8faed1, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-stripe-webhook.test.ts tests/prod-management.test.ts' → Ran 7 tests across 2 files. [273.00ms])
- Task 11: complete (commits d8faed1..6e4c94d, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/advisor-fixes.test.ts tests/fn-plan-service.test.ts tests/migrate-load.test.ts tests/migrate-verify.test.ts && cd ../parle-app && bun run test' → Ran 369 tests across 31 files. [2.34s])
- Task 12: complete (commits 6e4c94d..c3bee32, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/clean-app-tables.test.ts tests/migrate-load.test.ts tests/migrate-verify.test.ts' → Ran 11 tests across 3 files. [14.85s])

## Rulings made during execution (each with what it costs if wrong)

- Task 2: Ruling: Buildy has no "me" endpoint (auth/me returns the web page); the owner script reads id/email/name from the token's public claims inside the page and returns only those (token never leaves the page) — cost if wrong: none.
- Task 2: Ruling: gstack wraps code using await in its own async function, so owner-export.js starts with an explicit "return" — cost if wrong: none.
- Task 3: Ruling: Task 2 scripts committed before Task 3 although the owner run is pending (founder re-sign-in); Task 2 is marked complete after the owner export succeeds — cost if wrong: none.
- Task 4: Ruling: counts are checked by source id for every table (merged usage rows keep one source id), and the verifier also fails on rows whose creator has no account — cost if wrong: none.
- Task 6: Ruling: CORS is tested on the helper directly (withCors) — the local gateway (Kong) answers preflights itself and stamps "*" on every response, so the function-level behaviour can only be observed in production (checked in Task 11) — cost if wrong: production must be checked.
- Task 6: Ruling: R1 via a new migration (grant + public read policy) without regenerating the Plan 1 access-rules file (its generator test and the applied migration stay unchanged) — cost if wrong: access-tiers.json still lists the table as owner_read (documentation drift).
- Task 7: Ruling: production migrations are applied by a script through the Management API (database/query) with the founder's CLI login token, reading each file from disk and recording it in supabase_migrations.schema_migrations, instead of pasting 65 KB of SQL through the MCP tool (error-prone transcription) — cost if wrong: history rows differ slightly from MCP-applied ones; checked with list_migrations.
- Task 5: Ruling: app_setting rows whose key already exists are given the Buildy row id before the upsert (partial unique index on key cannot be an upsert target) — Buildy is the source of truth for settings — cost if wrong: a pre-existing setting value is overwritten by Buildy's (intended).
- Task 5: Ruling: verifier judges only exported rows (by id) and only email creators need an account; rows created by Buildy itself ("ai", "anonymous") have no owner by design; R-A2-01 checked by the bundle row id — cost if wrong: an ownerless row outside the export goes unreported.
- Task 5: Ruling (founder chose option 1): Premium lost after migration because Stripe metadata.user_id held the Buildy id; new step scripts/migrate/stripe-retag.ts rewrites the tag to the new login id (sandbox keys only, idempotent; replaces another id only when Stripe confirms the object belongs to this person) — cost if wrong: a Stripe tag rewritten on the wrong object (guarded by email/customer match).
- Task 5: Ruling: a second load leaves already-loaded rows untouched (upsert ignoreDuplicates, settings excepted) — an update re-stamps updated_at via the trigger and broke the tutor "listing confirmed" check — cost if wrong: a re-run does not refresh rows that changed in Buildy between loads (cut-over cleans app tables first, so the final load is all inserts).
- Task 5: Ruling: the real-export Premium test runs only with PARLE_REHEARSAL=1 — loading the real bank into the shared seeded db duplicated every question and broke 5 placement tests — cost if wrong: the Premium check is not in the everyday suite (re-run it in Task 11 against the preview).
- Task 9: Ruling: the first `vercel deploy` on a new project went to production (Vercel makes the first deploy production); the production address parle-app-tan.vercel.app was public (Standard Protection covers previews only) and served a build with no backend settings — removed that deployment (404 now); all later deploys use --target preview until cut-over — cost if wrong: none (it was a broken build created minutes earlier).
- Task 9: Ruling: stable alias parle-preview-shayans-projects-d00acc44.vercel.app for the preview so APP_ORIGINS and auth redirects survive redeploys (re-run `vercel alias set` after each preview deploy) — cost if wrong: one alias command per redeploy.
- Task 9: Ruling: .vercelignore keeps .env* out of uploads (Vite would otherwise build with .env.local = local Supabase, and the CLI token would be uploaded) — cost if wrong: none.
- Task 9: Ruling: the smoke sign-up runs in a separate headless Playwright browser under Node (scripts/prod/preview-signup-check.ts) with only the bypass cookie — the gstack browser cannot drop the bypass header once set, and that header makes Google Fonts and the function preflights refuse requests (test artifact) — cost if wrong: none.
- Task 10: Ruling: env.ts read STRIPE_WEBHOOK_SECRET with keep() so the whsec_pending placeholder would stick forever; it now reads the secrets-folder file when present — cost if wrong: none.
- Task 11: Ruling: review migration reused the 05:15 owner export (export-owner.ts --owner-file) with fresh account exports (export-20261015-0740) — the gstack browser restarted with Docker and lost the signed-in owner tab; owner rows (bank, prompts, settings, audit) rarely change — cost if wrong: owner-side changes made today are missing from the preview only; the cut-over takes a fresh owner export from the tab.
- Task 11: Ruling: admin email for the review = shayanezraeil@gmail.com (the Buildy owner) while the founder decision is open — cost if wrong: the admin role moves to another login at cut-over (re-run load with the chosen adminEmail).
- Task 12: Ruling: the clean keeps the three settings written by migrations (ai_global_daily_cap, ai_model_fast, ai_model_standard) — the plan said empty all app tables, which would have removed the AI model settings in production — cost if wrong: none (they are not Buildy data). Test clean-app-tables RED->GREEN; suite 188 pass, 1 skip, 0 fail.
- Final: Ruling: reviewer "Declined to judge" items (storage objects not migrated, cache_signature under the new secret, onboarding re-run overwriting a profile, set-password URL behind Vercel SSO, launch-time CSP/rewrite/www origin, usage_counter merge meaning, Free plan) — none hurts a person today: storage held no files in Buildy for these accounts (tutor_document 0), Premium verified via webhook re-sync, the mails went only to founder and test accounts, launch items are listed in cutover-report — cost if wrong: revisit at public launch.

## Final whole-branch review (independent reviewer, strongest model)

Verdict: acceptable as shipped; no Critical findings. Fixed in one pass, each with a test that failed first:

- Final: fixed Important 1 (Stripe sandbox shared with production: re-tag refuses non-production targets; ownership by the Stripe customer email of the login; rehearsal test no longer scrambles tags and needs PARLE_REHEARSAL_SEPARATE_STRIPE=1) — stripe-retag.test.ts RED->GREEN; prod re-tag re-run: changed 0.
- Final: fixed Important 2 (unknown person ids stop the load before any write) — migrate-load "refuses before writing anything" RED->GREEN; verifier test updated to expect the refusal.
- Final: fixed Minor 1 raised to Important (Buildy identity role whitelisted to learner/tutor) — migrate-load role test; its first RED was the ParleIdentity check constraint (the DB already refuses an admin identity row), the role assertion was adjusted to run after the refused load; not re-watched red against the old code.
- Final: fixed Minor 2 raised to Important (learner-area onboarding check runs on every page change; a failed profile read never blocks the area) — onboarding-steps.test.ts "learner area check on every page" RED->GREEN; app 370 pass.
- Final: fixed Minor 6 raised to Important (signed-in users could read tutor_payout_country.created_by/owner_id) — migration 000020 column grants; advisor-fixes "authors are not" RED->GREEN; functions use the service key (unaffected), the app never reads the table directly; suite 193 pass + sync test after re-sync.
- Final: fixed Minor 4 raised to Important (set-password links expired after about an hour) — authConfig mailer_otp_exp 86400; prod-management test RED->GREEN; production apply handed to the founder.

Deferred minors (also in `deferred-defects.md` R-register):

- Final: minor (deferred): R27 concurrent Stripe events for one checkout: two 500s, healed by Stripe retry.
- Final: minor (deferred): R28 Gemma practice content not JSON once; fallback to approved bank worked.
- Final: minor (deferred): R29 onboarding fallback/step clamp/aria-valuemax.
- Final: minor (deferred): R30 webhook resource_missing without a log line.
- Final: minor (deferred): R31 migration 000019 gaps (mixed policies, waitlist visited, is_admin per row).
- Final: minor (deferred): R32 CORS headers on thrown errors; Vary always.
- Final: minor (deferred): R33 clean stops half-way on a concurrent waitlist sign-up.
- Final: minor (deferred): R34 onboarding-required detected by message text.
- Final: minor (deferred): R35 loader never demotes a former admin.
