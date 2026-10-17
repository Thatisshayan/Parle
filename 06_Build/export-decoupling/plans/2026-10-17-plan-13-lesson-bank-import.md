# Plan 13: import the Lesson Bank v1 question bank, and listening as audio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the real French bank (544 questions, 72 prompts) on local as draft, approve the 616 cleared codes,
and make every listening question a real listening question: audio from the transcript, transcript never shown or
sent to the browser, in placement, the weekly check-in and the public level check.

**Architecture:** A repo-owned import script adapted from the Lesson Bank's draft, sharing one rules module with
`bank-audit.ts`; server changes so listening questions carry a playable audio address (prepared audio, Azure) instead
of their transcript; a placement action to skip a listening question whose audio will not load (unscored); a script
to prepare all listening audio once. Production keeps the demo bank; nothing is imported to production in this plan.

**Tech Stack:** Bun scripts and tests on the local stack, Supabase edge functions (plan, voice, public level check),
the React app, the Vercel voice relay (Azure read-aloud; fake provider locally).

**Spec:** the founder's task of 2026-10-17 (pasted in the session) plus the Lesson Bank's
`D:\AgentDevWork\repos\Parle Lesson Bank\HANDOFF-TO-REPO.md` (read only). Corrections from the founder: the handoff's
section 0 items 1 and 2 are stale (R94 already reads the switched bank in full; the AI default is already GPT-6 Luna);
repairs were 83 attempted / 80 re-passed. Founder choices at plan writing (decision to record): audio failure = "Try
again", then "Skip this question" (not counted); the public level check plays prepared audio and never shows the
transcript; all listening audio is prepared once after import.

## Global Constraints

- The Lesson Bank folder is read only. Never import to production, never `--apply` on prod, and never switch
  production's `question_bank_source` to "real" without the founder's explicit go (the script refuses prod `--apply`
  without `--founder-go`).
- Keep `reviewed_by` exactly as delivered; never write "human reviewed".
- Skip `demo_code`s already present; insert as `draft`; approve only codes in `cleared-codes.txt` that are still draft.
- `rejected.jsonl` is never imported.
- A listening question's transcript never reaches the browser in placement, check-in or the public level check;
  scoring and answer keys stay on the server as today.
- No secrets in commits; Stripe test mode only; the founder deploys production migrations (none expected here).

## Review Focus

1. **A listening item whose audio is not prepared** (new item, failed generation): the learner gets Listen (generated
   on demand) or "Try again", then "Skip this question"; never the transcript, never a dead end.
2. **Skipping too many listening questions**: a section whose audio keeps failing ends as "not assessed" for
   listening rather than looping or scoring the learner down.
3. **The demo bank after this change** (production stays on demo): demo listening items still work (audio by the
   relay; no transcript shown).
4. **Re-running the import** (local now, prod later): a second run inserts nothing and changes nothing.
5. **A row the app's rules refuse**: the import writes nothing and names the row.

---

### Task 0: Setup

- [ ] Branch `plan-13-lesson-bank-import` (from `main` at `1817d19`). Workspace and ledger. Docker, local stack
  (`-x imgproxy,vector,logflare,supavisor,studio`), migrations, functions env, serve. Baselines: backend
  `bun run test` (585 pass, 1 skip, the 3 weekend-only R132 failures on weekends), app 522, type errors 61, relay 0.
- [ ] Record the Lesson Bank files' counts and hashes in the ledger (`question_items.jsonl` 544, `prompt_items.jsonl`
  72, `cleared-codes.txt` 616, `rejected.jsonl` 56) so a later prod import can confirm it imports the same files.

### Task 1: One rules module and the import script

**Files:** Create `parle-backend/scripts/lib/bank-rules.ts` (move `questionProblems`, `promptProblems`, `plain`,
`optionsOf` out of `scripts/checks/bank-audit.ts`, which then imports them); create
`parle-backend/scripts/migrate/import-lesson-bank.ts`; tests `tests/bank-rules.test.ts`, `tests/import-lesson-bank.test.ts`
with a small fixture folder `tests/fixtures/lesson-bank-mini/` (3 questions, 2 prompts, a cleared list, one row that
breaks a rule in a separate `bad/` copy).

- [ ] **Step 1: Tests first.** Unit: `bank-rules` keeps today's audit behaviour (one known-good row, one row per rule
  broken). Import (local stack): dry run reports counts and writes nothing; `--apply` inserts the fixture rows as
  draft with `reviewed_by` unchanged and `is_test_data` false; a second `--apply` inserts nothing; the `bad/` folder
  writes nothing and names the row; `approve --apply` approves only the cleared fixture codes; prod `--apply`
  without `--founder-go` refuses before connecting. Clean up the fixture rows after each test.
- [ ] **Step 2: The script**, from the draft with these changes: rules from `bank-rules.ts` (the full audit rules,
  not the draft's lighter copy, plus the draft's status check); duplicate check inside the files and against the
  table's demo_codes; exported pure functions (`readJsonl`, `planImport(rows, existingCodes)`, `planApprove(...)`) so
  the logic is unit-tested; `--bank <dir>` default the Lesson Bank `final/` folder; `prod --apply` requires
  `--founder-go`; prints counts per cell (skill x level, kind x level) and never row contents beyond demo_codes.
- [ ] **Step 3:** Run the tests, commit `feat(bank): Lesson Bank import script with shared bank rules (Plan 13)`.

### Task 2: Import and approve on local

- [ ] Dry run, `--apply`, approve dry run, approve `--apply` on local. Record counts per cell, skipped codes and any
  refused row in the ledger.
- [ ] `bun scripts/checks/bank-audit.ts local`: record its counts (the report file it writes is for the founder;
  keep it out of the commit unless it changes meaningfully).
