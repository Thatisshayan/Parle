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

## Fix round 1 results (Buildy reply 8:40 am, `module-03_fix1_buildy-reply.txt`; NOT re-tested by COO yet)
Buildy did only a first slice (items 1 and 10) and stopped to ask. Planner tests 24/24, build passed.
| Item | Buildy says | COO re-test |
|---|---|---|
| 1a No days left this week | First plan now starts Mon Oct 12; Today shows upcoming tasks; check-in page shows its due date (Fri Oct 16) instead of an error | PENDING |
| 1b Partial week | Learner B plan uses only Sat + Sun, 60 scheduled minutes, no tutor suggestion, speaking check Sat, check-in Sun, both days filled. Older saved plans refresh | PENDING |
| 1 (gap Buildy found) | Learner A full week schedules only 65 of 100 minutes (task lengths and type rules) | Sent as item A in round 1b |
| 2-9 | NOT changed in this slice | Sent again in round 1b |
| 10 Allocation question | Formula matches the spec. The fixture for case a) used target 3.5 for both skills (gaps 2.0 and 2.5 -> 44.44 / 55.56). With gaps 0.5 / 1.0 a new test gives 33.33 / 66.67 | Fixture is wrong for citizenship (target should be NCLC 4 = 2.0). Sent as item J |

## Fix round 1b (`../prompts/03_fix-round1b.txt`, sent 2026-10-10 8:45 am ET) - BUILDING when this log was written
One run, no pausing, do not start Module 4. Items: A fill every day to 80-120% (+ tests for 5x20, 7x30, 3x45,
7x60); B task completion (answerable vocabulary/listening, Mark as done / Skip, minutes and streak); C year on dates;
D repair r-a2-01 and re-audit repaired items; E shuffle check-in options; F result label; G Today check-in card;
H clear state on sign-out + refresh token question; I CEFR / NCLC labels; J citizenship fixture target 2.0.

## Fix round 1b results (Buildy reply 2026-10-10 9:34 am, `module-03_fix1b_buildy-reply.txt`; NOT re-tested by COO yet)
Buildy again did one slice and stopped to ask. Unit tests 31/31, build passed, no preview testing by Buildy.
| Item | Buildy says | COO re-test |
|---|---|---|
| A Schedule fill 80-120% | Done; tests for 5x20, 7x30, 3x45, 7x60 | PENDING |
| B Task completion, minutes, streak | Done. Vocabulary = reveal and self-rate; first answer locks; Progress shows the latest eight done / skipped tasks; check-in counts only when submitted | PENDING |
| J Citizenship fixture target 2.0 | Done: 33.33% listening / 66.67% speaking | Matches the expected numbers |
| C-I | NOT done | Sent again in round 1c |
New security note from Buildy: correct answer ids are stored with learner-owned practice content (learner can read the key before answering) and learners can edit their own task records, so completion and Progress are self-reported demo data. To add to `security-debt.md` as S17-S18 at the re-test.

## COO re-test of round 1b in the preview (Sunday 2026-10-11, evening ET, while round 1c was building)
Founder allowed the preview sign-out / test-learner sign-in step for this session.
| Item | Result | Evidence |
|---|---|---|
| 1a No days left this week (learner A) | PASS | Today: "Your plan starts Monday, Oct 12", week Oct 12-18 listed with tasks; no error |
| A Schedule fill (learner A, 5 x 20) | PASS | Mon 10+10, Tue 20, Wed 20, Thu 20, Fri 10 + check-in 10 = 100% every day, 100 scheduled minutes; no reading / writing tasks; no repeated task type in a day |
| A Schedule fill (learner B, 7 x 30, partial week) | FAIL | Sunday shows 4 tasks = 40 minutes on a 30-minute day (133%, above the 120% cap). Screenshot `module-03/r1b-learnerB-today-sunday.png` |
| B Answer a question | PASS | Chose "Seven hours" -> "Correct."; vocabulary task asks to answer before "Mark as done" |
| B Mark as done / Skip | PASS | Done: "10 minutes added"; Skip: "adds no completed minutes or streak day"; Progress lists both under Recent task activity; streak 1 |
| B Minutes totals | FAIL (new) | Learner A did a Monday Oct 12 task early on Sunday Oct 11: Today says "10 of 100 scheduled minutes completed this week" but "0 MINUTES TODAY"; Progress says "Completed minutes this week 0 min, week of Oct 12" and charts the 10 minutes under the week of Oct 5 |
| J Fixture | Accepted on Buildy's numbers (33.33 / 66.67) | Learner A in the preview has equal gaps (1.0 / 1.0 to target 2.0) so 50 / 50 is right there |

New bugs for the next round (K-N):
- K. Learner B (check-in submitted Sat Oct 10): Sunday shows TWO weekly check-in cards, one DONE ("View check-in") and
  a second not started ("Start weekly check-in"). One check-in per week.
