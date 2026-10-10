# Module 2 - Onboarding + Placement - verification log (2026-10-08)

Buildy split the module: Phase A (onboarding, sign-up attach, skip path) and Phase B (adaptive test, bank, scoring).
Platform limits (Buildy): no built-in text-to-speech or speech-to-text -> listening items are transcripts, speaking
"Not yet assessed" until an external provider key is added. Google sign-up not available.

## Phase A results (375px, fresh visitor)
| Check | Result |
|---|---|
| Step 1 multi-goal + main goal | PASS |
| Step 2 immigration prefill NCLC 7 x4, editable | PASS (changed speaking to NCLC 8) |
| Step 3 target date + TEF/TCF booked date (immigration only) | PASS |
| Step 4 self-assessment | PASS |
| Refresh at step 5 keeps place and answers | PASS |
| Back navigation keeps answers (step 6 -> 2, NCLC 8 retained) | PASS |
| Step 6 native language, time zone auto-detected (America/Toronto), budget | PASS |
| Step 7 sign-up attaches answers | PASS (native language + time zone present in Settings) |
| Skip placement -> "Unverified level", A2 self-assessed, estimate label | PASS |
| "See my roadmap" -> "Your roadmap is being prepared" | PASS |
| 375px no horizontal scroll | PASS |
Not verifiable in UI yet: goals/targets/availability stored on learner_profile (will be exercised by Module 3).

## Security gaps added
S6 learner can edit own self-assessment / result status; S7 duplicate profile/result records possible.

## Phase B results (desktop, immigration learner, full test 2026-10-08 16:24)
| Check | Result |
|---|---|
| Adaptive up (A2 -> B1 -> B2 after 2 correct each) | PASS (listening) |
| Adaptive down (A2 -> A1 after 2 wrong) | PASS (reading) |
| Section lengths 6 / 6 / 7 (stable stop) | PASS |
| Writing AI score + rubric + feedback | PASS in ~7 s (B1, Task 4 Grammar 3 Vocab 3 Coherence 4) |
| Speaking "Not yet assessed", no mic prompt | PASS (platform: no STT) |
| Results: per-skill CEFR, NCLC ranges, estimate label, transcript warning, retake date (+14 d) | PASS with bug 4 below |
## Bugs (fix round 1)
1. Literal "\n" in reading passages. 2. Question/passage mismatch (Nora "autre chemin") and feedback/option mismatch
("Elle arrive" vs "Il arrive"). 3. Correct answer almost always option A (gameable). 4. Results say "NCLC 5-7" and
"reaches or exceeds NCLC 7" together.

## Fix round 1 results
- Buildy: line-break rendering, per-run option shuffling (balanced correct positions), NCLC "may be close" wording - done in code.
- Question bank repair run by COO as administrator (owner session) on /admin/question-bank-repair:
  audit flagged 120; suggested corrections spot-checked (Nora/Karim fix correct) and accepted; first apply was
  interrupted at 67/136 by a COO page reload (mistake) - re-audit flagged the remaining 56; re-applied.
  Manual corrections written for the 4 previously excluded items:
  GV-B1-09 (feedback rewritten), GV-B2-07 (feedback rewritten), GV-B2-10 (option C "fait" -> "ferait" to remove a
  second correct answer), L-B1-04 (transcript and options rewritten for clarity).
  Final: "Saved 136 rows. Verified that 120 questions and 16 prompts remain."
- Not re-tested in a fresh placement run (test learner is inside the 14-day retake window); covered in Phase 1 sign-off.
## Module 2 status: ACCEPTED for demo

## Follow-up found during Module 3 testing (2026-10-10)
The bank repair left at least one inconsistent item: r-a2-01 asks "Où Nora propose-t-elle de se retrouver ?" but its
options still answer "why". Repair and a re-audit of all rewritten items requested in Module 3 fix round 1 / 1b (item D).
The fresh placement run after the repair is still owed (Phase 1 sign-off, or sooner with a new learner).
