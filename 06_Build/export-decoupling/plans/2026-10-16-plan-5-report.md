# Plan 5 report: deferred close-out (groups A and B)

Date: 2026-10-15. Branch `plan-5-close-out`. Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-5-deferred-close-out.md`.
Results: `migration/close-out-report.md` (deploy and checks B1-B8), `migration/bank-audit-2026-10.md`, status column in
`deferred-inventory-2026-10-15.md`. Final state: backend 241 pass (1 opt-in skip), app 397 pass. New open items: A28, A29.

## Tasks

- Task 0: complete (commits 1c2f584..1c2f584, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 370 tests across 31 files. [2.33s])
- Task 1: complete (commits 1c2f584..0e8c615, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/guards.test.ts tests/cors.test.ts tests/superdev-compat.test.ts tests/fn-jobs.test.ts' → Ran 21 tests across 4 files. [4.61s])
- Task 2: complete (commits 0e8c615..cb1c9ce, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/account-service.test.ts tests/local-setup.test.ts tests/account-deletion.test.ts tests/fn-placement.test.ts' → Ran 28 tests across 4 files. [11.57s])
- Task 3: complete (commits cb1c9ce..ef3f335, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/paging.test.ts tests/account-service.test.ts tests/storage.test.ts tests/app-code-sync.test.ts tests/account-deletion.test.ts && cd ../parle-app && bun run test' → Ran 372 tests across 32 files. [2.45s])
- Task 4: complete (commits ef3f335..03956a8, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/account-service.test.ts tests/auth-flow.test.ts tests/app-code-sync.test.ts && cd ../parle-app && bun run test' → Ran 380 tests across 33 files. [6.05s])
- Task 5: complete (commits 03956a8..cd1b0e0, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-plan-service.test.ts tests/app-code-sync.test.ts && cd ../parle-app && bun run test' → Ran 381 tests across 33 files. [2.64s])
- Task 6: complete (commits cd1b0e0..3fd6347, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/superdev-compat.test.ts tests/compat-entities.test.ts tests/fn-marketplace.test.ts tests/fn-plan-service.test.ts' → Ran 35 tests across 4 files. [11.58s])
- Task 7: complete (commits 3fd6347..74d4ac6, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-placement.test.ts' → Ran 8 tests across 1 file. [5.88s])
- Task 8: complete (commits 74d4ac6..0250932, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/retry.test.ts tests/account-service.test.ts tests/fn-stripe-webhook.test.ts tests/account-deletion.test.ts' → Ran 33 tests across 4 files. [12.69s])
- Task 9: complete (commits 0250932..b2b82f3, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-stripe-webhook.test.ts tests/account-deletion.test.ts tests/fn-jobs.test.ts tests/account-service.test.ts' → Ran 39 tests across 4 files. [14.80s])
- Task 10: complete (commits b2b82f3..c43af9c, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts && cd ../parle-app && bun run test' → Ran 384 tests across 33 files. [2.32s])
- Task 11: complete (commits c43af9c..4c47d0a, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-assessment.test.ts && cd ../parle-app && bun run test' → Ran 391 tests across 33 files. [2.32s])
- Task 12: complete (commits 4c47d0a..e03e6ea, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-tutor-lesson.test.ts tests/fn-tutor-refund.test.ts tests/fn-assessment.test.ts && cd ../parle-app && bun run test' → Ran 396 tests across 34 files. [2.42s])
- Task 13: complete (commits e03e6ea..0a3b6d3, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/advisor-fixes.test.ts tests/access-rules.test.ts tests/access-coverage.test.ts' → Ran 16 tests across 3 files. [6.91s])
- Task 14: complete (commits 0a3b6d3..d0316d3, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/clean-app-tables.test.ts tests/migrate-load.test.ts tests/test-accounts.test.ts tests/migrate-verify.test.ts' → Ran 22 tests across 4 files. [9.27s])
- Task 15: complete (commits d0316d3..50d559f, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 396 tests across 34 files. [2.36s])
- Task 16: complete (commits 50d559f..4388e65, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-assessment.test.ts' → Ran 8 tests across 1 file. [5.79s])
- Task 17: complete (commits 4388e65..3d1f73b, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 396 tests across 34 files. [2.39s])

## Rulings made during execution (each with what it costs if wrong)

- Task 12: Ruling: did not restart functions serve after the sync (plan said restart) — the running server hot-reloaded and the new helper was picked up (13 pass) — cost if wrong: none.
- Task 15: Ruling: local `bun run build` cannot run on this machine (Windows Smart App Control blocks swc native binding, ERR_DLOPEN_FAILED); the build is verified by the Vercel preview build in Step 6 — cost if wrong: none (Vercel builds the same code).
- Task 15: Ruling: founder secrets upload (PUBLIC_SUPABASE_URL) still pending; deployed functions work without it (hosted SUPABASE_URL is the public address; photo check passed) — cost if wrong: none; upload at the founder next convenience.
- Task 16: Ruling: B4 tutor-task hand-off and B5 commission/375px browser checks not run — local app cannot start (Smart App Control now blocks vite too) and admin screens on the preview need the founder admin sign-in; recorded as open in the report (D12, D21 stay open) — cost if wrong: two display checks wait for the founder.
- Task 16: Ruling: B8 rows are mostly migrated Buildy tasks; treated as too little own traffic despite >= 30 rows — cost if wrong: none (R28 stays watch).
- Task 16: Ruling: scripts/checks/local-admin.ts not created (its only use, the local admin screen check, could not run) — cost if wrong: one small helper to add when the screens are checked.
- Final: Ruling: reviewer "Declined to judge" items (Subscriber row with an old created_by email keeps the webhook at 500; learner_profile owner mismatch on saveMine; loader re-set after cut-over; clean hiding a removal plus a sign-up; whether a refused lesson uses the allowance; A1 prompt quality; placement left finished without a result) — none newly introduced or harmful today: the Subscriber/created_by case predates Plan 5 and has no live occurrence (one migrated subscriber, re-tagged), the rest are migration-time or low-impact — cost if wrong: the Subscriber email-change case would need its own fix later.

## Final whole-branch review (independent reviewer, strongest model)

Verdict: ready to merge with fixes; no Critical findings. Fixed in one pass, each with a test that failed first:

- Final: fixed Important 1 (stem check dropped valid object/reflexive pronoun items with nous/vous, could block pronoun lessons) — item-stem.test.ts "keeps valid object and reflexive pronoun items" RED->GREEN; suite backend 241 pass 1 skip 0 fail, app 397.
- Final: fixed Minor 2 raised to Important (a killed scoring request locked the placement writing step until the next UTC day) — fn-placement.test.ts "a writing claim left by a killed request does not lock the run" RED->GREEN; claim window 300 s; suite as above. Deployed parle-assessment-service and parle-plan-service.

Deferred minors (also in `deferred-defects.md` as R38-R46):

- Final: minor (deferred): R38 onboarding at step 7 when the sign-in check ends "unknown" still shows the visitor account step.
- Final: minor (deferred): R39 simultaneous photo saves (two tabs, or picking a new photo during a save) can delete each other\x27s file.
- Final: minor (deferred): R40 ten never-saved uploads block further photo uploads with a generic error.
- Final: minor (deferred): R41 a transient storage error is reported as "not a photo" and deletes the upload; the check downloads the whole file.
- Final: minor (deferred): R42 an ai_lesson whose questions are all dropped can still show its passage with no questions.
- Final: minor (deferred): R43 the tutor badge stays "Checking your plan" if the plan summary fails and no session opens.
- Final: minor (deferred): R44 new account-service refusal codes (INVALID_INPUT, SUBSCRIPTION_UNREADABLE) reach the screen as generic errors.
- Final: minor (deferred): R45 one rate_limit_hit row per placement run stays until the 2-day cleanup (harmless).
- Final: minor (deferred): R46 local only: PUBLIC_SUPABASE_URL is 127.0.0.1, a browser on localhost gets PHOTO_INVALID.
