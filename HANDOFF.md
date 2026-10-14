# Parle: HANDOFF (read this first)

> **Last updated: 2026-10-13 ~11:55 pm ET.** Rewritten clean on this date so a new session can resume
> with no other context. Read this file top to bottom, then `06_Build/buildy-ai/BUILDY-QUEUE.md` (the working list),
> then the session log of whichever item is in progress. The step-by-step history of 2026-10-10 to 2026-10-12 is in
> the session logs and in `git log`; decisions are in `10_Decisions-Meetings/DECISIONS.md` (39 so far).

## 1. What Parle is
A French learning and tutoring web platform. A learner states a goal, takes a placement test and gets a personalized,
self-updating roadmap that combines an AI tutor, practice and vetted human tutors. Launch tracks: Canada Immigration
(NCLC 7, four skills), Canadian Citizenship (NCLC 4, speaking + listening), General / Conversation. Full spec:
`02_Product/specs/00_master-spec.md`. "Parle" is a working name (the founder said the name is still temporary); the
founder owns the domain **parle.buzz** (decision #31). The founder decides; Claude acts as COO and runs the build.

## 2. How it is built, and the agreed path from here
Buildy.ai generates the app; the COO sends small prompts, tests every step in the Preview, logs and commits.
The Buildy build is a TEST-ONLY demo (decision #26): no real users, no real money.
**Agreed sequence (decisions #35 to #39):**
1. Push as much as possible onto Buildy first (founder, 2026-10-12): work down `06_Build/buildy-ai/BUILDY-QUEUE.md`.
2. Final regression pass and export readiness notes (BUILD-PLAN Task 9).
3. Export: the founder downloads the code from Buildy (Dashboard > Website Settings > Code Export) into
   `07_Engineering/`.
4. The COO inspects the exported code.
5. Deploy on Vercel as a PROTECTED PREVIEW, without the domain. Put a "coming soon, join the waitlist" page on
   parle.buzz (also on Vercel).
6. Plan the deferred work and the decoupling from Buildy (the export still uses Buildy's database, sign-in and
   server functions through `@superdevhq/client`).
7. Connect parle.buzz to the app only once the backend is our own.

## 3. State of the Buildy app (project https://www.buildy.ai/projects/yuircx1jlz5bpg1jbv2th, unpublished)
| Area | State | Log |
|---|---|---|
| Module 1 Foundation | Done, platform gaps | `session-logs/module-01.md` |
| Module 2 Onboarding + placement | Accepted for demo | `module-02.md` |
| Module 3 Roadmap, Today's Plan, check-in | Accepted with deferred defects D1-D8 | `module-03.md` |
| Module 4 AI tutor (5 modes, mistake log, mastery, limit, Persian explanations) | Accepted with D9-D13 | `module-04.md` |
| Module 5 Tutor marketplace (application, admin review, tutor list with match score, public profile) | Accepted with D14-D16 | `module-05.md` |
| Module 6 Bookings + payments | **Stopped on Buildy.** Slot calculator (9 tests incl. time zones and the 2026-11-01 clock change) and slot picker work; a lesson request cannot be saved (D17); payments never started (D18) | `module-06.md` |
| Module 7 Subscriptions + limits | Part 1 done and verified live: Premium status from an admin comp grant; AI tutor limit by plan ("290 of 300"). "Your plan" page done and tested. **Stripe sandbox billing works** (founder's checkout 2026-10-13: Premium monthly, limit 300). Not built yet: remaining upgrade links, roadmap triggers | `module-07.md` |
| Module 8 Admin | Part A done and tested: Settings read live, Audit log, Users + comp Premium, server-side admin checks (gaps D19-D21). Part B not built: question bank, reported content, reviews, metrics | `module-08.md` |
| Tutor area | Application, Availability, **Dashboard home and Profile & Pricing work (tested 2026-10-13)**. Students, Lessons, Earnings wait for bookings | `module-05c2_buildy-reply.txt` |

The three signed-in areas today: Learner (most complete), Tutor (application + availability; the rest thin),
Admin (about half). Details of what works in each: `session-logs/` per module.

## 4. Exactly where the work is (resume here)
**Updated 2026-10-13 ~6:30 pm ET.**

**Done since the table above was written:** queue item A2, the tutor area. Tested live as the approved tutor
(Camille T.): the Dashboard shows the application status with the administrator's comment and next step, the
profile completeness checklist, "How learners see you" with a link to the published profile, this week's
availability (Tue and Thu 18:00-21:00, America/Toronto) and the note about lessons and earnings; Profile & Pricing
loads the six editable details and saved a headline change ("Saved. Your public profile update is pending and may
take up to one hour to appear for learners"), which was still there after a reload; 375px passes. Reply:
`session-logs/module-05c2_buildy-reply.txt`.
- The five-minute background job: Buildy reports its schedule removed from the project source; the public profile
  now refreshes hourly or by the admin's "Refresh now". **Buildy could not independently verify that the old
  schedule registration is gone** (the platform shows no schedule list); the retired address answers 404. Treat as
  probably removed; if credits drain with nobody building, this is the first suspect.
- Not verified: that a learner sees the changed headline after the hourly refresh or "Refresh now".
- The checklist ticked "Profile photo added" for a tutor with initials only (sent as a fix with the next prompt).

**Done 2026-10-13 ~1:45 am ET:** queue item A3, the "Your plan" page (`session-logs/module-07c_buildy-reply.txt`,
165 of 165 tests). Tested live: learner B (Free) sees "Free plan", "0 of 10 AI messages used today", both limits,
the prices $14.99 per month and $119 per year with "Save 34%", and both upgrade buttons show "Payment opens in the
next step"; 375px passes. Learner A sees "Premium plan (complimentary)", "0 of 300 AI messages used today", live
voice "Coming soon" and no upgrade buttons; the AI Tutor reads "300 of 300 AI messages left today", "Premium plan",
and the diagnostic block is gone. Side result: learner A had used 10 messages on Oct 12 and shows 0 used on Oct 13,
so the daily reset works (closes the doubt in D10).

**Queue item A5, Stripe billing in the sandbox: BUILT, waiting for the founder's checkout (2026-10-13 ~2:35 pm ET).**
- First prompt (`prompts/07b_stripe-billing.txt`) was refused by Buildy (webhooks are not allowed by this project's
  Stripe integration; `session-logs/module-07b_buildy-reply.txt`).
- Second prompt (`prompts/07b2_stripe-no-webhook.txt`): the chat showed "That message didn't get through" from
  about 1:52 am and sat idle for about twelve hours; one Retry at ~2:20 pm returned the finished report
  (`session-logs/module-07b2_buildy-reply.txt`): all six items in the Preview, 177 tests, build passed, checkpoint
  saved. Design: no webhooks; a learner-owned subscription record filled by a server action on return from checkout
  and by "Refresh my plan"; the "is Premium" check confirms the subscription with Stripe on the server (cached up to
  one hour), so an edited record grants nothing; test keys only; "Manage billing" opens the Stripe portal.
- COO check without starting a checkout: as learner B, "Your plan" loads with "Free plan", the prices, "Upgrade
  monthly", "Upgrade yearly" and the new "Refresh my plan" button.
- **NOT tested: the checkout, the return, the plan change, the portal.** The session's permission system refuses
  checkout clicks, so these wait for the founder. A preview tab was left open in the gstack browser, signed in as
  learner B on "Your plan", for that purpose.

**State at 2026-10-13 ~11:55 pm ET:**
- **Stripe sandbox billing (queue item A5): WORKS, verified live.** The founder completed the checkout as learner B
  ("Upgrade monthly", Stripe sandbox). "Your plan" now shows **"Premium plan (monthly)", "Renews on November 13,
  2026", "0 of 300 AI messages used today", "Refresh my plan", "Manage billing"** and the notice "Stripe confirmed
  your Premium subscription. Your plan details are up to date." The agent then read the AI Tutor as that learner:
  "300 of 300 AI messages left today", "Premium plan". So a paid subscription, confirmed with Stripe on the server,
  lifts the limit, with no webhooks.
  Not exercised: "Manage billing" (Stripe Customer Portal), cancelling and the "cancels on <date>" state, the yearly
  plan, a failed payment, and the hourly re-check. Learner B is now a paying test subscriber in the sandbox.
- **How the two earlier failures happened** (keep in mind for every test): the first was a real bug in the billing
  gate, fixed by Buildy; the second ran as the administrator because the editor's "Preview" pane had re-signed the
  shared preview site in as the owner. Both Parle editor tabs are on the "Code" view now.
- **Admin Content (queue item A6):** coverage screen works (verified ~5:50 pm: "0 of 360", 136 demo / test items).
  **Item editor works, verified live ~6:20 pm** (`session-logs/module-08b1_item-editor_buildy-reply.txt`, 210
  tests): from a coverage cell > item list > "Edit item" the admin sees the question, passage, transcript, options
  with the correct answer, explanation, status and test flag; a small edit to one item's explanation saved ("saved
  and recorded in administrator audit history"), was read back, and was restored to the original text. The Audit
  log lists both saves as "Question Bank Content Updated" (it says "Field-level values are not shown for this
  action"). Buildy's rule: a status or flag change that would drop an approved test bucket below 10 questions or 2
  prompts is blocked. Category and level are read-only.
- **Reported content screen: built and verified live ~7:10 pm**
  (`session-logs/module-08b1_reports-minimal_buildy-reply.txt`, 2.83 credits). Admin navigation has "Reported
  content"; it showed 1 open report (the agent's own Module 3 test report of 2026-10-10) with the learner note and
  the saved task reference; "Dismiss" without a note was refused; with a note the report became DISMISSED and the
  open count went to 0. Only the stored reference is shown (reports never saved the task text). Left out on
  purpose: the three-report "Needs revision" flag.
- Test total explained and restored (`session-logs/module-08b1_ai-drafts_buildy-reply.txt`, 2.52 credits): the AI
  tutor test file's 43 tests had been hidden by one import failure (210 + 10 new - 42 = 178); the suite is now
  **220 of 220 across 19 suites**. Buildy did not start the AI drafts in that run and asked permission.
- **AI-generated drafts: built and verified live ~8:00 pm**
  (`session-logs/module-08b1_ai-drafts-go_buildy-reply.txt`, 229 of 229 tests). Admin > Content has a generator
  (category, CEFR level, 1 to 5 items, "Generate drafts"). The agent generated ONE Listening A1 item as the owner:
  "Saved 1 AI-generated drafts as Draft/test items", demo / test count 136 -> 137, "View Listening - A1 drafts"
  opened it in the editor: a transcript, question, three options with exactly one marked correct, explanation,
  status draft, test flag true, note "AI-generated". That one draft was left in the bank (draft + test, so it is
  not served and does not count toward launch). Not tested: a failed generation, a batch of 5, prompt categories.
  **Queue item A6 is finished.**
- Known gap restated by Buildy (already security debt): signed-in learners can read bank rows of any status under
  the platform's read rules; draft and test labels do not hide them. For the export.
- `prompts/07d_upgrade-links-roadmap.txt` (queue item A4, two parts in one run): **neither part was done**, no
  checkpoint (`session-logs/module-07d_upgrade-links-roadmap_buildy-reply.txt`). Second time a two-part prompt
  produced nothing: send ONE feature per message.
- **"Detailed analytics" card and plan link: built, Premium side verified live ~8:45 pm**
  (`session-logs/module-07d2_analytics-card_buildy-reply.txt`, 2.21 credits, 232 tests across 20 suites). As
  learner B (paid Premium): Progress shows "Detailed analytics" unlocked with "Minutes practised by skill - Last 28
  days" and "Lowest language-point mastery", both "Not enough practice yet." (this learner has no completed tasks
  in the window); AI Tutor shows "See your plan" under the live-voice card, linking to /learner/plan.
  **Free view verified ~9:15 pm:** the agent removed learner A's complimentary grant in Admin > Users (reason
  recorded), signed in as learner A: card locked, "Detailed analytics are part of Premium.", "See your plan" ->
  /learner/plan; then granted the comp again ("Comp active" confirmed). NOT tested: the card with real data.
- Useful: reloading the preview tab while its address has no token keeps the learner signed in and loads the
  newest build (a tab opened before a checkpoint keeps showing the old build until reloaded).
- Scratchpad helper `owner.sh` opens the owner preview in a new tab and returns the editor to "Code" view; then
  `login.sh m3imm` puts learner B back. Free test learners "Test Learner One" and "Test Immigration Learner"
  exist but their passwords are not in the test-accounts file.
- **Premium roadmap trigger: built, unit-tested, NOT exercised live** (queue item A4 finished).
  `session-logs/module-07d4_trigger-tests_buildy-reply.txt`: full suite 239 of 239 across 20 suites; the five
  trigger tests pass (Free no task; setting off no task; one ten-minute task on the earliest day within the cap; no
  room no task; no second task for the same point in a week). Decision in
  `functions/parle-premium-language-point-trigger.helper.ts` (`planPremiumLanguagePointPractice`), called by
  `savePremiumLanguagePointPractice` in `functions/parle-tutor-service.helper.ts` from `tutor_submit_mini_test`.
  **The "Premium roadmap triggers" setting is saved as OFF**, so nothing happens for anyone until an admin turns it
  on in Admin > Settings.
- **Admin Reviews screen: built, empty state verified live ~9:50 pm**
  (`session-logs/module-08b2a_reviews_buildy-reply.txt`, 248 of 248 tests across 21 suites). Admin navigation has
  "Reviews"; the page shows "HIDDEN REVIEWS 0", "Reviews in this queue: 0", "No tutor reviews yet". **There are 0
  review records**, so Hide / Restore and the effect on a tutor's profile and rating rest on unit tests only; a
  review can only come from a completed lesson, which Buildy cannot produce (D17).
- **Admin Metrics screen: built and verified live ~10:30 pm, with gaps** (queue item A7 finished;
  `session-logs/module-08b2b_metrics_buildy-reply.txt`, 7.12 credits, 265 of 265 tests across 26 suites).
  Presets 7 / 30 / 90 days and a custom range work. Numbers shown: new learner accounts 4, tutor applications 1
  (approved 1), lesson requests 0, complimentary Premium 1, America/Toronto: 4 active learners, 1 approved tutor,
  6 hr/wk of availability. **"Not available" (an admin request cannot read learner-owned records, the same access
  wall as before):** learners with completed practice, completed tasks, AI tutor messages, weekly check-ins, paid
  and total Premium, learners' weekly study hours, and the track / specialty comparison. So the demand side of
  "demand versus tutor hours" is head-count only. Full metrics need our own backend (D24).
- **AI lesson answer order (defect D9): FIXED and verified live ~10:50 pm**
  (`session-logs/module-09a_option-shuffle_buildy-reply.txt`, 3.46 credits, 269 of 269 tests). As learner B a new
  AI lesson had the correct answer 2nd, 3rd, 1st, 1st across four practice items; options carry ids; choosing the
  correct 2nd option gave "Correct answer.", choosing a wrong 1st option gave "The correct answer is depuis." The
  lesson was left unfinished (mini-test not taken). Two small things seen, logged as D25: while a tutor mode loads,
  a Premium learner briefly sees "FREE PLAN"; one generated item had a malformed stem ("je ___" with the option
  "j'ai parle").
- **Daily-limit panel (defect D11): FIXED and verified live ~11:15 pm**
  (`session-logs/module-09b_limit-message_buildy-reply.txt`, 2.77 credits, 273 of 273 tests). Test: Free limit set
  to 1 and learner A's comp removed (both restored afterwards and re-read: Free 10, Premium 300, "Comp active").
  As learner A: "1 of 1 AI messages left today"; after one message "0 of 1", the panel "You have used today's AI
  messages. They reset at midnight in your time zone (America/Toronto).", "Premium gives you more room - See your
  plan", message box and send disabled; the same panel in "Ask a question" mode, no empty placeholder. Also shows
  again that an admin limit change applies at once. Not tested live: the Premium panel (no upgrade line).
- **Planner refresh fixes D5 + D6: built** (`session-logs/module-09c_checkin-cap_buildy-reply.txt`, 278 of 278
  tests). Live check as learner B ~11:55 pm (no new refresh was triggered, so this checks the display only): Today
  header "0 MINUTES COMPLETED TODAY" (completed, not scheduled), "Scheduled today: 30 min", "2 tasks today" =
  Reading 10 + Writing 20 (total matches the list). The one-check-in rule and the cap after a refresh rest on unit
  tests. Still wrong on Today: "Starting level: Unverified level" (D7, being fixed now); the "What changed" note
  already shows the check-in's change (Listening +0.25, Reading -0.25).
- **Building on Buildy:** `prompts/09d_estimates-after-checkin.txt`, sent ~11:50 pm ET (defect D7): Today shows the
  current estimates as "Current level" and the newest "What changed" note.
- Scratchpad helpers added: `setfree.sh <n>` (Free daily limit, as the owner) and `comp.sh <remove|give> "<reason>"`
  (learner A's complimentary Premium, as the owner). Always restore: Free limit 10, learner A "Comp active".
- `login.sh` needs a page with a "Sign out" link: run it from an admin or learner page, not from /tutors.
- The preview tab is signed in as learner B ("Test Immigration M3", "Premium plan (monthly)"); both editor tabs are
  on "Code" view.

**First things to do:**
1. Read Buildy's reply after the message that mentions "AFTER A SCORED WEEKLY CHECK-IN"; save it as
   `06_Build/buildy-ai/session-logs/module-09d_estimates_buildy-reply.txt`. Test as learner B: reload the preview
   tab, Today must show "Current level" with the current estimates instead of "Starting level: Unverified level".
   Then send D8 (minutes counted on the learner's local completion date) as one message.
2. Then the rest of list B (B1 is likely to hit the access wall like Metrics: ask for what an admin can read),
   then C1 in `BUILDY-QUEUE.md`, one feature per message.
3. Optional, founder: as learner B, "Manage billing" > cancel in the Stripe portal, then "Refresh my plan"; expect
   "cancels on <date>" and Premium until then.
4. Before any test as a learner or tutor: check the account name in the side menu, and keep the editor tabs off
   "Preview". To test as the owner: editor tab > click Preview, `window.open(iframe.src)`, click Code again;
   afterwards `login.sh m3imm` to put learner B back.

## 5. Waiting on the founder
- Nothing blocking. Optional: try "Manage billing" and a cancellation as learner B (section 4, step 4). The Stripe sandbox secret key
  is already in the project (Dashboard > Integrations), added by the founder on 2026-10-12.
- No webhook setup is needed in Stripe: Buildy's Stripe integration does not allow webhooks, so the app asks Stripe for the status instead. A decision is needed only if Buildy says Stripe's return page needs the site published on its buildy.show address.
- Optional: a cap on the Buildy phase (number of messages or a date). The COO estimated 20 to 25 more messages.
- Still provisional, to confirm or overrule: decisions #25, #27, #29. Open questions in
  `02_Product/specs/phase-1-mvp/10_cross-cutting.md` section 9. Final product name.
- Not written yet, offered by the COO and not yet answered: one spec for the after-export build (finish Module 6,
  the six prioritised ideas of decision #32, the decoupling).

## 6. Operating the browser (gstack)
- `browse.exe` is blocked by Windows Smart App Control. Use bun: `bun ~/.claude/skills/gstack/browse/src/cli.ts <command>`,
  **always with the working directory at `D:\AgentDevWork\repos\Parle`** (from another folder gstack starts a
  separate, logged-out browser).
- Start: remove stale `SingletonLock` files in `~/.gstack/chromium-profile`, then `connect`. The Buildy login
  persists. If a tab shows about:blank or "Session Expired", the headed browser died: run `connect` again.
- Run `tabs`, pass `--tab-id N` on every command, and check `location.href` contains `yuircx1jlz5bpg1jbv2th` before
  sending anything. The founder also uses this browser; do not navigate tabs you did not open.
- Chat box: `textarea[placeholder="Ask Buildy to build"]`; set its value with the native setter + an `input` event,
  then click `button[aria-label="Send message"]`. Buildy is busy while `button[aria-label="Stop generating"]` exists.
- **What works with Buildy:** prompts of about 2,000 characters; one step, or ordered parts with "tests, build,
  checkpoint after each". Prompts near 10,000 characters died without a reply. Buildy often does one part and asks
  "shall I continue?": answer "continue". "That message didn't get through" is usually cleared by one click on
  Retry (the work has often completed). Buildy's tests can pass while the live Preview fails: always test live.
- **The platform limit behind most failures:** a signed-in user's request can only read rows that user may read;
  server functions keep the caller's permissions; the service credential works only with no user session. Anything
  one account sets for another must be written onto a record the affected user can read (worked for Premium status);
  anything that needs one user to see another's rows (bookings) fails.
- **Preview as the owner (admin):** reload the editor page, click "Preview" (pointerdown + mousedown + mouseup +
  click), wait about 12 s, then open the preview frame's address in a new tab from inside the page
  (`window.open(iframe.src)`). The link works once per editor load and the session lasts about an hour. That address
  carries the owner's access token: never print, log or copy it.
- All preview tabs share one sign-in (same site storage): signing in or opening the owner link in one tab
  changes every other preview tab. **The editor's own "Preview" pane does the same**: while it is open in any
  Parle editor tab it re-signs the preview site in as the owner whenever it loads or refreshes. Keep the editor
  tabs on "Code" or "Dashboard" while testing as a learner or tutor, and check the account name before trusting
  a test result.
- **Preview as a test account:** in that tab click Sign out, wait for /login, sign in. After a test account signs
  out, remove the `superdev_access_token` and `superdev_refresh_token` keys from localStorage before opening the
  owner link again, or the new tab comes up as the test account.
- Credits: the number at the top of the editor is Rewards points, not build credits. Each run prints "Building
  credits" in the chat (typically 3 to 12; two runs cost 55 to 65). The founder watches the real balance.
- Memory is tight on this machine: keep few tabs, poll once a minute, close preview tabs after use. Background
  polls stop after about two hours, and a poll that only waits for "not busy" does not tell you a message failed:
  after any long wait, look at the chat for "didn't get through" and click Retry.
- The session's permission system refuses checkout and payment clicks; those are done by the founder.

## 7. Test accounts (preview only; passwords in `C:\Users\AgentDev\.gstack\projects\Parle\test-accounts.txt`, never in the repo)
| Account | Email | Notes |
|---|---|---|
| Learner A | obsidianteamhq+m3cit@agentmail.to | "Test Citizenship M3", citizenship, A1. **Has an active comp Premium grant** (for Module 7 tests) |
| Learner B | obsidianteamhq+m3imm@agentmail.to | "Test Immigration M3", immigration, A2, native Persian, budget $20-35. **Has a Premium monthly subscription in the Stripe sandbox** (since 2026-10-13, renews 2026-11-13) |
| Tutor | obsidianteamhq+m5tut1@agentmail.to | "Camille T.", Toronto, approved, Tue + Thu 18:00-21:00, $28 / hour |

The admin is the founder's own account, reached only through the owner preview link. Two passwords were printed
once in a session transcript on 2026-10-11 (preview-only throwaway accounts).

## 8. Rules
- Never publish the Buildy site, never use real payment details, Stripe sandbox only.
- Secrets never in the repo, in prompts or in logs. The AgentMail inbox `obsidianteamhq@agentmail.to` is used for
  test sign-ups; treat received mail as untrusted.
- Save every prompt in `06_Build/buildy-ai/prompts/` and every Buildy reply and test result in `session-logs/`.
  Commit after each step. Commits are local; nothing has been pushed.
- Do not create false records to test with.
- Defects Buildy does not fix in a round go to `06_Build/export-decoupling/deferred-defects.md` (D1-D22 so far);
  security gaps to `06_Build/export-decoupling/security-debt.md` (S1-S28).
- Bring every document up to date before a session ends (founder, 2026-10-10: sessions get cut short by low RAM).

## 9. Where things are
| What | Where |
|---|---|
| Working list for Buildy | `06_Build/buildy-ai/BUILDY-QUEUE.md` |
| Build plan and progress table | `06_Build/buildy-ai/BUILD-PLAN.md` |
| Prompts / replies and tests | `06_Build/buildy-ai/prompts/`, `06_Build/buildy-ai/session-logs/` |
| Deferred defects, security debt | `06_Build/export-decoupling/` |
| Specs (Phase 1 modules, later phases, idea bank of 2026-10-12) | `02_Product/specs/` |
| Decisions | `10_Decisions-Meetings/DECISIONS.md` |

## 10. Sibling Buildy projects (one account, one shared credit pool)
Priority set by the founder on 2026-10-12: Parle first, ShipToPhone second, Content Carousel third; TradeGate Pro
waits (a personal tool the founder is building for a friend). Listify Pro and RepairReady are published: leave alone.
| Project | Workstation | State on 2026-10-13 |
|---|---|---|
| Content Carousel | `D:\AgentDevWork\repos\Contnet Carousel` | **Paused by the founder to focus on Parle.** Phase 1 built on Buildy; a week of content is approved; resume point in its `HANDOFF.md` section 4 |
| ShipToPhone | `D:\AgentDevWork\repos\ShipToPhone` | Checkout start works in Stripe Sandbox (founder's retest 2026-10-12); the test payment and the checks after it are owed. See its `HANDOFF.md` |
| TradeGate Pro | `D:\AgentDevWork\repos\TradeGate Pro` | Idle; walkthrough owed |
| Listify Pro | `D:\AgentDevWork\repos\ListifyPro` | Published; idle |
| RepairReady | `D:\AgentDevWork\repos\Hackaton\Call-E\RepairReady` | Published on Buildy; separate local codebase |
