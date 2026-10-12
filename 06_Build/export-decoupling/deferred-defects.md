# Deferred defects (to fix in the exported code)

Decision #30 (2026-10-11): defects Buildy does not fix in its fix round are recorded here and the build moves on.
Security gaps stay in `security-debt.md`; this file is for functional and display defects.

| ID | Module | Defect | How to reproduce | Expected | Found |
|---|---|---|---|---|---|
| D1 | 3 | First load of Today takes about 60 seconds ("Building your study plan"): AI practice content is generated on page load | Sign in as a learner whose plan has no generated content yet | Generate content in the background or at plan creation; show the plan at once | 2026-10-11 |
| D2 | 3 | Shuffled check-in options (round 1c item E) not verified in the preview | Open an unanswered weekly check-in twice | Option order differs between displays; scoring follows the option id | 2026-10-11, verify at the next check-in |
