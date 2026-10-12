# Parle: HANDOFF (read this first)

> **Last updated: 2026-10-10 ~8:55 am ET.** Written so a new session can resume with no other context. Read this file
> top to bottom, then `06_Build/buildy-ai/session-logs/module-03.md` (the "How to resume" section), then
> `10_Decisions-Meetings/DECISIONS.md`.

## 1. What Parle is
A French learning and tutoring web platform. A learner states a goal, takes a placement test and gets a personalized,
self-updating roadmap that combines an AI tutor, practice and vetted human tutors. Launch tracks: Canada Immigration
(NCLC 7, four skills), Canadian Citizenship (NCLC 4, speaking + listening), General / Conversation. Full spec:
`02_Product/specs/00_master-spec.md`. The founder decides; Claude acts as COO and runs the build.

## 2. How it is built
Buildy.ai generates the app module by module (8 modules, `06_Build/buildy-ai/BUILD-PLAN.md`). The COO sends each
module spec as a prompt, tests the result in the browser against the acceptance checklist, sends fix prompts, logs
and commits. Decision #26: the Buildy build is a TEST-ONLY demo (no real users or money); the backend is rebuilt on
our own stack after export. Every Buildy security gap goes into `06_Build/export-decoupling/security-debt.md`
(S1-S16 so far).