- L. Same screen: header "40 MINUTES TODAY" and four tasks against a 30-minute day, and "10 of 30 scheduled minutes
  completed this week" does not match the 40 minutes listed.
- M. Learner B still shows "Starting level: Unverified level" and "What changed: Your first plan uses your
  self-assessment" one day after a scored check-in that moved listening and reading.
- N. Early completion of a next-week task: the three minute counters disagree (see row above). Decide one rule
  (count on the local completion date) and use it on Today and Progress.
- Slow first load: Today sat on "Building your study plan" for about 60 seconds for both learners (AI content
  generated on page load). Note for Module 4 / export, not a blocker.
Items C-I still showed their old behaviour, as expected while round 1c builds ("later step" sentence, "weekly_review",
date without year, "1.00 / 5" without CEFR).

## Fix round 1c (`../prompts/03_fix-round1c.txt`, sent 2026-10-11 9:08 pm ET, finished 9:24 pm)
Reply: `module-03_fix1c_buildy-reply.txt`. Buildy did C, E, F, G, I and again left D and H ("need separate reviews").
38 tests passed, build passed, no preview testing by Buildy. COO re-test with learner B, 2026-10-11 ~9:40 pm:
| Item | Result | Evidence |
|---|---|---|
| C Year on dates | PASS | Today: "target date is Saturday, Dec 5, 2026", "realistic date is Monday, Jun 12, 2028"; Roadmap milestones and Progress goal pace carry the year |
| E Shuffle check-in options | NOT VERIFIABLE YET | Learner B's check-in for this week is already saved; learner A's is due Fri Oct 16. Test at the next unanswered check-in |
| F Reading label | PASS | Result shows "READING / Reading: 1 of 3 correct" |
| G Today check-in card | PASS | No "later step" sentence, no transcripts, no "weekly_review"; "4 tasks today" (singular not seen) |
| I CEFR / NCLC labels | PASS | "A2 · 2.25 / 5 · Approx. NCLC 5 · Estimate - not an official score" on Roadmap, Progress and check-in result |
| D Bank repair, H sign-out cleanup | NOT DONE | Sent again in round 2 |

## Fix round 2 (`../prompts/03_fix-round2.txt`, sent 2026-10-11 ~9:30 pm ET, finished 9:59 pm)
Reply: `module-03_fix2_buildy-reply.txt`. **Nothing was changed**: both of Buildy's implementation attempts stopped
before editing; no tests ran; the build check passed on the unchanged preview (8.22 credits used). Items D, H, K, L, M,
N are all NOT DONE.

## Module 3 status: ACCEPTED WITH DEFERRED DEFECTS (2026-10-11, decision #30)
The founder decided not to spend more rounds: the open items are recorded as D1-D8 in
`../../export-decoupling/deferred-defects.md` and will be fixed in the exported code. Not tested and carried to the
Phase 1 regression (Task 9): placement route into the roadmap, rollover and the 120% cap in the preview, settings
change -> plan rebuild, shuffled check-in options (D2).
Preview note: reloading the preview tab signs it back in as the owner; sign out and sign in as the learner again.

## 2026-10-13 late fixes on Buildy (queue item B2)
- D5 + D6: `../prompts/09c_one-checkin-and-cap.txt` -> `module-09c_checkin-cap_buildy-reply.txt` (278 / 278 tests).
  Buildy: a refresh adds no check-in if one is scheduled or done in the local week; retained tasks count toward the
  120% cap; Today shows completed minutes in the header and a scheduled total equal to the listed tasks. COO check
  as learner B ~11:55 pm: header "0 MINUTES COMPLETED TODAY", "Scheduled today: 30 min", 2 tasks (Reading 10,
  Writing 20). Refresh behaviour not re-created live; unit tests only.
- D7: `../prompts/09d_estimates-after-checkin.txt` -> `module-09d_estimates_buildy-reply.txt` (282 / 282 tests,
  3.86 credits). COO live check 2026-10-14 ~12:15 am as learner B: Today "Current level - Listening A2 2.25 / 5,
  Reading A2 1.75, Writing A2 2.00, Speaking A2 2.00 - Estimate - not an official score" (matches Roadmap) and the
  check-in's "What changed" note. PASS. The "no assessment yet" state rests on unit tests.
- D8: `../prompts/09e_minutes-local-date.txt` -> `module-09e_minutes_buildy-reply.txt` (284 / 284 tests). COO live
  check ~12:30 am as learner B: "Mark as done" on Reading 10 min; Today "10 MINUTES COMPLETED TODAY", "You completed
  10 minutes of practice this week"; Progress "COMPLETED MINUTES THIS WEEK 10 min - Week of Oct 12". PASS. Early
  completion across a week boundary and the 11:30 pm case rest on unit tests. B2 closed. Before the fix, Today showed
  "Starting level: Unverified level" while Roadmap shows current estimates (Listening A2 2.25, Reading A2 1.75,
  Writing A2 2.00, Speaking A2 2.00) and the "What changed" note already showed the check-in's change.
