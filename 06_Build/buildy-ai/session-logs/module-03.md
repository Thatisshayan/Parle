# Module 3 - Roadmap engine + Today's Plan - verification log (2026-10-10)

Prompt: `../prompts/03_roadmap-engine.txt` (sent 5:35 am). Buildy paused once to ask how check-in answers should
move levels; answered with `../prompts/03_checkin-scoring-answer.txt` (decision #27, provisional). Build finished
7:18 am after about 95 minutes. Buildy's report: `module-03_buildy-reply.txt` (20 unit tests passed, build passed,
no browser testing by Buildy).

Platform limits unchanged: listening is transcript-only, speech is not assessed.

## Buildy's fixed-input results (unit tests, not re-run by COO)
| Case | Result | COO check of the numbers |
|---|---|---|
| a) Citizenship L 1.5 S 1.0, 5 x 20 | No reading/writing; speaking 55.56%, listening 44.44%; check-in on last day | Share looks wrong: gaps 1.0 / 0.5 should give about 67 / 33. Asked in fix round 1 (item 10) |
| b) Immigration 2.0 -> 3.5, 30 min/day, 8 weeks | Unlikely, 280 h required vs 28 h; 300 min/day or 2028-04-17 | Correct (180 + 100 h; 3.5 h/week x 8) |
| c) General, budget none, 7 x 60 | 0 tutor suggestions | OK |
| d) Budget $20-35, 5 x 30 | One 45-min Suggested lesson; 95 min left | OK (150 - 10 - 45) |
| e) Two missed days | Rolls once, then dropped; no day above 120% | OK as reported |

## COO test in the preview (desktop + 375px)
Test learners created Saturday 2026-10-10, both skipped placement (credentials outside the repo):
A = citizenship, Mon-Fri x 20 min, budget none, date 2026-12-05, self-assessed A1.
B = immigration, 7 days x 30 min, budget $20-35, weekday evenings, date 2026-12-05, self-assessed A2.

| Acceptance item | Result | Notes |
|---|---|---|
| Roadmap, weekly plan and Today's Plan right after placement or skip | PARTIAL | Roadmap and plan are created on skip ("Unverified level"). Mid-week sign-up gives an empty or near-empty first week (bugs 1a, 1b). Placement route not tested (see open items) |
| Citizenship: no reading/writing tasks | PASS (as far as visible) | Learner A: targets only L and S, allocation 50 / 50, milestones only L and S. No tasks existed to inspect (bug 1a) |
| Day minutes within 120%, no repeated task type | NOT VERIFIABLE | No day had more than one task (bug 1b). Unit tests only |
| Check-in changes next week + "What changed" | PASS with bugs | Learner B: listening 3/3 -> +0.25, reading 1/3 -> -0.25, writing scored A2 by AI (no change), speaking self-rated "above" -> unchanged. Next week 32 / 45 / 39 / 39 min = 155 (210 - 10 - 45), matches the formula. Note names only the two moved skills. Next week's Today view not visible until Monday |
| Unrealistic goal shows "Unlikely" with both options | PASS with bug 3 | A: 13.3 h vs 100 h, 150 min/day, realistic 2027-12-04. B: 28 h vs 280 h, 300 min/day |
| Budget "none" never suggests a tutor | PASS | Learner A: no suggestion. Learner B ($20-35): one 45-min "Suggested" lesson, not booked |
| Unit tests cover allocation, floors, boost, rollover, feasibility | PASS (Buildy's report) | 20 passed, 0 failed |
| Screens at 375px | PASS | Today, Roadmap, Progress, check-in: scrollWidth 360, no horizontal scroll |
| Report a problem | PASS | Form opens per task, report saved ("Report received") |
| AI task placeholder | PASS | "Open AI tutor" -> placeholder screen |

## Bugs (fix round 1, `../prompts/03_fix-round1.txt`, sent ~7:55 am)
1. Mid-week first plan: (a) no available day left -> empty week and check-in page error; (b) full-week tutor
   suggestion and check-in swallow the remaining minutes -> no practice tasks, wrong "210 minutes scheduled".
2. Practice tasks cannot be answered or marked done -> minutes and streak can never move.
3. Today's Goal pace shows the realistic date without a year (means 2027 / 2028).
4. Check-in item r-a2-01: "where" question with "why" options (left over from the Module 2 bank repair).
5. Check-in options not shuffled; correct answer was A in all six questions.
6. Check-in result labels the reading line "Listening".
7. Today's check-in card: stale "later step" sentence, shows check-in transcripts in advance, raw key
   "weekly_review", "1 tasks today".
8. After sign-out, /onboarding shows the previous learner's result (sessionStorage not cleared); a
   superdev_refresh_token also remains in localStorage after sign-out (validity unknown, asked).
9. Levels shown only as "1.00 / 5" without the CEFR / NCLC label.
10. Question on the 55.56 / 44.44 share in test a).

## Security gaps added (S11-S16 in `../../export-decoupling/security-debt.md`)

## Open items
- Placement route into the roadmap not tested (both learners skipped; the earlier test learner is in the 14-day window).
- Rollover and the 120% cap seen only in unit tests.
- Settings change -> rebuild not tested.

## Module 3 status: fix round 1 in progress