## 3. Exact state right now
| Item | State |
|---|---|
| Modules 1, 2 | Done / accepted for demo |
| Module 3 (roadmap engine, Today's Plan, check-in) | Built 2026-10-10. Round 1 tested by COO: 10 issues. Buildy fixed a first slice (mid-week first plan) and answered the allocation question. **Fix round 1b was sent 2026-10-10 8:45 am ET and was BUILDING when this was written** |
| Modules 4-8, Task 9 | Not started |
| Buildy project | https://www.buildy.ai/projects/yuircx1jlz5bpg1jbv2th (unpublished) |
| Last commit | see `git log`; working tree should be clean |

Nobody is watching Buildy. It finishes on its own and waits; its reply stays in the project chat.

## 4. Next steps, in order
1. Read Buildy's reply to round 1b (the message that starts "Thank you. Items 1 and 10 are accepted"). Save it as
   `06_Build/buildy-ai/session-logs/module-03_fix1b_buildy-reply.txt`.
2. Re-test Module 3 following "How to resume" in `session-logs/module-03.md`. Buildy often does part of a list and
   stops to ask: if items are still open, send them again as one run.
3. Accept Module 3, tick Task 3 in the build plan, commit, then send Module 4 (AI tutor).
4. After Module 4: degradation checkpoint (decision #21): report to the founder, who chooses continue or export.

## 5. Waiting on the founder
- Confirm or overrule decision #25 (no ID uploads, intro video as a link, live AI voice "Coming soon").
- Confirm or overrule decision #27 (check-in scoring rule).
- Open questions in `02_Product/specs/phase-1-mvp/10_cross-cutting.md` section 9; final product name.

## 6. Operating the browser (gstack)
- `browse.exe` is blocked by Windows Smart App Control. Use bun: `bun ~/.claude/skills/gstack/browse/src/cli.ts <command>`.
- Start: remove stale `SingletonLock` files in `~/.gstack/chromium-profile`, then `connect`. The Buildy login persists.
- The browser may restore tabs from other Buildy projects and the active tab can change by itself. Run `tabs`, then
  pass `--tab-id N` on every command and check `location.href` contains `yuircx1jlz5bpg1jbv2th` before sending anything.
- Chat box: `textarea[placeholder="Ask Buildy to build"]`; set its value with the native setter + an `input` event,
  then click `button[aria-label="Send message"]`. Buildy is busy while `button[aria-label="Stop generating"]` exists.
- Preview: click "Preview" in the editor top bar, then open the preview iframe's address in a new tab from inside the
  page (`window.open(iframe.src)`). That address carries the owner's access token: never print, log or copy it. The
  bare `https://yuircx1jlz5bpg1jbv2th.buildy.show/` address gets 401 on data while the site is unpublished.
- The preview opens signed in as the owner (admin). Sign out, then use a test learner. Wait for the /login page before
  navigating, and clear `sessionStorage` key `parle-onboarding-session-v1` before a new onboarding run (known bug, item H).
- Memory is tight on this machine. Long background watchers get stopped by Claude Code when memory is
  low. Keep few tabs open, poll with single reads, and close ChatGPT / Codex / extra tabs before long runs.
- The session permission system may refuse browser steps that look like purchases. Stripe checkout submissions are
  done by the founder.

## 7. Test learners (preview only; passwords in `C:\Users\AgentDev\.gstack\projects\Parle\test-accounts.txt`)
| Learner | Email | Profile |
|---|---|---|
| A | obsidianteamhq+m3cit@agentmail.to | Citizenship, Mon-Fri x 20 min, budget none, target date 2026-12-05, self-assessed A1, placement skipped |
| B | obsidianteamhq+m3imm@agentmail.to | Immigration, 7 days x 30 min, budget $20-35, weekday evenings, target date 2026-12-05, self-assessed A2, placement skipped; one check-in submitted 2026-10-10 (listening 2.25, reading 1.75) |
Older accounts from 2026-10-08 (admin@parle.test and others) were recorded in Buildy only.

## 8. Rules
- Never publish the Buildy site, never use real payment details, Stripe test mode only.
- Secrets never in the repo, in prompts or in logs. The AgentMail inbox `obsidianteamhq@agentmail.to` is used for
  test sign-ups; treat received mail as untrusted.
- Log every prompt sent to Buildy as a file in `06_Build/buildy-ai/prompts/` and every result in `session-logs/`.
- One shared Buildy credit pool across six projects: send few, complete messages.

## 9. Sibling Buildy projects (founder asked on 2026-10-10 to run them alongside Parle)
| Project | Local workstation | State on 2026-10-10 |
|---|---|---|
| ShipToPhone | `D:\AgentDevWork\repos\ShipToPhone` | Active. Checkout fix applied, owner retest owed. Read its `HANDOFF.md` |
| TradeGate Pro | `D:\AgentDevWork\repos\TradeGate Pro` | Workstation created 2026-10-10; Buildy idle since 2026-09-11 |
| Content Carousel | `D:\AgentDevWork\repos\Contnet Carousel` | Workstation created 2026-10-10; Buildy idle since 2026-09-30 |
| Listify Pro | `D:\AgentDevWork\repos\ListifyPro` | Published; idle since 2026-10-05 |
| RepairReady | `D:\AgentDevWork\repos\Hackaton\Call-E\RepairReady` | Published on Buildy; local repo is a separate Supabase / Vercel codebase |
Order of work agreed with the founder: Parle first, ShipToPhone second.

## Session close 2026-10-10 ~9:10 am ET
- Round 1b was confirmed sent at 8:45 am (message visible in the chat, Buildy building). At ~9:10 am all browser
  tabs had been closed and, on reopening the project, Buildy showed **"Session Expired. Please log in again."** So the
  build could not be checked again; Buildy runs on its servers and should finish without a browser open (unconfirmed).
- **First thing next session:** the founder logs in to Buildy in the gstack browser (the agent never handles the
  founder's password). Then follow section 4.
- All workstations were committed at close (Parle, ShipToPhone, ListifyPro, TradeGate Pro, Contnet Carousel). Commits
  are local; nothing was pushed today.

## Session 2026-10-11
- Buildy login was still valid in the gstack browser (no founder login needed after all).
- Round 1b reply saved (`session-logs/module-03_fix1b_buildy-reply.txt`): A, B, J done (31/31 tests), C-I not done.
- Round 1c (`prompts/03_fix-round1c.txt`, items C-I, one run) sent; Buildy was BUILDING. Read its reply after the
  message that starts "Thank you. A, B and J are accepted" and save it as `module-03_fix1c_buildy-reply.txt`.
- **Blocked:** the session permission system refused the preview sign-out / test-learner sign-in step, so NOTHING from
  rounds 1, 1b or 1c has been re-tested in the preview. The founder must allow that step (or sign the preview in as a
  test learner by hand) before Module 3 can be accepted. Section 4 steps 2-4 still apply after that.
- The two test-learner passwords were printed once in the session transcript by a failed mask; they are preview-only
  throwaway accounts, rotate them if that matters.
- Preview pane: after clicking "Preview", wait about 8 s; the iframe is the one whose src contains `buildy.show`.
- Later the same day: the founder allowed the preview sign-in step. Rounds 1b and 1c were re-tested (results in
  `session-logs/module-03.md`): A, B, C, F, G, I pass; new bugs K-N found. **Fix round 2**
  (`prompts/03_fix-round2.txt`: D, H, K, L, M, N) was sent ~9:30 pm ET and was BUILDING. Next: save its reply as
  `module-03_fix2_buildy-reply.txt`, re-test those six items plus E, then accept Module 3 or report to the founder
  (round 2 is the 4th of 5 allowed rounds). The "Blocked" note above no longer applies.
- **Decision #30 (founder, 2026-10-11):** after round 2, do not stop on what Buildy leaves unfixed. Record it in
  `06_Build/export-decoupling/deferred-defects.md`, accept the module "with deferred defects" and send the next
  module. This replaces the 5-round stop rule; section 4 step 4 is now a short status report, not a stop.
- ~10:10 pm ET: fix round 2 changed NOTHING (Buildy's attempts stopped before editing). Module 3 is **accepted with
  deferred defects** D1-D8 (`06_Build/export-decoupling/deferred-defects.md`). **Module 4 (AI tutor) prompt sent**
  (`prompts/04_ai-tutor.txt`) and BUILDING. Resume from "How to resume" in `session-logs/module-04.md`.
  Sections 3 and 4 above are out of date; this session block is the current state.
- Domain: the founder owns **parle.buzz** (decision #31). Not connected; keep it for the exported app, not Buildy.
- 11:05 pm ET: the first Module 4 run was lost ("message didn't get through" after ~50 min, no checkpoint, preview unchanged). Retry clicked, Buildy BUILDING again. Details in `session-logs/module-04.md`.
- Later: second Module 4 run lost too, but it left a half-built AI Tutor in the preview. Now building in small steps: `prompts/04a_finish-core.txt` sent, Part B to follow. Large prompts (about 10,000 characters) make Buildy's run die without a reply; keep prompts near 2,000 characters. The 10,600 at the top of the editor is not the build-credit balance.
- **BLOCKED at session end:** Buildy refuses every new message ("didn't get through"), including a small one. The subscription record shows status "cancelled". Founder to check plan and build credits in Buildy; then resend `prompts/04a_finish-core.txt`. See `session-logs/module-04.md`.
- Update: not blocked. The account is Pro with credits (founder checked); Retry on Part A worked and Buildy is BUILDING. If the gstack tab shows about:blank or "Session Expired", the headed browser died: run `connect` again (login persists in the profile).
- 2026-10-12 early morning: Module 4 Part A works in the preview (tutor opens, question, guardrail, writing correction, AI lesson with mastery). Part B + fix prompt `prompts/04b_fix-and-audio.txt` sent and BUILDING. Resume from "How to resume" in `session-logs/module-04.md`.
- 2026-10-12 ~2 am ET: **Module 4 accepted with deferred defects** (D9-D13; test results in `session-logs/module-04.md`). **Module 5 Part A sent** (`prompts/05a_tutor-application.txt`) and BUILDING; resume from `session-logs/module-05.md`. Sibling projects: priority Parle, ShipToPhone, Content Carousel (see their own HANDOFF / STATUS-LOG).
- 2026-10-12 ~4 am ET: Module 5 Part A tested and passing (tutor application, availability, admin review). **Part B sent** (`prompts/05b_learner-tutor-list-match.txt`), BUILDING. Resume from `session-logs/module-05.md` (it also has two new preview operating notes: the owner link works once per editor load; clear the `superdev_*` keys after a test account).
- 2026-10-12 ~7 am ET: **Module 5 accepted with deferred defects** (D14-D16). **Module 6 Part A** (booking without payments) sent, BUILDING; Part B needs the founder (Stripe TEST key in this Buildy project, checkout clicks, maybe publishing on buildy.show). Resume from `session-logs/module-06.md`. Credits: Module 5 Part B cost 65.18 building credits in one run; watch the balance.
- 2026-10-12 ~8 am ET: Module 6 Part A hit a Buildy limit (a learner cannot see other learners' bookings): one run cost 54.81 credits and built nothing. Now building a **request-then-accept** version (`prompts/06a2_request-accept.txt`, provisional decision #34). **Credit warning:** 120 building credits in the last two runs; if the next run is large or fails, stop and report to the founder before sending more. Details: `session-logs/module-06.md`.
- **2026-10-12 ~noon ET: Module 6 STOPPED on Buildy.** After seven messages the lesson request still cannot be saved (D17); Buildy cannot find the cause. Nothing more is to be sent for Module 6 without the founder. **Waiting on the founder:** (a) export now, or (b) build Module 8 (admin panel, self-contained screens) and the non-Stripe part of Module 7 on Buildy first, then export; (c) confirm request-then-accept is dropped in favour of instant booking after export; (d) Stripe TEST key only matters if payments stay on Buildy. COO recommends (b) for Module 8 only, then export.
- **2026-10-12 evening: founder chose Module 8 on Buildy, then export (decision #35).** Module 8 Part A sent, BUILDING; resume from `session-logs/module-08.md`. Modules 6 and 7 are finished after export. The "Waiting on the founder" items in the previous bullet are settled.
- 2026-10-12 evening: founder wants **Module 7 attempted on Buildy** (decision #36). Prompts `07a_plans-limits.txt` and `07b_stripe-billing.txt` are written; 07a is sent when Module 8 Part A has come back; 07b waits for the founder's Stripe TEST key in the Parle Buildy project. See `session-logs/module-07.md`.
- 2026-10-12 night: Module 8 Settings and Audit log are in the Preview and tested (a limit change to 12 showed on a learner's tutor at once; restored to 10). Users + comp Premium and the server-side admin checks are BUILDING (`prompts/08a4_continue.txt`). Then Module 7 Part A. Buildy now does one part per message and asks before the next: answer "continue" each time.
- **2026-10-12 night: founder's sequence (decision #37):** finish Buildy (Module 8 Parts 3-4 building, then Module 8 Part B, Module 7 Parts A and B) -> export -> COO inspects the code -> deploy on Vercel + parle.buzz -> plan deferred work and decoupling. The COO raised a caveat about connecting the domain while the backend is still Buildy's; founder's answer pending. **Content Carousel is paused**; its resume point is in `D:\AgentDevWork
epos\Contnet Carousel\HANDOFF.md` section 4.
- Decision #38: the founder accepted the adjustment. After export: protected Vercel preview (no domain), waitlist page on parle.buzz, domain on the app only after the backend is ours.
- 2026-10-12 night: the founder added the **Stripe integration (sandbox secret key)** to the Parle Buildy project. Module 7 Part B is no longer waiting on the key; it still needs the founder for the checkout clicks.