- [ ] Admin Content coverage on local (the `admin_content_coverage` action as the test administrator): every cell
  of the real bank at or above target; record the numbers.
- [ ] Commit nothing for data (local only); ledger the outcome.

### Task 3: Listening questions carry audio, never their transcript (server)

**Files:** `_shared/voice/listening.ts` (export `preparedAudioUrls(db, kind, ids)`: for each item with a ready
cached file, a signed URL; nothing for the rest), `parle-plan-service/placement.ts` (`publicQuestion`: drop
`transcript` for listening; add `audio_url` from `preparedAudioUrls` when the item has none), the check-in
question view (`withoutAnswerKeys` path in `parle-plan-service/index.ts` and `learner-plan.ts`: same), the public
level check (`parle-public-level-check.ts` + its backend index: drop `transcript`, attach prepared audio; serve a
listening question only when its audio is prepared), placement `placement_skip_question` (listening only; adds the
served item to `askedIds` unscored; at most 3 per section, after which the listening section completes as
"not assessed"); check-in scoring accepts a skipped listening answer (`"skipped_audio"`) and leaves it out of the
count.
- [ ] Tests first for each: placement listening question has no `transcript` and has `audio_url` when prepared;
  skip is unscored and capped; check-in view has no transcript; check-in scoring ignores a skipped listening item;
  public level check never returns a transcript and only returns listening items with prepared audio; demo items
  behave the same (Review Focus 3).
- [ ] Commit `feat(listening): audio instead of the transcript for listening questions (Plan 13)`.

### Task 4: Listening as audio (app)

**Files:** `src/pages/PlacementTest.tsx`, `src/pages/LearnerWeeklyCheckin.tsx`, `src/pages/LevelCheck.tsx`,
`src/components/parle/ListeningAudioButton.tsx` (a `onGiveUp` callback after a failed retry), `src/lib/placement-test.ts`
(listening result state "assessed" for audio runs; "not_assessed" after 3 audio skips), `src/lib/i18n.ts`.
- [ ] Tests first (app unit tests): the listening block never renders transcript text; the audio player renders for
  an `audio_url`; otherwise the Listen button; after a failed retry "Skip this question" appears and calls the skip;
  the result no longer says "transcript only" for audio runs.
- [ ] New wording for the founder (Task 6): "Audio could not load. Try again." / "Skip this question" / the
  listening section notice replacing "Transcript-only demo...", and the result caveat.
- [ ] Commit `feat(app): listening questions play audio; skip when audio will not load (Plan 13)`.

### Task 5: Prepare all listening audio once

**Files:** `parle-backend/scripts/prod/prepare-listening-audio.ts` (`<local|prod>`; signs in as the test
administrator, lists items missing audio with the existing `admin_listening_missing` action, and asks the relay to
make each one, one at a time, printing counts only; prod only with `--founder-go`).
- [ ] Test on local with the fake voice provider (the relay handler in-process, as `fn-listening-audio.test.ts`
  does): every approved listening item of the chosen bank gets a ready file; a second run makes none.
- [ ] Run it on local for the real bank (fake voice). Production: not in this plan (after the founder's go, with the
  prod import).
- [ ] Commit `feat(prod): prepare listening audio for the whole bank (Plan 13)`.

### Task 6: Founder wording

- [ ] Show the Task 4 wording exactly; apply changes; record the decision (next number) with the three choices
  made at plan writing.

### Task 7: Final review and one fix pass

- [ ] Full suites and type checks; review package to a fresh reviewer on the most capable model with this plan,
  the Review Focus and the ledger; check especially that no transcript reaches the browser by any path (including
  answer feedback after a listening answer, the result page and the admin preview), the skip cap, and the import's
  refusal and idempotence. One fix pass; minors to the ledger.

### Task 8: Deploy (code only) and checks

- [ ] Functions and the preview (never `--prod`; no migration expected). Production stays on the demo bank.
- [ ] Preview checks with the demo bank: a placement listening question plays audio and shows no transcript; the
  network answer has no transcript; skip after a forced failure; the weekly check-in the same; the public level check
  (local, since the public site is the waitlist until launch). Record in the close-out report.

### Task 9: Records, documents and the report back

- [ ] Deferred lists, HANDOFF (section 4; section 5: the founder's "before real learners" list from the task: tutor
  review of B1/B2 grammar (88) and B2 reading/listening (80), a blind audit of about 40 items, a B2 difficulty check of
  about 20, then the prod import with `--founder-go`, prepare audio on prod, and the switch), the content docs that
  describe listening as transcript-only, DECISIONS.
- [ ] The report back to the founder: counts per cell on local, rows refused, and every point where the handoff did
  not match the code (at least: section 0 items 1 and 2; "86 repaired" against 83/80; listening was shown as text in
  placement and the check-in; the public level check is signed out).

### Task 10: Report and finishing

- [ ] `plans/2026-10-17-plan-13-report.md`; full suites; merge `--no-ff`, push, delete the branch and workspace,
  stop the local stack.

---

## Self-review notes (writer)

- **Coverage of the founder's task:** 1 (Task 1), 2 (Task 2), 3 (Task 2, reviewed_by kept), 4 (constraints;
  `--founder-go`), 5 (Tasks 3-5, 8), 6 (Task 9).
- **Shared interfaces:** `preparedAudioUrls` (Task 3) is used by placement, check-in and the public level check;
  `placement_skip_question` (Task 3) is called by the app (Task 4); `bank-rules.ts` (Task 1) is used by the import and
  the audit.
- **Not in this plan:** the production import, preparing production audio, switching production to "real" (all after
  the founder's go); the B2 top-up the Lesson Bank report may lead to.
