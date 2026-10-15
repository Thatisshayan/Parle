# Plan 6 report: finish group A (A28-A38) and the open group B checks (B4, B5)

Date: 2026-10-15. Branch `plan-6-finish-a-b`. Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-6-group-a-b-finish.md`.
Results on the real system: `migration/close-out-report.md`, sections "Plan 6 deploy" and "Plan 6 checks". Final state:
backend 264 pass (1 opt-in skip), app 421 pass, app type errors 63 (baseline).

## Outcome

- A28 done: first Today 1.5 s by API and 2.2 s in the browser on production (was 21.3 s); practice filled per card.
- A29 open, improved: Spanish passes; Arabic 1 of 3 runs, Hindi 2 of 3 (slow AI answers leave no time for the repeat).
- A30-A36, A38 done; A37 closed without change (harmless).
- B4 passes (tutor task hand-off): D12 hand-off part closed. B5 passes (commission sentence, 375 px): D21 closed.
- New: A39 (AI practice times out at 20 s), A40 (slow tutor answers end in 546 on the Free plan's 150 s worker limit),
  A41-A49 (final review deferred items, R49-R57).
- Production: migration 000023 applied by the founder; all 8 functions deployed (the AI service three more times for the
  A29 fixes); test admin `obsidianteamhq+admin@agentmail.to` created (decision #52); preview `parle-cuqy0sffb` aliased.

## Design choices for the founder to confirm or overrule

- A28: practice content in a second step, one request per card (two at a time, a failed card tried once more).
- A29: one repeat only after a first answer of 30 s or less, stopped near 60 s; no script check for Spanish or English.
- Photos: a save leaves uploads from the last 10 minutes; `clean_unsaved_photos` removes unsaved uploads after 10
  minutes, before each upload.
- A34: an AI lesson whose questions were all dropped uses the approved bank.

## Tasks

- Task 0: complete (commits 09c201b..09c201b, tests: baselines backend 241/1 skip/0 fail, app 397/0 fail, type errors 63; stack and functions serve up)
- Task 1: complete (commits 09c201b..820ea70, tests: bash -c 'cd 07_Engineering/parle-backend && bun test 2>&1 | tail -400 && cd ../parle-app && bun run test 2>&1 | tail -5' → Ran 398 tests across 34 files. [2.40s])
- Task 2: complete (commits 820ea70..1cb3401, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 403 tests across 35 files. [2.60s])
- Task 3: complete (commits 1cb3401..87af58f, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-tutor-language.test.ts tests/fn-tutor-lesson.test.ts tests/fn-tutor-refund.test.ts tests/fn-assessment.test.ts 2>&1 | tail -4 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 407 tests across 36 files. [2.38s])
- Task 4: complete (commits 87af58f..16051ab, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -4 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 409 tests across 36 files. [2.41s])
- Task 5: complete (commits 16051ab..3fb8418, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/profile-photo.test.ts tests/account-service.test.ts tests/storage.test.ts tests/account-deletion.test.ts 2>&1 | tail -4 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 411 tests across 36 files. [2.39s])
- Task 6: complete (commits 3fb8418..f3813da, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-assessment.test.ts tests/fn-task-content.test.ts 2>&1 | tail -4 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 414 tests across 37 files. [2.38s])
- Task 7: complete (commits f3813da..699e011, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -4 && cd ../parle-app && bun run test 2>&1 | tail -4' → Ran 418 tests across 38 files. [2.37s])
- Task 8: complete (commits 699e011..3763464, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/test-admin.test.ts 2>&1 | tail -4' → Ran 3 tests across 1 file. [52.00ms])
- Task 9: complete (commits 3763464..b790c25, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3' → Ran 3 tests across 1 file. [74.00ms])
- Task 10: complete (commits b790c25..5035f94, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-tutor-language.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 419 tests across 38 files. [2.55s])
- Task 11: complete (commits 5035f94..fb1fb5a, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3' → Ran 3 tests across 1 file. [74.00ms])

## Pre-flight

- Pre-flight: T1 -> T2: prepare_task_content {task_id} -> {status, result: LearnerTaskView}, content source "pending"; T2 consumes the same names; consistent.
- Pre-flight: T5 -> T7: T5 answers 503 PHOTO_CHECK_FAILED and adds photoUploadErrorKey in Settings.tsx; T7 adds settingsSaveErrorKey/deleteErrorKey and key settings.photoCheckError in the same file; both edit Settings.tsx, no name clash; consistent.
- Pre-flight: T8 -> T10: test admin obsidianteamhq+admin@agentmail.to + password merged into preview-test-accounts.json (checked: flat {email: password} map, 2 entries today); T10 reads the same file; consistent.
- Pre-flight: T9 -> T10: migration 000023 applied by the founder before functions deploy; T10 measures production; order as planned.

## Rulings made during execution (each with what it costs if wrong)

- Task 0: Ruling: baseline suites not re-run on the branch — main at 09c201b equals the merged code whose full suites ran minutes earlier (backend 241 pass / 1 skip / 0 fail, app 397 pass) plus only the plan file — cost if wrong: none (every task runs the suites again).
- Task 1: Ruling: test 'uses the approved bank when the AI fails' looked only for a pending reading or writing task; a fresh learner's first week holds only a speaking check — widened the pick to reading, writing or speaking (all three have bank items); the expectation (approved_bank) is unchanged — cost if wrong: none, the fallback is still exercised.
- Task 5: Ruling: photosToRemove compares upload times as instants (Date.parse) instead of as strings, and a file whose time cannot be read is kept — the plan's string compare would remove a file with an empty time ("" < cutoff) and can misorder mixed time formats — cost if wrong: none (same results for the tested inputs).
- Task 5: Ruling: the plan's rule (remove files older than the photo the profile points to) still lost the saved photo in the two-saves test (2 failures in 17 runs: one save removed the other's fresh upload just before the other wrote it); added saveCutoff — a save never removes files from the last 10 minutes, the 10-minute clean_unsaved_photos removes them later (the reviewer's second option for R39). New unit test "a save never removes a recent upload" RED->GREEN; account-service test 1 now ages the files that should go by one hour (as the clean-up test does); race test 10/10 green after — cost if wrong: up to 10 minutes of extra unsaved files, which count toward the 10-file limit until the clean-up runs before the next upload; a save of an upload older than 10 minutes at the same moment as another save can still race (very unlikely).
- Task 6: Ruling: did not restart functions serve for the new helper file (plan said restart) — the running server hot-reloaded it (18 pass, as in Plan 5 Task 12) — cost if wrong: none.
- Task 8: Ruling: the plan's admin check called action "admin_authorize", which does not exist; the script uses the read-only, administrator-only "admin_content_coverage" with view "coverage" (first run sent no view and got 400 after the administrator check passed; fixed, then a separate sign-in with the saved password got 200 "complete") — cost if wrong: none, the check only reads.
- Task 9: Ruling: first click-through run showed 'AI reply arrived: false' — logs show no reply call was made (the script sends while its second 'Free chat' session is still opening); the re-run got the reply; recorded both runs — cost if wrong: a real slow tutor would show again in Task 10's A29 check, which measures each reply. Note: a successful language repeat leaves no log line, so a 46.6 s tutor call cannot be told apart from a slow AI answer (for the final review).
- Task 10: Ruling: A29 check on production found a Task 3 regression: "Start the reply with one or two sentences in <language>" made every explain-in-native reply stop after an introduction (Spanish 131 chars, Arabic 97; a French-first learner got the full 387-char explanation). Fixed in a5d3b50 (rule now asks for the complete explanation; test changed from the phrase to its absence) RED->GREEN, app 418/418; deployed parle-assessment-service. The plan's own test had pinned the harmful phrase — cost if wrong: none, the live re-run decides.
- Task 10: Ruling: re-run after a5d3b50: Spanish full explanation in Spanish, Hindi 79 %, but Arabic answered 546: the worker that served the 40.7 s opening was shut down at 150 s while the reply (first answer + language repeat) had run 109.6 s; the message stays charged when the worker is killed (Review Focus 5 broken on production). Fixed (commit after a5d3b50): explanationRepeatBudgetMs — repeat only after a first answer of at most 30 s, cut off at 60 s total, and an info log line when a repeat runs (closes the Task 9 logging gap); test RED->GREEN, app 419, tutor backend 11/11; deployed parle-assessment-service — cost if wrong: an Arabic, Persian or Hindi learner whose first answer is slow keeps a French answer (logged).
- Final: Ruling: Important 3 (two tabs or a quick reopen prepare the same task twice) — no learner-visible effect (the re-read keeps the first result); a clean claim needs a new content status and migration; accepted as extra AI cost, follow-up recorded as A41 / R49 — cost if wrong: about double NVIDIA calls during the slow window for learners who reopen Today.
- Final: Ruling: Important 4 (when the time budget wins, the language repeat's AI call keeps running) — charge and refund stay correct; cancelling needs an AbortSignal through the provider and belongs with the A40 decision (worker limit); recorded on A40 / R48 — cost if wrong: a busier worker makes A40's 546 slightly more likely until then.
- Final: Ruling: reviewer "Declined to judge" items (A39 practice timeout, A40 worker limit, Spanish/English not script-checked, test admin, check-script accuracy, docs wording, B5/D12/D21 evidence) — all already recorded as open items, founder decisions or accepted design; none newly harmful — cost if wrong: none beyond the open items.

## Final whole-branch review (independent reviewer, strongest model)

Verdict: ready to merge with fixes; no Critical findings. Fixed in one pass, each with a test that failed first:

- Final: fixed Important 1 (a pending card skipped or done before its practice arrived showed "Preparing" forever) — task-content-queue.test.ts "a pending card that was skipped or done shows no waiting note" RED->GREEN, app 421/421, backend 264 pass / 1 skip / 0 fail.
- Final: fixed Important 2 (a long week of pending cards can meet the 150 s worker limit and show "could not be loaded") — prepareTasks retries each failed card once after the others; test "a failed card is tried once more after the others" RED->GREEN, suites as above.

Deferred minors (also in `deferred-defects.md` as R50-R57 and the inventory as A42-A49):

- Final: minor (deferred): R50 a photo save racing the pre-upload clean-up can point the profile at a deleted file (Save not disabled while a photo uploads); security-debt wording overstates "never".
- Final: minor (deferred): R51 a removed upload answers "That file is not a photo" instead of "choose your photo again".
- Final: minor (deferred): R52 a failing clean-up before upload is silent (no log line).
- Final: minor (deferred): R53 pages cached from before the deploy show pending cards without material until reloaded.
- Final: minor (deferred): R54 the Review Focus 5 test does not check the message was charged once.
- Final: minor (deferred): R55 a plan rebuilt during preparation can save bank content for the old topic.
- Final: minor (deferred): R56 prepareMyTaskContent reads up to 500 task rows twice per call.
- Final: minor (deferred): R57 a writing, speaking or lesson card marked "unavailable" is never retried, though its message says to refresh.
