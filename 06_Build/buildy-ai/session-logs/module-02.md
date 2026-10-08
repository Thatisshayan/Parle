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
