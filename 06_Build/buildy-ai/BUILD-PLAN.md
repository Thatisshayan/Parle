# Parle Phase 1 on Buildy.ai - Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Buildy runs in one browser session, so tasks run sequentially in
> the main session (not subagents).

**Goal:** Build Parle Phase 1 (modules 1-8) on Buildy.ai, verified module by module against the spec's acceptance
checklists, ready to export.

**Architecture:** Buildy generates the code. We drive it with one context prompt, then one prompt per module that
contains the module spec verbatim. After each prompt the COO verifies the module in the gstack browser against its
acceptance checklist, sends fix prompts until every item passes, and logs the result. No module starts before the
previous one passes.

**Tech Stack:** Buildy.ai (stack recorded in Task 0), Stripe test mode (Checkout, Billing, Connect Express), an AI
provider for chat/TTS/STT/realtime voice, gstack browser for verification, AgentMail inbox for email verification.

**Spec:** `02_Product/specs/00_master-spec.md` and `02_Product/specs/phase-1-mvp/01..10`.

## Progress (updated 2026-10-11) - read `HANDOFF.md` at the repo root first
| Task | State |
|---|---|
| 0 Capability check | DONE (GO; decision #23) |
| 1 Module 1 Foundation | DONE with platform gaps (decisions #24, #26; S1-S5) |
| 2 Module 2 Onboarding + placement | ACCEPTED for demo (2026-10-08). One bank item found inconsistent on 2026-10-10 (r-a2-01), repair requested |
| 3 Module 3 Roadmap engine | ACCEPTED WITH DEFERRED DEFECTS 2026-10-11 (decision #30; D1-D8 in `../export-decoupling/deferred-defects.md`). Log: `session-logs/module-03.md` |
| 4 Module 4 AI tutor | ACCEPTED WITH DEFERRED DEFECTS 2026-10-12 (D9-D13). Built in small steps 04a + 04b after two lost runs. Log: `session-logs/module-04.md` |
| 5 Module 5 Tutor marketplace | Part A (tutor side) sent 2026-10-12, BUILDING. Log: `session-logs/module-05.md` |
| 6-9 | Not started |

Deviations from the plan as written, all decided and logged:
- No Google sign-up on Buildy (decision #24): "finish with Google sign-up" in Task 2 step 3 was done with email + password.
- No text-to-speech or speech-to-text on Buildy: listening is transcript-only and speech is never assessed, so the
  "mobile mic" steps (Review Focus 4) cannot run until an external provider exists (after export).
- Buildy splits large modules into slices and stops to ask. Tell it "one run, without pausing" in every prompt.
- The bare preview address returns 401 on data while the site is unpublished. Always test from the editor's Preview
  pane (see HANDOFF).
- Test accounts: credentials live in `C:\Users\AgentDev\.gstack\projects\Parle\test-accounts.txt`, never in the repo.

## Global Constraints
- Every screen works at 375px width, no horizontal scroll.
- All interface text through translation keys; English only at launch.
- Permissions, prices, limits, payouts enforced server-side.
- Times stored UTC, shown in viewer's time zone; money in USD cents.
- Every level estimate labelled "Estimate - not an official score".
- No immigration/legal advice from the AI; redirect to canada.ca and RCIC.
- Commission 20%, payout 72h after completion, cancellation window 24h, minimum lesson charge $8 (admin-editable).
- Free: 10 AI messages/day; Premium $14.99/mo or $119/yr: unlimited (fair use 300/day), live voice 60 min/month.
- Payments in Stripe **test mode only** until founder launch sign-off.
- Secrets never in the browser, never in prompts pasted to Buildy chat (use Buildy's secrets/env settings).

## Review Focus
1. **Daylight-saving and cross-time-zone slots** - a Toronto tutor's Tue 18:00 slot must show at the right hour to a
   Tehran or Paris learner before and after a DST change. Test owner: Task 6, step "time zone matrix".
2. **Same slot booked twice at the same moment** - second payer must get an automatic refund, never a double booking.
   Test owner: Task 6, step "double booking".
3. **Onboarding answers lost** - answers given before sign-up must survive Google sign-up, a page refresh, and closing
   the tab mid-flow. Test owner: Task 2, step "answer persistence".
4. **Microphone on iPhone Safari** - recording must work or fall back to typing; mic denied must never block the flow.
   Test owner: Task 2 (placement speaking) and Task 4 (AI tutor), step "mobile mic".
5. **Limit reset across local midnight** - a learner in UTC+3:30 hitting the 10-message limit must be reset at their
   own midnight, and the server must block message 11 even if the browser is tampered with. Test owner: Task 7,
   step "limit enforcement".

## How every module task works (same loop each time)
1. Open the Buildy project in gstack browser.
2. Send the module prompt: the header given in the task, then the full text of the module spec file pasted below it.
3. Wait for the build; read Buildy's summary.
4. Verify each acceptance checklist item from the spec in the Buildy preview (desktop and 375px), plus the task's
   extra Review Focus steps. Screenshot each pass/fail into `06_Build/buildy-ai/screenshots/module-0X/`.
5. For each failure send a fix prompt: "In module X, <item> fails: <observed>. Expected: <spec line>. Fix only this;
   do not change other modules." Re-verify.
6. Regression check: re-run the previous modules' smoke test (sign in as each test account, open main screens).
7. Write `06_Build/buildy-ai/session-logs/module-0X.md`: prompts sent (copy), results per checklist item, fixes, open
   issues, Buildy credits used.
8. Commit the workstation: `git add 06_Build && git commit -m "build: module X verified"`.
9. SUPERSEDED by decision #30 (2026-10-11): unfixed defects go to `../export-decoupling/deferred-defects.md` and the
   build moves on. Old rule, kept for the record: Degradation check (decision #21): if a fix breaks an earlier module twice, or a module needs more than 5 fix rounds,
   stop and report to the founder with the option to export after modules 1-4.

---

### Task 0: Buildy capability check and project setup

**Files:**
- Create: `06_Build/buildy-ai/session-logs/00_capability-check.md`
- Create: `06_Build/buildy-ai/prompts/00_project-context.md` (done)

**Interfaces:**
- Produces: a go / no-go decision and the recorded stack that later tasks and Phase 4 export rely on.

- [x] **Step 1:** `git init` the workstation, add a `.gitignore` (ignore `desktop.ini`, `*.env`, `screenshots/**/*.mp4`),
  commit "chore: workstation and Phase 1 specs".
- [x] **Step 2:** Open gstack browser, go to buildy.ai, read the pricing and docs pages; note plan limits and credits.
- [x] **Step 3:** Ask the founder to sign in or create the Buildy account (account owner's decision and payment).
- [x] **Step 4:** Create project "Parle". Send `prompts/00_project-context.md`.
- [x] **Step 5:** Record Buildy's answers and verify each capability, by docs or a throwaway test project:

| Capability | Pass condition |
|---|---|
| Code export | Full source downloadable (GitHub or ZIP) and runs outside Buildy |
| Stack | Named framework, database and auth we can host ourselves |
| Stripe Checkout + Billing | Supported with our own Stripe account |
| Stripe Connect split payouts | Connected accounts + delayed transfers possible |
| Private file uploads | ID documents private; video up to 200 MB |
| Server logic + scheduled jobs | Webhooks and timed jobs (payout release, reminders) |
| AI with own keys | Our own provider key, server-side |
| Text-to-speech / speech-to-text | Available |
| Real-time voice | Available or not (Module 4 has a "Coming soon" path) |
| Payout country list | Current Stripe Connect cross-border list recorded |

- [x] **Step 6:** Decision: if code export fails, STOP and report to founder with the fallback (Lovable or Claude
  Code build, `10_cross-cutting.md` section 8). Otherwise log "GO" with the stack.
- [x] **Step 7:** Commit `git commit -m "build: Buildy capability check"`.

### Task 1: Module 1 - Foundation

**Files:** Prompt = header below + `02_Product/specs/phase-1-mvp/01_foundation.md`. Log: `session-logs/module-01.md`.

**Interfaces:**
- Produces: user record with role, time_zone, native_language, explain_in_native; role-based shells; test accounts.

- [x] **Step 1: Send prompt**
```
Build MODULE 1 - FOUNDATION now, exactly as specified below. Do not build onboarding, roadmap, AI tutor,
marketplace, booking, subscriptions or admin features yet - only the empty navigation entries for them.
Create these test accounts: admin@parle.test (admin), and seed nothing else.
<paste 01_foundation.md here>
```
- [x] **Step 2:** Verify every acceptance item in `01_foundation.md`. Email verification and reset are checked by real
  delivery to the AgentMail inbox `obsidianteamhq@agentmail.to` (plus-addressing if supported, otherwise one account at a time).
- [x] **Step 3:** Create test accounts for later modules: 4 learners (immigration, citizenship, general, premium-to-be),
  3 tutors (Toronto, Paris, Dakar). Record credentials in Buildy only, never in the repo.
- [x] **Step 4:** Fix loop, log, commit "build: module 1 verified".

### Task 2: Module 2 - Onboarding + placement test

**Files:** Prompt = header + `02_onboarding-placement.md`. Log: `session-logs/module-02.md`.

**Interfaces:**
- Consumes: user, auth (Task 1).
- Produces: learner_profile, placement_result, question_item, prompt_item as in `09_data-model.md`.

- [x] **Step 1: Send prompt**
```
Build MODULE 2 - ONBOARDING + PLACEMENT TEST now, exactly as specified below. Use the data model names from the
second document. Seed the question bank with AI-generated items marked status "approved" for testing only: 10 per
auto-scored skill per level A1-B2, plus 2 writing and 2 speaking prompts per level (real launch items will be
reviewed later in the admin panel). Do not build the roadmap yet: after the results screen, show a placeholder
"Your roadmap is being prepared".
<paste 02_onboarding-placement.md>
<paste the Learner + Content sections of 09_data-model.md>
```
- [x] **Step 2:** Verify every acceptance item in `02_onboarding-placement.md`.
- [x] **Step 3: Answer persistence (Review Focus 3):** start onboarding, refresh at step 4, close the tab at step 6 and
  reopen, finish with Google sign-up. Expected: all answers present on the account.
- [x] **Step 4: Mobile mic (Review Focus 4):** run the speaking section on iPhone-size viewport in WebKit; deny mic once
  (expect "Not yet assessed"), allow once (expect recording + feedback < 20s).
- [x] **Step 5: Adaptivity:** take the test answering all correct, then all wrong; expected results differ by at least 2 levels.
- [x] **Step 6:** Fix loop, log, commit "build: module 2 verified".

### Task 3: Module 3 - Roadmap engine + Today's Plan

**Files:** Prompt = header + `03_roadmap-engine.md`. Log: `session-logs/module-03.md`.

**Interfaces:**
- Consumes: learner_profile, placement_result (Task 2).
- Produces: skill_estimate, roadmap, milestone, week_plan, task, checkin, topic_mastery (read by Tasks 4, 6, 7).

- [x] **Step 1: Send prompt**
```
Build MODULE 3 - ROADMAP ENGINE + TODAY'S PLAN now, exactly as specified below. The plan logic (allocation, floors,
boost, rollover, feasibility) must be plain deterministic code in its own module with unit tests - not AI. AI is only
used to generate the content of practice tasks. Tasks of type "AI lesson", "Speaking practice" and "Writing" should
open a placeholder screen for now (the AI tutor comes in module 4). "Tutor lesson" tasks show as "Suggested" only.
Free vs Premium differences: treat every learner as Free for now and keep the Premium triggers behind a flag.
<paste 03_roadmap-engine.md>
<paste the Learner section of 09_data-model.md>
```
- [x] **Step 2:** Verify every acceptance item in `03_roadmap-engine.md`. (done with deferred defects D1-D8)
- [x] **Step 3: Rule checks with fixed inputs** (ask Buildy to show the unit test results):

| Input | Expected |
|---|---|
| Citizenship, L=1.5 S=1.0, 5 days x 20 min | No reading/writing tasks; speaking share > listening share; weekly check-in 10 min on last day |
| Immigration, all skills 2.0 -> 3.5, 30 min/day, date in 8 weeks | Feasibility "Unlikely" with minutes/day needed and realistic date |
| General, budget none, 7 x 60 min | No tutor suggestion |
| Budget $20-35, 5 x 30 min (150 >= 90) | One 45-min "Suggested" tutor lesson in learner's tutor window |
| 2 days missed in a row | Rollover once, then dropped; no day above 120% of its minutes |
- [x] **Step 4:** Complete a weekly check-in as the immigration test learner; expect next week's allocation to change
  with a "What changed" note.
- [x] **Step 5:** Fix loop, log, commit "build: module 3 verified". (accepted with deferred defects)

### Task 4: Module 4 - AI tutor

**Files:** Prompt = header + `04_ai-tutor.md`. Log: `session-logs/module-04.md`.

**Interfaces:**
- Consumes: learner profile, skill_estimate, week_plan, task (Task 3).
- Produces: ai_session, ai_message, mistake, topic_mastery updates, usage_counter (read by Tasks 3, 6, 7).

- [ ] **Step 1: Send prompt**
```
Build MODULE 4 - AI TUTOR now, exactly as specified below. Connect the placeholder AI task screens from module 3 to
the real tutor modes. Use the internal AI service layer for chat, text-to-speech, speech-to-text and real-time voice.
API keys go in project secrets, not code. If real-time voice is not possible on this platform, build the button with
"Coming soon" for Premium as the spec says and tell me. Enforce the Free limit of 10 learner messages per day on the
server (Premium enforcement comes in module 7; keep it behind the same limits service).
<paste 04_ai-tutor.md>
<paste the AI tutor section of 09_data-model.md>
```
- [ ] **Step 2:** Verify every acceptance item in `04_ai-tutor.md`.
- [ ] **Step 3: Level difference:** ask "When do I use passé composé vs imparfait?" as the A2 citizenship learner and as
  a B2 learner; save both replies to the log; they must differ clearly in language level.
- [ ] **Step 4: Guardrail:** ask "How many CRS points do I get for NCLC 7?"; expected redirect to canada.ca/RCIC, then an
  offer to practise vocabulary.
- [ ] **Step 5: Mobile mic (Review Focus 4)** for recorded answers on iPhone-size WebKit.
- [ ] **Step 6:** Mistakes from a writing correction appear in the mistake log and affect topic_mastery.
- [ ] **Step 7:** Fix loop, log, commit "build: module 4 verified".
- [ ] **Step 8: Degradation checkpoint (decision #21):** report to founder: modules 1-4 status, Buildy stability, credits
  used. Founder decides: continue to module 5 on Buildy, or export now.

### Task 5: Module 5 - Tutor marketplace, vetting, matching

**Files:** Prompt = header + `05_tutor-marketplace.md`. Log: `session-logs/module-05.md`.

**Interfaces:**
- Consumes: user (tutor role), learner_profile (Task 2), skill_estimate (Task 3).
- Produces: tutor_profile, tutor_document, availability_rule, availability_exception, review (read by Tasks 6, 8).

- [ ] **Step 1: Send prompt**
```
Build MODULE 5 - TUTOR MARKETPLACE, VETTING AND MATCHING now, exactly as specified below. Include a minimal admin
screen for approving applications (the full admin panel comes in module 8). Stripe Connect onboarding (application
step 9) is only a placeholder button for now - payments come in module 6. Check the tutor's country against an
editable list of supported payout countries; unsupported countries join a waitlist.
<paste 05_tutor-marketplace.md>
<paste the Tutors and marketplace section of 09_data-model.md>
```
- [ ] **Step 2:** Verify every acceptance item in `05_tutor-marketplace.md`.
- [ ] **Step 3:** Apply as the 3 test tutors with different specialties, prices, languages; approve 2, send 1 "needs
  changes"; check emails arrive.
- [ ] **Step 4: Match score check:** as the immigration learner (budget $20-35, native Persian), the TEF-specialist tutor
  who speaks Persian and is within budget ranks first; card shows the top reason.
- [ ] **Step 5:** Open an unapproved tutor's profile URL directly while signed in as a learner; expected not found.
- [ ] **Step 6:** Fix loop, log, commit "build: module 5 verified".

### Task 6: Module 6 - Booking, lessons, payments

**Files:** Prompt = header + `06_booking-payments.md`. Log: `session-logs/module-06.md`.

**Interfaces:**
- Consumes: tutor_profile, availability (Task 5), week_plan/task (Task 3), mistake log (Task 4).
- Produces: booking, lesson_brief, lesson_notes, payment, payout, refund (read by Tasks 3, 8).

- [ ] **Step 1: Send prompt**
```
Build MODULE 6 - BOOKING, LESSONS AND PAYMENTS now, exactly as specified below, using Stripe in TEST MODE only with
Stripe Connect Express. Payment and booking state must change only from verified Stripe webhooks, with a
reconciliation job every 10 minutes. Replace the Stripe placeholder from module 5 with real Connect onboarding.
Lesson notes must feed the roadmap engine from module 3 as described.
<paste 06_booking-payments.md>
<paste the Bookings and money section of 09_data-model.md>
<paste section 6b "Failure handling" of 10_cross-cutting.md>
```
- [ ] **Step 2:** Verify every acceptance item in `06_booking-payments.md`.
- [ ] **Step 3: Time zone matrix (Review Focus 1):** Toronto tutor sets Tue 18:00-21:00. Check slot times shown to
  learners set to Asia/Tehran, Europe/Paris, Asia/Kolkata, for a Tuesday before and after the North American DST
  change (2026-11-01). Expected: correct local times on both sides of the change.
- [ ] **Step 4: Double booking (Review Focus 2):** two learners in two browser sessions pay for the same slot at the same
  time; expected one confirmed booking, the other refunded automatically with alternative slots emailed.
- [ ] **Step 5:** Run every cancellation row from the spec table in Stripe test mode; record refund and payout results.
- [ ] **Step 6:** Lesson brief visible 24h before (use a booking 23h ahead); lesson notes change next week's plan.
- [ ] **Step 7:** Fix loop, log, commit "build: module 6 verified".

### Task 7: Module 7 - Subscriptions and limits

**Files:** Prompt = header + `07_subscriptions.md`. Log: `session-logs/module-07.md`.

**Interfaces:**
- Consumes: limits service and usage_counter (Task 4), Premium flags (Task 3).
- Produces: subscription; plan-aware limits used everywhere.

- [ ] **Step 1: Send prompt**
```
Build MODULE 7 - SUBSCRIPTIONS AND LIMITS now, exactly as specified below, using Stripe Billing in TEST MODE and the
Stripe Customer Portal. Turn on the Premium roadmap triggers from module 3 for Premium learners and connect live
voice minutes from module 4 to the plan. Limits must be read from settings (editable in module 8) and enforced on
the server.
<paste 07_subscriptions.md>
```
- [ ] **Step 2:** Verify every acceptance item in `07_subscriptions.md`.
- [ ] **Step 3: Limit enforcement (Review Focus 5):** learner time zone Asia/Tehran; send 10 messages, then send an 11th
  directly to the server endpoint (bypassing the UI); expected rejection. Check the reset happens at the learner's
  local midnight, not UTC.
- [ ] **Step 4:** Upgrade the 4th test learner to Premium monthly; unlimited messages, live voice minutes shown;
  cancel in the Portal; Premium stays until period end.
- [ ] **Step 5:** Fix loop, log, commit "build: module 7 verified".

### Task 8: Module 8 - Admin panel

**Files:** Prompt = header + `08_admin.md`. Log: `session-logs/module-08.md`.

**Interfaces:**
- Consumes: everything above.
- Produces: admin_audit_log, app_setting; the full admin surface.

- [ ] **Step 1: Send prompt**
```
Build MODULE 8 - ADMIN PANEL now, exactly as specified below. Replace the minimal approval screen from module 5 with
the full Applications section. All settings listed must be read live by the app (no redeploy needed) and every
money, status or content change must be written to the audit log.
<paste 08_admin.md>
<paste the Settings section of 09_data-model.md>
```
- [ ] **Step 2:** Verify every acceptance item in `08_admin.md`.
- [ ] **Step 3:** Change commission to 25%; book a new lesson (25% applied) and confirm an older booking kept 20%.
- [ ] **Step 4:** Fix loop, log, commit "build: module 8 verified".

### Task 9: Phase 1 full regression and export readiness

**Files:** Create `06_Build/buildy-ai/session-logs/phase-1-signoff.md`, `06_Build/export-decoupling/export-readiness.md`.

- [ ] **Step 1:** End-to-end journey per track learner: landing -> onboarding -> placement -> roadmap -> AI lesson ->
  book tutor -> lesson completed with notes -> roadmap updated -> check-in.
- [ ] **Step 2:** Tutor journey: apply -> approved -> Stripe Connect -> availability -> lesson -> notes -> payout after 72h
  (test clock).
- [ ] **Step 3:** Cross-cutting checks from `10_cross-cutting.md`: emails list, analytics events, failure handling
  rows (simulate AI provider failure via a bad key in a test copy), 375px on every screen, keyboard navigation.
- [ ] **Step 4:** Export the code to `07_Engineering/` (do not deploy); record stack, environment variables needed,
  third-party accounts, and anything Buildy-proprietary in `export-readiness.md`.
- [ ] **Step 5:** Report to founder: what passed, what's open, launch blockers (open questions 1-10, calibration with
  tutors, 360-item question bank review), and a recommendation.
- [ ] **Step 6:** Commit "build: Phase 1 sign-off report".
