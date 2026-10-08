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
