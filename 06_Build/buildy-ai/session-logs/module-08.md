# Module 8 - Admin panel - verification log

Founder decision #35 (2026-10-12): build Module 8 on Buildy next, then export. Modules 6 (bookings, payments) and 7
(subscriptions) are finished in our own code after export.

Built in small prompts:
- **Part A:** `../prompts/08a_admin-settings-users-audit.txt`, sent 2026-10-12 evening. Audit log, Settings backed by
  app_setting and read live (AI message limit, commission %), Users (search, detail, comp Premium, disable), Admin
  users, server-side admin checks. BUILDING.
- **Part B (to write after Part A is tested):** Content (question bank: generate, review, edit, approve, retire;
  coverage per skill and level against the 360-item launch minimum), Reported content queue, Reviews hide / restore,
  Metrics for a date range (sign-ups, onboarding and placement completion, week-1 retention, AI messages and an AI
  cost estimate per active learner, tutor counts) **plus the "demand versus available tutor hours" view by time zone
  and specialty (decision #33)**.
- Left out because Modules 6 and 7 are not on Buildy: Bookings, disputes, refunds, payout release, Free -> Premium
  conversion, lessons booked, gross lesson value, commission earned, tutor utilization. These metrics get a
  "needs bookings / billing" placeholder.

## Part A first run (2026-10-12 evening; `module-08a_buildy-reply.txt`, 10.77 building credits): INCOMPLETE
Draft only, Preview unchanged, no checkpoint, tests not run. Settings screen and defaults drafted (ranges: Free
messages 0-100 per day; Premium fair use 1-5,000 and not below Free; voice 0-600 minutes per month; commission 0-50%;
payout delay 0-720 hours; cancellation window 0-168 hours; minimum charge $8-$500; flags off) but not read live.
Users, Admin users and the access checks not built. Buildy says disabling accounts and admin invitations "need a
supported account-control approach".
Buildy's security notes: signed-in users can read some question-bank records and the draft settings; direct admin
data edits could bypass the audit log; a change and its audit entry are not atomic. (To add to `security-debt.md`.)
**Continue prompt sent** (`../prompts/08a2_continue.txt`), four ordered parts with a checkpoint after each: Settings
read live; Audit log screen; Users read-only plus comp Premium; server-side admin checks. Left out and to be listed
as not built: disabling accounts, inviting or removing admins, admin checks on the question bank.

## Part A second run (`module-08a2_buildy-reply.txt`, 5.73 credits): Part 1 done, in the Preview
Settings save to app_setting and each change writes an audit entry with old and new value; Buildy's tests show a
saved limit of 12 gives "7 of 12" in the learner counter and that pricing and agreement text use the saved
commission. 106 tests, build passed. Not live-tested by the COO yet (values still 10 and 20%). Parts 2-4 not done;
Buildy asked whether to continue. `../prompts/08a3_continue.txt` sent: Parts 2, 3, 4 in one run. BUILDING.
New security notes: signed-in users can read the settings values; setting and audit writes are separate, so an
audit row can be missing after a setting is saved.

## Part A third run (`module-08a3_buildy-reply.txt`): Part 2 (Audit log screen) done, in the Preview; 116 tests
Buildy again paused to ask before Part 3. `../prompts/08a4_continue.txt` sent: Part 3 (Users + comp Premium) and
Part 4 (server-side admin checks) in one run. BUILDING.

## COO test of Parts 1 and 2 in the preview (2026-10-12 night)
| Check | Result | Evidence |
|---|---|---|
| Settings screen | PASS | /admin/settings: Free AI messages per day 10, Premium fair use 300, live voice minutes 60, commission 20, payout delay 72, cancellation window 24, minimum lesson charge 8, two flags off |
| Setting read live | PASS | Saved 12; learner A's AI Tutor then showed "2 of 12 AI messages left today" (the learner had used 10 earlier the same local day). Restored to 10 and confirmed after a reload |
| Audit log | PASS | "Showing 12 events", newest first: "Setting changed - Free AI messages per day - FROM 10 messages per day TO 12 messages per day - Administrator: Shayan Salimi"; "Setting initialized" entries; filters by action type and UTC date range present. The change back to 10 adds one more entry |
| Learner sent away from admin | PASS (interface) | Learner A opening /admin/settings lands on /learner. Server-side checks are Part 4 |
| Tutor agreement shows the saved commission | NOT TESTED | Buildy's tests only |
| 375px | NOT TESTED | |

## Part 3 (Users + comp Premium): in the Preview, tested (2026-10-12 night; `module-08a4_buildy-reply.txt`, 130 tests)
COO test as the owner: /admin/users lists 6 accounts (4 learners, 2 tutors) with search and a role filter; a selected
account shows created date, email, native language, time zone (read-only; goal, levels and plan summary from the
spec are NOT shown); "Give Premium (comp)" asks for a reason and sets "Comp active" with the reason and date, and
offers "Remove comp". **Learner A (Test Citizenship M3) now has an active comp record** ("Test account for Module 7
Premium limit check"). Buildy's own note: the comp record is a recorded decision only and does not unlock anything
until Module 7 reads it.
`../prompts/08a5_part4.txt` sent: Part 4, server-side administrator checks with tests. BUILDING.

## Part 4 (server-side admin checks): accepted to Preview (`module-08a5_buildy-reply.txt`, 135 tests, 3.14 credits)
Settings, Audit and Users wait for a server check of the signed-in administrator; their actions are checked again
before running; tests reject learner and tutor calls. Not replayed live by Buildy or the COO.

## Module 8 Part A status: DONE on Buildy (2026-10-12 night), with these gaps for `deferred-defects.md` (D19-D21)
- D19 Users detail is thinner than the spec (no goal, levels, plan summary, AI usage; no tutor application status or
  rate). D20 disabling accounts and inviting / removing admins are not built (Buildy: needs a supported
  account-control approach). D21 admin checks not applied to the question-bank screens; the tutor-agreement
  commission text and the 375px layout of the new admin screens are untested.
Next on Buildy: Module 7 Part A (sent), Module 7 Part B (Stripe), Module 8 Part B.

## Part B1 (`../prompts/08b1_question-bank.txt`, sent 2026-10-13 ~2:50 pm ET) - BUILDING
Four ordered parts with a checkpoint after each: (1) coverage table per skill and level and status against the
360-item launch minimum; (2) item review and status changes with audit entries, and the server-side admin check
applied to the existing question-bank screens (closes part of D21); (3) AI-generated drafts, never auto-approved;
(4) reported-content queue with "Mark fixed" / "Dismiss" and a "Needs revision" flag at three open reports.
Part B2 (reviews hide / restore, metrics, demand versus tutor hours) follows.
Result so far (`module-08b1_buildy-reply.txt`, 185 tests): Part 1 done in the Preview. Buildy's decisions: only
approved non-demo items count toward 360; demo items shown separately; "Grammar & Vocabulary" is its own row because
the bank has it; items with missing or unrecognised fields are listed apart. Buildy's security note: existing bank
permissions still let signed-in non-admin users retrieve some draft, retired and answer-key data outside the new
screen (S23). `../prompts/08b1_continue.txt` sent: Parts 2-4 in one run, and close that read where the platform
allows. Not looked at live yet (the founder's checkout tab shares the preview sign-in).

## Part B1 continued (2026-10-13 afternoon)
- `module-08b1_continue_buildy-reply.txt`: Parts 2-4 NOT implemented. Platform limit stated by Buildy: its
  permissions cannot hide individual fields or filter access by an item's status, and locking the whole bank would
  block the approved questions placement and check-ins need; answer details are also copied into learners' saved
  tasks. So signed-in non-admins can read draft and retired items and answer keys (S23, S17). Accepted for the demo.
- `../prompts/08b1_pass2a.txt` sent ~3:50 pm ET, BUILDING: (1) admin checks on the existing audit and repair
  screens and their actions; (2) one administrator-checked, audited action to edit an item and set approved / draft
  / retired; (3) the placement and check-in services never serve draft or retired items.
- **COO live test of Part 1 as the owner, ~4:00 pm ET (while that pass was building): FAIL.** Admin > Content shows
  the heading and "Coverage could not be loaded - The content inventory could not be loaded. Refresh to try again";
  `parleMarketplaceService` answers HTTP 503 `{"error":"CONTENT_READ_FAILED"}`. "Question bank review and repair"
  (/admin/question-bank-repair) still loads: 120 questions, 16 prompts. Re-test once Buildy is idle; if it still
  fails, that is the next fix prompt.

- Pass 2A result (`module-08b1_pass2a_buildy-reply.txt`, 4:51 pm, 187 tests, build passed): the
  administrator-protection checkpoint is saved; placement and weekly check-ins already select approved items only;
  the item editor was not finished and was kept out of the Preview; bank read permissions, scoring and saved tasks
  unchanged. Next for Module 8, after the Stripe checkout fix: re-test the coverage screen as the owner, then the
  item editor, AI drafts and the reported-content queue as separate small passes.

- Re-test of the coverage screen at 5:23 pm ET with Buildy idle: still "Coverage could not be loaded", HTTP 503
  `CONTENT_READ_FAILED`. `../prompts/08b1_fix-coverage-503.txt` sent ~5:30 pm ET, BUILDING: read the log, use the
  read path the repair screen uses, test the real server path with an administrator session, show the reason.

- Coverage fix result (`module-08b1_fix-coverage_buildy-reply.txt`, 5:40 pm, 198 tests): cause "page response shape
  was invalid" on the first page of `question_item` and `prompt_item`; the coverage reader required page metadata the
  repair read does not need. Now accepts the repair path's formats, retries a failed or empty page, shows a
  specific warning. **COO re-test as the owner ~5:50 pm: PASS.** "0 of 360", "136 items" demo and test, "0 items to
  verify", table by category and CEFR level with Approved / Draft / Retired columns and "Below 10" markers (20 of 20
  approved cells below 10 launch-ready items, as expected for a bank that is all test data).
- `../prompts/08b1_item-editor.txt` sent ~6:00 pm ET, BUILDING: audited item editor (edit, status, demo flag,
  validation, coverage refresh).

- Item editor (`module-08b1_item-editor_buildy-reply.txt`, 210 tests). **COO test as the owner ~6:20 pm: PASS.**
  Listening A1 cell > item list > "Edit item": fields main text ("Ou habite Lea ?"), passage, transcript, three
  options with the correct-answer choice, explanation, status (approved), test flag (true); "Cancel" / "Save item".
  Changed the explanation, saved ("saved and recorded in administrator audit history"), reopened and read the new
  text, then restored the original and read it back. Audit log: two "Question Bank Content Updated - Question Item"
  entries with the administrator's name; the Audit screen says "Field-level values are not shown for this action"
  (the old and new values are stored but not displayed; small gap, D23). Not tested: status change, clearing the
  test flag, the block that keeps a test bucket at 10 questions / 2 prompts, validation of options.
- `../prompts/08b1_reports-and-drafts.txt` sent ~6:20 pm ET, BUILDING: Part 1 reported-content queue, Part 2
  AI-generated drafts.

- `module-08b1_reports-drafts_buildy-reply.txt` (6:44 pm, 6.14 credits): neither the reported-content queue nor the
  AI drafts were built; no tests, no checkpoint. `../prompts/08b1_reports-minimal.txt` sent ~6:50 pm ET, BUILDING:
  list of existing report records, "Mark fixed" / "Dismiss" with a required note, audit entry, open count. Left out:
  the three-report flag, saving more text with reports, AI drafts.

- Reported content, minimal (`module-08b1_reports-minimal_buildy-reply.txt`, 6:59 pm, 2.83 credits; report tests
  17 / 17; full suite reported as 177 / 178, see below). **COO test as the owner ~7:10 pm: PASS.**
  /admin/reported-content: "OPEN REPORTS 1", "Reports in this queue: 1"; the one record is the COO's Module 3 test
  report of 2026-10-10 ("Module 3 verification test report.") with its task key and task record id. "Dismiss" with
  an empty note was refused ("required"); with the note "Test report created during Module 3 verification on
  2026-10-10; no content problem." it became DISMISSED and the open count 0. "Mark fixed" not exercised (no other
  report exists). Not built: three-report flag; report text (never stored).
- Test total: this reply says 177 of 178 with one AI tutor test unable to load an app setting, while the item
  editor run reported 210 of 210. Asked in the next prompt why the total dropped and to restore the full suite.
- `../prompts/08b1_ai-drafts.txt` sent ~7:05 pm ET, BUILDING: AI-generated drafts.

- `module-08b1_ai-drafts_buildy-reply.txt` (7:14 pm, 2.52 credits): test count explained (one import failure hid
  the AI tutor file's 43 tests; fixed in the test setup) and the suite is 220 / 220 across 19 suites, build passed.
  AI drafts not started; Buildy asked permission. `../prompts/08b1_ai-drafts-go.txt` sent ~7:20 pm ET, BUILDING.

- AI drafts (`module-08b1_ai-drafts-go_buildy-reply.txt`, 7:51 pm, 229 / 229 tests). **COO test as the owner
  ~8:00 pm: PASS.** Generator on Admin > Content: category (Listening, Reading, Writing prompts, Speaking prompts,
  Grammar & vocabulary), level A1-B2, 1-5 items. Generated 1 Listening A1 item: "Saved 1 AI-generated drafts as
  Draft/test items. Review each one before approval."; demo / test count 136 -> 137; "View Listening - A1 drafts" >
  "Edit item": transcript "Bonjour ! Je m'appelle Sophie. J'ai un chat. Mon chat s'appelle Minou.", question
  "Comment s'appelle le chat de Sophie ?", options Medor / Minou / Felix with Minou marked correct, an explanation
  in French, status draft, test flag true, note "AI-generated". Left in the bank as a draft. Observation: the
  explanation is in French for an A1 item, where the hand-written items explain in English; a content-review point,
  not a defect. Not tested: failed generation, 5-item batch, prompt categories, validation rejection.
- **Part B1 is complete.** Next for Module 8: Part B2 (reviews hide / restore, metrics, demand versus tutor hours),
  queue item A7.

- Part B2 started: `../prompts/08b2a_reviews.txt` sent 2026-10-13 ~9:30 pm ET, BUILDING: admin Reviews screen (list, Hide with reason / Restore, audit, hidden reviews excluded from the public profile and rating).

## How to resume
1. Read the reply after the message containing "Confirmed as the administrator in the Preview"; save it as
   `module-08a5_buildy-reply.txt`. "Didn't get through" -> click Retry.
2. Test as the owner in the preview: change "Free AI messages per day" to 12 and check learner A's tutor shows
   "of 12" (then set it back to 10); the audit log shows both changes; Users search finds learner B; comp Premium and
   remove; disable and enable a throwaway account only (not the owner, not the test learners in use); a learner
   opening /admin is sent away; 375px.
3. Then send Module 7 Part A (`../prompts/07a_plans-limits.txt`), which uses the comp flag and the settings. One fix
   round, defer the rest, then Module 8 Part B, then BUILD-PLAN Task 9 (regression + export readiness) and the
   export itself (founder action in Buildy; code goes to `07_Engineering/`).

## Status: PART A DONE; PART B1 DONE and tested; PART B2: Reviews screen BUILDING, metrics + supply view not sent yet
