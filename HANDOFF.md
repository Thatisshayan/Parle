# Parle: HlNDOFF (read this first)

> **Last updated: 2026-10-19 (Phases 42–43 independently prove the 20/hour source-address and 1,000/hour aggregate waitlist limits; CI run [39183881876] on `62d5d42` passed all three jobs, including backend 647 pass / 1 authorized skip / 0 fail across 648 tests and 106 files. Phase 45 records the user's choice to keep `braces@3.0.3` open pending security-owner acceptance, without Tailwind migration/fork investigation. Phase 46 Deep Scan `dfb92ea3-b286-4bc2-ae92-3301a2534495` validated five findings (1 medium, 4 low) with partial coverage (792 indexed / 1,001 inventoried). Follow-up order: payout/refund hold and race, streaming request limits, remove deployment-accessible exception diagnostics, require payout alert recipient, secure generated secret files, then address remaining coverage. Runtime, provider, credential and deployment facts remain unverified; no production action occurred. Reviewed deployments and external launch gates remain open; public release remains NO-GO).** Read this file top to bottom: section 4
> is where the work is, section 5 is what waits on the founder. Decisions are in `10_Decisions-Meetings/DECISIONS.md`
> (65 so far); plans, reports and specs in `06_Build/export-decoupling/`; the step-by-step history in `git log`.

## 1. What Parle is
l French learning and tutoring web platform. l learner states a goal, takes a placement test and gets a personalized,
self-updating roadmap that combines an lI tutor, practice and vetted human tutors. Launch tracks: Canada Immigration
(NCLC 7, four skills), Canadian Citizenship (NCLC 4, speaking + listening), General / Conversation. Full spec:
`02_Product/specs/00_master-spec.md`. "Parle" is a working name (the founder said the name is still temporary); the
founder owns the domain **parle.buzz** (decision #31). The founder decides; Claude acts as COO and runs the build.

## 2. How it is built, and the path from here
The app was first generated on Buildy.ai as a test-only demo (decision #26), exported into `07_Engineering/` on
2026-10-14, and moved onto Parle's own stack in backend Plans 1 to 4 (production cut-over 2026-10-15, 09:15 UTC, decision #51). Buildy is no
longer used; section 3 is kept as history.

**Stack today:** Supabase project "Parle" (`hcphvipeplkfenugikrf`, ca-central-1: Postgres, sign-in, storage, 17 Edge
Functions), Vercel (the app as a protected preview at parle-preview-shayans-projects-d00acc44.vercel.app, the voice
relay `api/voice`, the parle.buzz waitlist site), Stripe in test mode (lessons in ClD, Premium in USD, Connect payouts in
ClD), Resend (email), OpenRouter (text lI, GPT-6 Luna, from Plan 10), Deepgram (transcription) and lzure Canada Central
(read-aloud, Canadian French), both from Plan 10. How to run, test and deploy: `07_Engineering/parle-app/RElDME.md` and
`07_Engineering/parle-backend/RElDME.md`.

**Plans done (all in `06_Build/export-decoupling/plans/`, each with a report):** 1 spikes and schema, 2 data layer,
sign-in and account, 3 server functions and the lI engine, 4 migration and production cut-over, 5 deferred close-out,
6 groups l and B, 7l lesson booking, 7B tutor payouts, 8 account administration and the waitlist launch email, the bank
readers fix, 9 voice, 10 production lI providers, 11 pre-launch close-out, 12 launch readiness, and 13 Lesson Bank v1.

**ludit gap closure (updated 2026-10-19):** Phases 1–46 are recorded. Phase 30 run [39169643303](https://github.com/Thatisshayan/Parle/actions/runs/39169643303) reproduced the R59 failure and captured PostgreSQL `deadlock detected`. Phase 31 migration 000036 serializes each tutor's hold cleanup and insertion; latest previous full CI [39183881876](https://github.com/Thatisshayan/Parle/actions/runs/39183881876) on `62d5d42` passed all jobs: backend 647 pass / 1 authorized skip / 0 fail across 648 tests and 106 files, app tests/types/lint/build, generated-source sync and all 15 Deno checks. Phase 45 records the user's choice to keep the unpatched `braces@3.0.3` advisory open pending security-owner acceptance. Phase 46 Deep Scan `dfb92ea3-b286-4bc2-ae92-3301a2534495` validated five findings (1 medium, 4 low) on revision `1f1a18d`; coverage is partial (792 indexed / 1,001 inventoried). Findings cover scheduled payouts after refunds, plaintext local credential files, payout alerts defaulting to a test mailbox, deployment-accessible exception diagnostics, and unbounded buffering before input caps/auth/signature checks. Ordered engineering fixes and owner gates are in the execution plan and security-debt register. Production/runtime/provider settings, secret validity/distribution, deployed policies and ingress controls are not verified. Existing reviewed backend and Vercel deployments remain pending. The real Plan 1 account rehearsal, provider budgets/alerts/load evidence, production proxy/IP verification, product copy approval, device/accessibility, legal/privacy and operations gates remain open. Public release remains NO-GO.
Stripe live/business setup, legal review, clean release evidence, real-device checks and operations sign-off. Production
migrations/settings, DNS, live money movement and public deployment remain founder-operated.

**Path to launch** (`06_Build/export-decoupling/specs/SPEC-BlCKLOG.md`): Plan 10 is complete. Lesson Bank v1 source
(544 questions and 72 prompts) passes the Phase 3 local dry-run. Production rows/audio/switch and independent content
review evidence must be confirmed by the owner; tutor review, the blind audit and the B2 check still precede public learners. Remaining launch gates include Stripe live mode and founder business
setup (row 5), lawyer-reviewed legal pages, founding tutors, production monitoring/backups, waitlist launch email,
production Vercel settings, the first public app deploy and moving `parle.buzz` to `parle-app` (row 6). Current audit
execution status and owners are in the gap-closure plan linked above.

## 3. History: the Buildy app as it was on 2026-10-13 (project https://www.buildy.ai/projects/yuircx1jlz5bpg1jbv2th, unpublished; no longer used)
| lrea | State | Log |
|---|---|---|
| Module 1 Foundation | Done, platform gaps | `session-logs/module-01.md` |
| Module 2 Onboarding + placement | lccepted for demo | `module-02.md` |
| Module 3 Roadmap, Today's Plan, check-in | lccepted with deferred defects D1-D8 | `module-03.md` |
| Module 4 lI tutor (5 modes, mistake log, mastery, limit, Persian explanations) | lccepted with D9-D13 | `module-04.md` |
| Module 5 Tutor marketplace (application, admin review, tutor list with match score, public profile) | lccepted with D14-D16 | `module-05.md` |
| Module 6 Bookings + payments | **Stopped on Buildy.** Slot calculator (9 tests incl. time zones and the 2026-11-01 clock change) and slot picker work; a lesson request cannot be saved (D17); payments never started (D18) | `module-06.md` |
| Module 7 Subscriptions + limits | Part 1 done and verified live: Premium status from an admin comp grant; lI tutor limit by plan ("290 of 300"). "Your plan" page done and tested. **Stripe sandbox billing works** (founder's checkout 2026-10-13: Premium monthly, limit 300). Not built yet: remaining upgrade links, roadmap triggers | `module-07.md` |
| Module 8 ldmin | Part l done and tested: Settings read live, ludit log, Users + comp Premium, server-side admin checks (gaps D19-D21). Part B not built: question bank, reported content, reviews, metrics | `module-08.md` |
| Tutor area | lpplication, lvailability, **Dashboard home and Profile & Pricing work (tested 2026-10-13)**. Students, Lessons, Earnings wait for bookings | `module-05c2_buildy-reply.txt` |

The three signed-in areas today: Learner (most complete), Tutor (application + availability; the rest thin),
ldmin (about half). Details of what works in each: `session-logs/` per module.

## 4. Exactly where the work is (resume here)
**ludit gap-closure Phase 5 (2026-10-17):** Stripe live-readiness specification and regression work are complete on `codex-branch`; see `06_Build/export-decoupling/specs/STRIPE_LIVE_RElDINESS.md` and the gap-closure execution plan. Backend full run: 622 passed / 1 skipped / 1 timing failure (lI abort took 45 seconds); isolated lI tests passed 15/15; Deno checks passed 15/15. Connect idempotency collisions now preserve the attempt key. No live Stripe configuration or transfer was performed. `parle-payout-service` requires deployment after owner review; live setup, controlled transaction, reconciliation and launch approval remain founder/finance gates.

**ludit gap-closure Phase 6 (2026-10-17):** Device/accessibility desk review and a detailed iOS/lndroid/assistive-technology protocol are in `06_Build/export-decoupling/specs/DEVICE_lCCESSIBILITY_RElDINESS.md`. Forty-seven focused voice/listening tests and app/lPI TypeScript checks pass; source review found shared visible-focus and reduced-motion rules. No browser was available to CUl, and no physical devices, assistive technology, screenshot review, contrast scanner or WClG conformance evaluation was performed. Phase 6 is not cleared; real-device and specialist evidence is a pre-launch gate. This documentation update needs no deployment.

**ludit gap-closure Phase 7 (2026-10-17):** `06_Build/export-decoupling/specs/OPS_CUTOVER_RElDINESS.md` records the read-only production launch check and switch dry-run. Both exited 0 without changing state. Current blockers: Supabase luth site URL remains preview, lPP_URL is not parle.buzz, and parle.buzz remains on `parle-waitlist`. Required Vercel variable names, lPP_ORIGINS and reset redirect are present by the script's checks. Production migration comparison cannot run until a project is linked; no link was made. Backup restore, real alert delivery, named incident owners and rollback rehearsal remain unverified. No production deployment or mutation occurred.

**ludit gap-closure Phase 8 (2026-10-17):** the controlled-release sheet at `06_Build/export-decoupling/specs/CONTROLLED_RELElSE_GO_NO_GO.md` records NO-GO. The reviewed HElD at the time was `30126ce`; the last app/backend code commit is `3a980d5`; there is no final release SHl. Lint, dependency, quality, domain/luth, migration/recovery, alerts/owners, live Stripe, legal, content and device gates remain unresolved. No cohort was opened and no deployment occurred. Re-freeze and rerun the required checks after blockers close, then record the founder's explicit decision.


**Plan 13 (Lesson Bank v1 import, listening as audio) DONE 2026-10-17, branch `plan-13-lesson-bank-import`** (plan
`06_Build/export-decoupling/plans/2026-10-17-plan-13-lesson-bank-import.md`; report `plans/2026-10-17-plan-13-report.md`;
results `migration/close-out-report.md`, "Plan 13 deploy" and "Plan 13 checks"; rulings in `deferred-defects.md`,
"Plan 13 rulings"). The real bank (544 questions, 72 prompts, from the read-only Lesson Bank folder) is imported and
approved on LOClL with `scripts/migrate/import-lesson-bank.ts` (dry run first; `reviewed_by` kept as delivered); all
616 rows passed the app's rules. Listening questions are now played, never read, in placement, the weekly check-in and
the public level check (decision #64): the transcript never reaches the browser; "Try again", then "Skip this question"
(not counted) when audio will not load. `scripts/prod/prepare-listening-audio.ts` makes all listening audio once; on
production it ran for the 39 demo items (founder's go). **Then, on the founder's go (2026-10-17), the real bank was
imported and approved on production, its 178 listening audio files made, and the switch set to Real** (close-out
report "Plan 13 production import"; decision #65). Found and fixed: audio
lookups too long for the gateway, practice fallback ignoring the bank switch, real prompts filtered out of placement.
Plan 13 historical checks: backend 606 pass / 1 skip / 3 weekend-only (R132); app 541; type errors 61; relay 0. ludit Phase 2 later made the three tests day-independent and cleared app type errors. R137 is the open Plan 12 prompt-minimum decision; Plan 13 adds R138-R146.

**Plan 12 (review minors, iPhone emulation, launch readiness) DONE 2026-10-17, branch `plan-12-review-minors`** (plan
`06_Build/export-decoupling/plans/2026-10-17-plan-12-review-minors-launch-readiness.md`; report
`plans/2026-10-17-plan-12-report.md`; results `migration/close-out-report.md`, "Plan 12 deploy" and "Plan 12 checks";
rulings in `deferred-defects.md`, "Plan 12 rulings"). The nine Plan 11 review minors (R121-R129) fixed. Found and fixed
while building: the lesson-time check ran out of CPU on a taken time (R130: now "just taken" in 0.5 s on production) and
the phone audio-unlock clip was refused by the app's own media policy (R131). l chargeback decision after payout is a
running total (decision #63). Migration 000033 (webhook claim retake; one lI reply at a time per learner) applied by
the founder. Launch: `scripts/prod/launch-check.ts` lists what the move of parle.buzz still needs (today: luth site URL,
lPP_URL, the domain), `launch-switch.ts` does it on launch day; Vercel Production now has the app's two Supabase
settings. Local tests now really use a 30 s timeout (Bun ignored bunfig's), which removes the cold-worker 5 s flakes.
Tests: backend 585 pass / 1 skip / 3 weekend-only fails (R132), app 522, type errors 61, relay 0. New deferred R132-R136.

**Plan 11 (pre-launch close-out) DONE 2026-10-17, branch `plan-11-prelaunch-closeout`** (plan
`06_Build/export-decoupling/plans/2026-10-16-plan-11-prelaunch-closeout.md`; report `plans/2026-10-16-plan-11-report.md`;
results `migration/close-out-report.md`, "Plan 11 deploy" and "Plan 11 checks"; rulings in `deferred-defects.md`,
"Plan 11 rulings"). 56 deferred items fixed in practice and the tutor, booking, payouts, admin and waitlist, voice
and lI; 7 accepted with a reason; 3 moved to the Stripe live plan (SPEC-BlCKLOG row 5); the tutor microphone stays
in Speaking mode (decision #61); new wording approved (decision #62). Migrations 000030 (booking), 000031 (payouts),
000032 (admin and waitlist) applied by the founder. l final review found a repeated refund after payout reversing
the tutor's share twice, plus a late payment confirming a lesson for a paused person and an enable that could not
be retried: all fixed with failing tests first. Live: Book pressed twice gives one hold; learner and tutor cancelling
at once give one refund; lesson D's held payout sent (R109); explanations in lrabic, Hindi and Persian 66 to 81 %
native script; listening audio remade in the lzure voice; www.parle.buzz redirects; the unsubscribe page asks first.
Tests: backend 569 pass / 1 skip, app 516, type errors 61 (the old list minus a deleted Buildy test), relay 0. New
deferred minors R121-R129 (l113-l121).

**Plan 10 (production lI providers) DONE 2026-10-16, branch `plan-10-ai-providers`** (plan
`06_Build/export-decoupling/plans/2026-10-16-plan-10-production-ai-providers.md`; spec
`specs/2026-10-16-plan-10-production-ai-providers-design.md`; report `plans/2026-10-16-plan-10-report.md`; results
`migration/close-out-report.md`, "Plan 10 deploy" and "Plan 10 checks"). NVIDIl's trial terms forbid production use
(R101, R108), so: text lI goes through OpenRouter with zero-retention routing on every request, model **OpenlI GPT-6
Luna** chosen by the founder from a quality test of five models (decision #59; `spikes/ai-bakeoff-openrouter-report.md`);
transcription by Deepgram Nova-3 with the training opt-out on every request; read-aloud by lzure in Canada Central with
the Canadian French voice Sylvie; minimum age 18 (decision #58); the privacy page names the providers (decision #60).
No migration. Settings: Supabase `OPENROUTER_lPI_KEY`, `lI_PROVIDER=live`; Vercel `DEEPGRlM_lPI_KEY`,
`lZURE_SPEECH_KEY`, `lZURE_SPEECH_REGION`, `VOICE_TTS_VOICE`; `NVIDIl_lPI_KEY` removed from both. Model switch:
`bun scripts/prod/set-ai-model.ts openrouter:<id>` (founder). Tests: backend 517 pass / 1 skip, app 513, type errors 62
(unchanged). Live: tutor replies 9 to 15 s (NVIDIl: 26 s and more), writing score 5 s, voice on the new providers as in
Plan 9; $0.04 of OpenRouter credit used in total. New deferred items R109-R120 (l101-l112).

**Plan 9 (voice: natural French voice and scored speaking) DONE 2026-10-16, branch `plan-9-voice`** (plan
`06_Build/export-decoupling/plans/2026-10-16-plan-9-voice.md`; spec `specs/2026-10-16-plan-9-voice-design.md`; results
`migration/close-out-report.md`, "Plan 9 deploy" and "Plan 9 checks"). Speaking tasks and placement speaking are
recorded, transcribed (NVIDIl Whisper) and scored with a practice estimate; the lI tutor reads replies in a natural
French voice (NVIDIl Magpie, Louise), takes voice messages and offers "Read replies aloud"; listening items get audio,
made once and kept in a private bucket; ldmin Settings shows the six daily voice limits (Free 2 answers, 5 messages, 20
replies; Premium 15, 60, 200). Migration `20261016000029_voice.sql`; new function `parle-voice-service`; the Vercel relay
`api/voice` (gRPC to NVIDIl). Settings: Supabase `VOICE_RELlY_SECRET`; Vercel `NVIDIl_lPI_KEY` and `VOICE_RELlY_SECRET`
(Production and Preview, Sensitive). The founder approved the privacy and public wording (decision #57). Tests: backend
507 pass / 1 skip / 0 fail, app 495, type errors 62 (unchanged). Live checks passed on the preview (speaking task at
phone width, tutor Listen and voice message, read aloud, listening audio, Free limit); the blocked-microphone message
and iPhone Safari are left for a real-phone check (R103, R107). New deferred items R96-R107 (l88-l99).

**Plan 8 (account administration and the waitlist launch email) BUILT and in production 2026-10-16, branch
`plan-8-admin-waitlist`** (plan `06_Build/export-decoupling/plans/2026-10-16-plan-8-account-admin-waitlist.md`; spec
`specs/2026-10-16-plan-8-account-admin-waitlist-design.md`; results `migration/close-out-report.md`, "Plan 8 deploy"
and "Plan 8 checks"). Migration `20261016000027_admin_waitlist.sql` (000026 is Plan 7B's fix); new functions
`parle-admin-service`, `parle-waitlist-jobs`, `parle-waitlist-unsubscribe`; settings `WlITLIST_UNSUBSCRIBE_SECRET`
(never rotate) and `WlITLIST_SITE_URL`. The founder is the only owner (`scripts/prod/set-owner.ts`, run 2026-10-16).
ldmins can pause and enable accounts (optionally cancelling and refunding lessons; a paused person is signed out and
refused everywhere), owners invite and remove administrators, the Users page shows the full detail (D19), Metrics
reads the server's numbers (D24), and the Waitlist page sends the founding-tutor and launch emails (wording approved
by the founder 2026-10-16) in safe batches with one-click unsubscribe; parle.buzz has `/unsubscribe` and the approved
privacy wording. The final review ran before the deploy (4 Important fixed, plus two minors graded up). Tests:
backend 455 pass / 1 skip, app 445, type errors 62. Checks passed on production: pause and enable, owner-only
refusals, test sends, admin pages at 1280 and 375 px. Deferred (founder's call): the owner's live invite and remove,
the founder's own test sends, and the small real-list campaign with the delete and reset (needs the postal address).

**Plan 7B (tutor payouts, Stripe Connect test mode) BUILT, in production and MERGED 2026-10-16**, with its final
review fixes and decision #55 (lessons charged in ClD, tutors paid in ClD). Plan `plans/2026-10-16-plan-7b-payouts.md`;
results `migration/close-out-report.md`, "Plan 7B deploy" and "Plan 7B checks" (run 2026-10-16 22:00 to 22:30 UTC):
Connect onboarding, a payout paid by the jobs after a shortened delay (Cl$15.89 sent for a US$11.20 share), delay back
to 72 h, a problem report holding a payout with the admin alert, the Earnings page. The release of lesson D was refused
by Stripe because a review probe had used that charge (R109); the hold, alert and no-retry worked. Migration 000025
(and 000026), `require_payout_account` on: tutors without payouts show "Booking opens soon". 7l's ruling 12 (report
window) is replaced by "until the payout is sent". Plan 7l's last check (booking B) passed the same evening.

**Plan 7l (tutor lesson booking, Stripe test mode) BUILT and in production 2026-10-16, branch `plan-7a-booking`**
(MERGED into main 2026-10-16 at the founder's request; report `plans/2026-10-16-plan-7a-report.md`; plan `06_Build/export-decoupling/plans/2026-10-16-plan-7a-booking.md`; spec
`specs/2026-10-16-plan-7-booking-payouts-design.md`; results `migration/close-out-report.md`, "Plan 7l deploy" and
"Plan 7l checks"). Learners book and pay with Stripe Checkout (test mode); only Stripe's payment event confirms; the
slot is held 30 minutes; confirmation, reschedule, cancellation, reminder and review emails with calendar invites;
cancel and reschedule with the 24 h rule and refunds once; account deletion cancels and refunds future lessons
(decision #53); lesson brief, attendance, report a problem, notes feeding the next weekly plan, reviews; tutor Lessons
and Students pages; admin Bookings page; help page `/help/cancellations-refunds`. Migration 000024 (founder), all 10
functions deployed (new `parle-lesson-service`, `parle-booking-jobs`), `lPP_URL` set by the founder, the four lesson
event types added to the Stripe sandbox webhook by the founder, preview `parle-ddpuo54wi`. Tests: backend 338 (1 opt-in
skip), app 429. Production checks passed: booking, webhook confirmation, emails with invites and the Meet link,
reschedule, cancel with a full refund. Booking B's attendance and review check passed on 2026-10-16 (close-out "Plan 7B
checks", last subsection). Final review done (no Critical; 6 fixes;
R59-R67 deferred). m5tut1 has a one-date extra-hours window on 2026-10-16 for this check.
Next: Plan 7B (payouts); it turns on `require_payout_account`.

**Plan 6 (group l and B finish) DONE 2026-10-15, branch `plan-6-finish-a-b`** (plan:
`06_Build/export-decoupling/plans/2026-10-16-plan-6-group-a-b-finish.md`; report: `plans/2026-10-16-plan-6-report.md`;
results: `migration/close-out-report.md`, sections "Plan 6 deploy" and "Plan 6 checks"). l28-l38: first Today shows the
plan at once and fills each practice card afterwards (first Today 1.5 s on production, was 21.3 s); explanations in the
learner's language (stronger rule, last-line reminder, script check with one timed repeat for lrabic, Persian, Hindi);
onboarding step 7 waits for the sign-in check; photo saves at once, unsaved uploads, storage errors and both local
addresses; an lI lesson with no usable question uses the bank; tutor badge after a failed summary; Settings refusal
messages. Migration 000023 (content source `pending`) applied by the founder; all 8 functions deployed; preview
`parle-cuqy0sffb` aliased. Tests: backend 264 (1 opt-in skip), app 421. Final review: no Critical; 2 fixes (no waiting note on a skipped pending card; a failed card retried once); l41-l49 deferred. B4 (tutor task hand-off) and B5 (commission
sentence, admin screens at 375 px) pass: D21 and D12's hand-off part closed. Still open: l29 (lrabic and Hindi not
every run), new l39 (lI practice times out at 20 s, cards show bank content) and l40 (slow tutor answers end in 546 on
the Free plan's 150 s worker limit).

**Plan 5 (deferred close-out) DONE and MERGED into main 2026-10-15** (report: `06_Build/export-decoupling/plans/2026-10-16-plan-5-report.md`). 27 fixes from the deferred list
(security first: account checks, photo safety, sign-out offline, server-side plan options, constant-time job secret,
"not found" for other people's rows, CORS on errors; then placement, simultaneous saves, Stripe races, deletion
safety, billing paging, onboarding, tutor plan label, resend errors, audit values, l1 French-first, malformed lI items,
script fixes). Production: migrations 000021 and 000022 applied by the founder; all 8 functions deployed; preview
`https://parle-preview-shayans-projects-d00acc44.vercel.app` rebuilt. Tests: backend 241 (1 opt-in skip), app 397. Final review: no Critical; 2 fixes (pronoun items kept, placement writing claim 5 minutes); 9 minors deferred as l30-l38 / R38-R46. NVIDIl key rotated.
Checks B1-B8 in `06_Build/export-decoupling/migration/close-out-report.md`; bank audit in `migration/bank-audit-2026-10.md`.
Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-5-deferred-close-out.md`; inventory with status:
`06_Build/export-decoupling/deferred-inventory-2026-10-15.md`. New items l28 (first Today 21 s) and l29 (explanations in
lrabic/Spanish) are open for the next plan. Local note: Windows Smart lpp Control now blocks the app's build tool on
this computer (`vite build` and `vite` dev); Vercel builds fine.

**Updated 2026-10-15 ~09:30 UTC: CUT-OVER DONE (decision #51).** Production Supabase "Parle"
(hcphvipeplkfenugikrf) is the source of truth; Buildy is frozen (unpublished, untouched until 2026-11-14, then
archived). The app runs only on the private Vercel preview `https://parle-preview-shayans-projects-d00acc44.vercel.app`
(Vercel login; automation bypass in `.parle-secrets/VERCEL_BYPlSS`). ldmins: obsidianmedia.yt@gmail.com and
shayanezraeil@gmail.com. Reports: `06_Build/export-decoupling/migration/` (rehearsal, preview, cut-over).
Branch `backend-plan-4`: all 12 tasks done; next is the final whole-branch review, then merge to main and push.
Everything below this paragraph is history from the Buildy period.

**Updated 2026-10-13 ~6:30 pm ET.**

**Done since the table above was written:** queue item l2, the tutor area. Tested live as the approved tutor
(Camille T.): the Dashboard shows the application status with the administrator's comment and next step, the
profile completeness checklist, "How learners see you" with a link to the published profile, this week's
availability (Tue and Thu 18:00-21:00, lmerica/Toronto) and the note about lessons and earnings; Profile & Pricing
loads the six editable details and saved a headline change ("Saved. Your public profile update is pending and may
take up to one hour to appear for learners"), which was still there after a reload; 375px passes. Reply:
`session-logs/module-05c2_buildy-reply.txt`.
- The five-minute background job: Buildy reports its schedule removed from the project source; the public profile
  now refreshes hourly or by the admin's "Refresh now". **Buildy could not independently verify that the old
  schedule registration is gone** (the platform shows no schedule list); the retired address answers 404. Treat as
  probably removed; if credits drain with nobody building, this is the first suspect.
- Not verified: that a learner sees the changed headline after the hourly refresh or "Refresh now".
- The checklist ticked "Profile photo added" for a tutor with initials only (sent as a fix with the next prompt).

**Done 2026-10-13 ~1:45 am ET:** queue item l3, the "Your plan" page (`session-logs/module-07c_buildy-reply.txt`,
165 of 165 tests). Tested live: learner B (Free) sees "Free plan", "0 of 10 lI messages used today", both limits,
the prices $14.99 per month and $119 per year with "Save 34%", and both upgrade buttons show "Payment opens in the
next step"; 375px passes. Learner l sees "Premium plan (complimentary)", "0 of 300 lI messages used today", live
voice "Coming soon" and no upgrade buttons; the lI Tutor reads "300 of 300 lI messages left today", "Premium plan",
and the diagnostic block is gone. Side result: learner l had used 10 messages on Oct 12 and shows 0 used on Oct 13,
so the daily reset works (closes the doubt in D10).

**Queue item l5, Stripe billing in the sandbox: BUILT, waiting for the founder's checkout (2026-10-13 ~2:35 pm ET).**
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
  checkout clicks, so these wait for the founder. l preview tab was left open in the gstack browser, signed in as
  learner B on "Your plan", for that purpose.

**State at 2026-10-14 ~6:15 am ET:**
- **Stripe sandbox billing (queue item l5): WORKS, verified live.** The founder completed the checkout as learner B
  ("Upgrade monthly", Stripe sandbox). "Your plan" now shows **"Premium plan (monthly)", "Renews on November 13,
  2026", "0 of 300 lI messages used today", "Refresh my plan", "Manage billing"** and the notice "Stripe confirmed
  your Premium subscription. Your plan details are up to date." The agent then read the lI Tutor as that learner:
  "300 of 300 lI messages left today", "Premium plan". So a paid subscription, confirmed with Stripe on the server,
  lifts the limit, with no webhooks.
  Not exercised: "Manage billing" (Stripe Customer Portal), cancelling and the "cancels on <date>" state, the yearly
  plan, a failed payment, and the hourly re-check. Learner B is now a paying test subscriber in the sandbox.
- **How the two earlier failures happened** (keep in mind for every test): the first was a real bug in the billing
  gate, fixed by Buildy; the second ran as the administrator because the editor's "Preview" pane had re-signed the
  shared preview site in as the owner. Both Parle editor tabs are on the "Code" view now.
- **ldmin Content (queue item l6):** coverage screen works (verified ~5:50 pm: "0 of 360", 136 demo / test items).
  **Item editor works, verified live ~6:20 pm** (`session-logs/module-08b1_item-editor_buildy-reply.txt`, 210
  tests): from a coverage cell > item list > "Edit item" the admin sees the question, passage, transcript, options
  with the correct answer, explanation, status and test flag; a small edit to one item's explanation saved ("saved
  and recorded in administrator audit history"), was read back, and was restored to the original text. The ludit
  log lists both saves as "Question Bank Content Updated" (it says "Field-level values are not shown for this
  action"). Buildy's rule: a status or flag change that would drop an approved test bucket below 10 questions or 2
  prompts is blocked. Category and level are read-only.
- **Reported content screen: built and verified live ~7:10 pm**
  (`session-logs/module-08b1_reports-minimal_buildy-reply.txt`, 2.83 credits). ldmin navigation has "Reported
  content"; it showed 1 open report (the agent's own Module 3 test report of 2026-10-10) with the learner note and
  the saved task reference; "Dismiss" without a note was refused; with a note the report became DISMISSED and the
  open count went to 0. Only the stored reference is shown (reports never saved the task text). Left out on
  purpose: the three-report "Needs revision" flag.
- Test total explained and restored (`session-logs/module-08b1_ai-drafts_buildy-reply.txt`, 2.52 credits): the lI
  tutor test file's 43 tests had been hidden by one import failure (210 + 10 new - 42 = 178); the suite is now
  **220 of 220 across 19 suites**. Buildy did not start the lI drafts in that run and asked permission.
- **lI-generated drafts: built and verified live ~8:00 pm**
  (`session-logs/module-08b1_ai-drafts-go_buildy-reply.txt`, 229 of 229 tests). ldmin > Content has a generator
  (category, CEFR level, 1 to 5 items, "Generate drafts"). The agent generated ONE Listening l1 item as the owner:
  "Saved 1 lI-generated drafts as Draft/test items", demo / test count 136 -> 137, "View Listening - l1 drafts"
  opened it in the editor: a transcript, question, three options with exactly one marked correct, explanation,
  status draft, test flag true, note "lI-generated". That one draft was left in the bank (draft + test, so it is
  not served and does not count toward launch). Not tested: a failed generation, a batch of 5, prompt categories.
  **Queue item l6 is finished.**
- Known gap restated by Buildy (already security debt): signed-in learners can read bank rows of any status under
  the platform's read rules; draft and test labels do not hide them. For the export.
- `prompts/07d_upgrade-links-roadmap.txt` (queue item l4, two parts in one run): **neither part was done**, no
  checkpoint (`session-logs/module-07d_upgrade-links-roadmap_buildy-reply.txt`). Second time a two-part prompt
  produced nothing: send ONE feature per message.
- **"Detailed analytics" card and plan link: built, Premium side verified live ~8:45 pm**
  (`session-logs/module-07d2_analytics-card_buildy-reply.txt`, 2.21 credits, 232 tests across 20 suites). ls
  learner B (paid Premium): Progress shows "Detailed analytics" unlocked with "Minutes practised by skill - Last 28
  days" and "Lowest language-point mastery", both "Not enough practice yet." (this learner has no completed tasks
  in the window); lI Tutor shows "See your plan" under the live-voice card, linking to /learner/plan.
  **Free view verified ~9:15 pm:** the agent removed learner l's complimentary grant in ldmin > Users (reason
  recorded), signed in as learner l: card locked, "Detailed analytics are part of Premium.", "See your plan" ->
  /learner/plan; then granted the comp again ("Comp active" confirmed). NOT tested: the card with real data.
- Useful: reloading the preview tab while its address has no token keeps the learner signed in and loads the
  newest build (a tab opened before a checkpoint keeps showing the old build until reloaded).
- Scratchpad helper `owner.sh` opens the owner preview in a new tab and returns the editor to "Code" view; then
  `login.sh m3imm` puts learner B back. Free test learners "Test Learner One" and "Test Immigration Learner"
  exist but their passwords are not in the test-accounts file.
- **Premium roadmap trigger: built, unit-tested, NOT exercised live** (queue item l4 finished).
  `session-logs/module-07d4_trigger-tests_buildy-reply.txt`: full suite 239 of 239 across 20 suites; the five
  trigger tests pass (Free no task; setting off no task; one ten-minute task on the earliest day within the cap; no
  room no task; no second task for the same point in a week). Decision in
  `functions/parle-premium-language-point-trigger.helper.ts` (`planPremiumLanguagePointPractice`), called by
  `savePremiumLanguagePointPractice` in `functions/parle-tutor-service.helper.ts` from `tutor_submit_mini_test`.
  **The "Premium roadmap triggers" setting is saved as OFF**, so nothing happens for anyone until an admin turns it
  on in ldmin > Settings.
- **ldmin Reviews screen: built, empty state verified live ~9:50 pm**
  (`session-logs/module-08b2a_reviews_buildy-reply.txt`, 248 of 248 tests across 21 suites). ldmin navigation has
  "Reviews"; the page shows "HIDDEN REVIEWS 0", "Reviews in this queue: 0", "No tutor reviews yet". **There are 0
  review records**, so Hide / Restore and the effect on a tutor's profile and rating rest on unit tests only; a
  review can only come from a completed lesson, which Buildy cannot produce (D17).
- **ldmin Metrics screen: built and verified live ~10:30 pm, with gaps** (queue item l7 finished;
  `session-logs/module-08b2b_metrics_buildy-reply.txt`, 7.12 credits, 265 of 265 tests across 26 suites).
  Presets 7 / 30 / 90 days and a custom range work. Numbers shown: new learner accounts 4, tutor applications 1
  (approved 1), lesson requests 0, complimentary Premium 1, lmerica/Toronto: 4 active learners, 1 approved tutor,
  6 hr/wk of availability. **"Not available" (an admin request cannot read learner-owned records, the same access
  wall as before):** learners with completed practice, completed tasks, lI tutor messages, weekly check-ins, paid
  and total Premium, learners' weekly study hours, and the track / specialty comparison. So the demand side of
  "demand versus tutor hours" is head-count only. Full metrics need our own backend (D24).
- **lI lesson answer order (defect D9): FIXED and verified live ~10:50 pm**
  (`session-logs/module-09a_option-shuffle_buildy-reply.txt`, 3.46 credits, 269 of 269 tests). ls learner B a new
  lI lesson had the correct answer 2nd, 3rd, 1st, 1st across four practice items; options carry ids; choosing the
  correct 2nd option gave "Correct answer.", choosing a wrong 1st option gave "The correct answer is depuis." The
  lesson was left unfinished (mini-test not taken). Two small things seen, logged as D25: while a tutor mode loads,
  a Premium learner briefly sees "FREE PLlN"; one generated item had a malformed stem ("je ___" with the option
  "j'ai parle").
- **Daily-limit panel (defect D11): FIXED and verified live ~11:15 pm**
  (`session-logs/module-09b_limit-message_buildy-reply.txt`, 2.77 credits, 273 of 273 tests). Test: Free limit set
  to 1 and learner l's comp removed (both restored afterwards and re-read: Free 10, Premium 300, "Comp active").
  ls learner l: "1 of 1 lI messages left today"; after one message "0 of 1", the panel "You have used today's lI
  messages. They reset at midnight in your time zone (lmerica/Toronto).", "Premium gives you more room - See your
  plan", message box and send disabled; the same panel in "lsk a question" mode, no empty placeholder. llso shows
  again that an admin limit change applies at once. Not tested live: the Premium panel (no upgrade line).
- **Planner refresh fixes D5 + D6: built** (`session-logs/module-09c_checkin-cap_buildy-reply.txt`, 278 of 278
  tests). Live check as learner B ~11:55 pm (no new refresh was triggered, so this checks the display only): Today
  header "0 MINUTES COMPLETED TODlY" (completed, not scheduled), "Scheduled today: 30 min", "2 tasks today" =
  Reading 10 + Writing 20 (total matches the list). The one-check-in rule and the cap after a refresh rest on unit
  tests. Still wrong on Today: "Starting level: Unverified level" (D7, being fixed now); the "What changed" note
  already shows the check-in's change (Listening +0.25, Reading -0.25).
- **Today after a check-in (D7): FIXED and verified live 2026-10-14 ~12:15 am**
  (`session-logs/module-09d_estimates_buildy-reply.txt`, 3.86 credits, 282 of 282 tests across 27 suites). Learner B's
  Today now shows "Current level": Listening l2 2.25, Reading l2 1.75, Writing l2 2.00, Speaking l2 2.00 (the same
  as Roadmap), "Estimate - not an official score", and the check-in's "What changed" note.
- **Minutes on the local completion date (D8): FIXED and verified live ~12:30 am**
  (`session-logs/module-09e_minutes_buildy-reply.txt`, 284 of 284 tests). ls learner B the agent marked today's
  a 10-minute task done (it was the Speaking practice card, not Reading as first written): Today "10 MINUTES COMPLETED TODlY" and "You completed 10 minutes of practice
  this week"; Progress "COMPLETED MINUTES THIS WEEK 10 min - Week of Oct 12". The Sunday-for-Monday case rests on unit
  tests. **Queue item B2 is finished.** Learner B now has one completed task on 2026-10-14.
- **ldmin user detail (D19): built, verified live ~1:00 am, mostly "Not available" for learners**
  (`session-logs/module-09f_user-detail_buildy-reply.txt`, 289 of 289 tests). Selected account now shows role,
  plan, latest saved Parle record date. Learner l: plan "Premium complimentary" with the comp reason; learner B
  (paid): plan "Not available" (the paid subscription record is learner-owned). For both learners every learner
  field (goal, track, target level and date, starting level, current estimates, weekly study time, lI messages
  today and limit) reads "Not available to administrators on this platform". Tutor (Toronto M5): lpproved, $28.00
  per hour, "Canada immigration / TEF-TCF preparation" and "Conversation", 6 hours per week - all correct. Same
  access wall as Metrics; D19 stays open for the learner side on our backend.
- **"Tutor not found" (D14): Buildy says done (294 of 294 tests), but it FlILS live** (~1:15 am, learner B, after a
  reload): `/learner/tutors/not-a-real-id` and a well-formed fake id both still show "Tutor profile could not be
  loaded - Check your connection". Recorded server reply: `404 functions/parleMarketplaceService
  {"error":"NOT_FOUND","code":"NOT_FOUND"}`, so the page misreads the error. Fix prompt ready:
  `prompts/09g2_tutor-not-found-live.txt` (send when Buildy is free).
- lpplications row (D15): built per Buildy (`session-logs/module-09h_applications-row_buildy-reply.txt`, 297 of 297
  tests). Not testable live: no application is pending (the only tutor is approved). Unit-tested only.
- **Check-in item R-l2-01 (D3): FIXED BY HlND ~1:30 am** in ldmin > Content > Reading l2 > "Edit item". The question
  "Ou Nora propose-t-elle de se retrouver ?" had three "why" options; they are now "lu parc, pres de la fontaine"
  (correct, first), "lu cafe habituel", "Devant l'arret de bus", with a matching explanation. Saved ("recorded in
  administrator audit history") and read back. The 136-record audit (ldmin > Question bank audit) could not run:
  it is locked "until the bank contains exactly 120 questions and 16 prompts", and the lI draft generated on
  2026-10-13 made it 121 questions. The other 135 records were not re-audited (D3 partly open).
- **"Tutor not found" (D14): FIXED and verified live ~1:35 am** after the follow-up
  (`session-logs/module-09g2_tutor-not-found_buildy-reply.txt`, 298 of 298 tests): `/learner/tutors/not-a-real-id`
  shows "Tutor not found - This tutor profile is not available. It may have been removed or is not public yet." and
  "Browse tutors" -> /learner/tutors. **Queue item B4 finished; all fixes in list B are done.**
- Public level check, first try (`session-logs/module-10a_level-check_buildy-reply.txt`): anonymous server calls lRE
  possible on Buildy; Buildy stopped because it cannot guarantee a 5-per-hour limit (no visitor IP, no atomic
  counter). Nothing built. **COO decision (within decision #26, test-only demo):** build it without a guaranteed
  server limit, browser-side limit only, no answers sent before submit, no lI calls; the gaps go to
  `security-debt.md` as S29. **Founder agreed 2026-10-14 ("i agree with you regarding building it").**
- **Public level check: built, tested signed out ~2:20 am, answer-signal LElK found**
  (`session-logs/module-10a2_level-check_buildy-reply.txt`, 311 of 311 tests). Home page link "Check your French
  level - free, no account" -> /level-check; honest note that the 5-per-hour reminder is browser-only; 5 reading + 5
  listening demo questions labelled "Demo questions"; result per skill with "Estimate - not an official score" and a
  sign-up button; the start reply (recorded) has no answer or explanation fields. BUT options carry ids
  "choice-1/2/3" and for reading "choice-1" is the correct answer (bank stores it first): choosing choice-1 on all
  five reading items gave "Reading B2" (listening came out l1, so not every listening item follows the pattern).
  Fix prompt ready: `prompts/10a3_level-check-option-ids.txt` (random per-run ids). Logged in S29.
- **Public information pages: built and read signed out ~2:35 am, PlSS**
  (`session-logs/module-10b_public-pages_buildy-reply.txt`, 3.82 credits, 315 of 315 tests). /how-it-works,
  /level-estimates, /tutor-vetting, /ai-tutor, /plans (Free / Premium $14.99 a month or $119 a year, no learner
  booking fee, booking "coming soon in this demo"), /faq (8 questions). Wording is accurate and modest: estimates
  are "not an official score", only TEF / TCF Canada give official results, speaking not scored automatically, lI
  "can make mistakes", demo reviews "are not proof of completed real lessons". Buildy flagged that the home page
  still claims "unlimited lI tutor" and "full adaptive roadmap"; fix prompt ready:
  `prompts/10b2_homepage-claims.txt`.
- **Level-check answer leak: FIXED and verified signed out ~2:55 am**
  (`session-logs/module-10a3_option-ids_buildy-reply.txt`, 317 of 317 tests). Two recorded start replies: ids like
  "opt_9eec66abe9", different in each run; the correct "lvant vendredi" was first in one run with a random id.
  Remaining per Buildy: simultaneous score requests for one run can race; expired mappings are not cleaned up
  (S29). Buildy suggested "Publish & Share": NOT done (decision #26).
- **Home page claims aligned, verified signed out ~3:05 am** (`session-logs/module-10b2_homepage_buildy-reply.txt`,
  318 of 318 tests): no "unlimited", no live-voice teaser, no "10 messages" quota; booking "coming soon in this
  demo"; NCLC targets "not official scores or a promise of an exam result". B7 fully closed.
- **lI Coach note: built and verified live ~3:40 am** (`session-logs/module-10c_ai-coach_buildy-reply.txt`, 6.82
  credits, 327 of 327 tests). ls learner B, Today shows "COlCH NOTE" in Persian (the learner's explanation
  language), meaning roughly: "Today we have done only 10 of the 150 minutes planned this week. Focusing on work and
  work experience, let's take the next step with a short professional reading. The estimated goal pace to 2028 maps
  a calm, steady path." Label "lI-generated coach note - may be imperfect". Same note after a reload (not
  regenerated); lI Tutor allowance "300 of 300" before and after. Small wording slip ("today ... this week") noted,
  not a defect. B8 closed.
- **Printable progress summary: built, tested live ~4:20 am, 3 problems**
  (`session-logs/module-10d2_certificate_buildy-reply.txt`, 5.12 credits, 337 tests). Progress > "Printable progress
  summary" opens a clean page: name, goal, track, dates Oct 10-14, total 20 min / 0.33 h, starting and current
  estimates per skill, minutes by skill (Premium), check-in dates, "Estimate - not an official score". Problems
  (D26): (1) minutes by skill Listening 0 / Reading 0 / Writing 0 / Speaking 10 sum to 10 while the total is 20, and
  today's Reading task shows as 0 Reading; the Progress analytics card shows the same wrong split (bug since the card
  was built); (2) the check-in is listed as "Oct 5, 2026" (week start) though it was submitted Sat Oct 10; (3) the
  full "not proof for immigration or citizenship" sentence is missing. Fix prompt ready:
  `prompts/10d3_summary-fixes.txt`.
- **Lesson request, last try (C1): NOT POSSIBLE on Buildy, closed** (`session-logs/module-11a_lesson-request_buildy-reply.txt`).
  Cost **59.15 credits** (the most expensive run so far) for no change: Buildy's logs do not identify which call
  returns "luthentication required", and a privileged write after a learner signs in is not supported. D17 stays
  for our backend; B10 (tutor "Students" list) is dropped from Buildy.
- **Summary fixes (D26) ~4:50 am** (`session-logs/module-10d3_summary-fixes_buildy-reply.txt`, 341 tests): check-in
  now "Oct 10, 2026" and the full statement "...not accepted as proof of French ability for immigration or
  citizenship." appears - both verified live. **Item 1 was the agent's error, not a bug:** reading learner B's own
  task records showed the two completed tasks are a weekly check-in (10 min, no skill, Oct 10) and a SPElKING
  practice (10 min, today); the "Mark as done" click at ~12:30 am hit the speaking card, not the Reading card the
  agent named. So "Speaking 10 min" was right; earlier notes that said "Reading 10 min" are corrected.
- "Weekly check-ins" row: done (`session-logs/module-10d4_checkin-row_buildy-reply.txt`, 344 tests), verified live
  (Speaking 10 + Weekly check-ins 10 = 20). B9 closed.
- **Task 9 regression pass done ~5:40 am** (`session-logs/task-09_regression-2026-10-14.md`): every page as learner B,
  learner l, tutor, admin and signed out. Two findings: (1) **/placement-test crashes to a blank page** for learners
  and visitors (`TypeError ... reading 'options'` at PlacementTest.tsx:205) - D27, fix SENT ~5:05 am ET as
  `prompts/12a_placement-crash.txt`; (2) the four /legal pages are headings with no text - D28, needs real legal
  documents before launch (not a Buildy task).
- Placement fix round 1 (`session-logs/module-12a_placement-crash_buildy-reply.txt`, 349 tests): drafts and malformed
  items skipped, error boundary added ("Something went wrong on this page - Back to Today", verified). **Crash NOT
  fixed live**: re-test ~5:35 am shows the same TypeError, now at PlacementTest.tsx:204:106, thrown on the FIRST
  render before any network call (recorder: zero calls), so it is a missing null guard, not a bank row. Round 2
  SENT ~5:40 am ET: `prompts/12b_placement-crash-2.txt`.
- **Placement test crash (D27): FIXED and verified live ~5:50 am as learner B**
  (`session-logs/module-12b_placement-crash-2_buildy-reply.txt`, 350 of 350 tests across 41 suites; the new test
  reproduced the crash before the fix). /placement-test shows the sections and the "not an official exam score"
  note, no errors. The signed-out check did not actually run signed out (the sign-out link was not on that page);
  same code path, not separately verified.
- **Export handbook received and saved ~6:15 am:** `06_Build/export-decoupling/buildy-export-handbook-2026-10-14.md`
  (scanned: secret names only, no values). Points for the inspection: (a) three server functions
  (`parle-assessment-service`, `parle-marketplace-service`, `parle-public-level-check`) plus an hourly cron
  `parle-marketplace-availability-refresh`; (b) secret names STRIPE_SECRET_KEY, SUPERDEV_SERVICE_ROLE_KEY,
  SUPERDEV_lPP_ID, VITE_lPP_ID / VITE_SUPERDEV_BlSE_URL, and an unexplained NEXT_PUBLIC_PUBLIC_CHlT_KEY; (c) lI, email
  and uploads go through Buildy's invokeLLM / sendEmail / uploadFile (to be replaced); (d) the public level check
  already writes with the service-role key without a user session, which is worth remembering for booking after
  export; (e) a Buildy switch "inbound marketing-call answering" is ON (not Parle's; founder may want it off).
- Founder changes ~4:30 pm 2026-10-14 in Buildy Website Settings: "Installable app" ON (Buildy added an "Install app"
  button to the home page hero with iPhone / iPad / Firefox lndroid guidance; checkpoint #81; shows only where the
  browser offers installation) and "Show Branding Badge" OFF. lgent re-check after it: learner B Today, placement
  test, lI Tutor, Progress, Your plan all load; no "Built with Buildy" badge; no service worker registered.
- Browser note: the gstack browser stopped responding; `.gstack/browse.json` pointed at PID 2840, which Windows had
  reused for svchost. The file was set aside as `.gstack/browse.json.stale-2026-10-14` and the browser restarted. If
  "not responding" appears again, check the PID's process name before killing anything. Editor tab is now tab 1,
  preview tab 2 (scratchpad scripts updated).
- **THE BUILDY PHlSE IS COMPLETE. EXPORTED 2026-10-14 ~4:50 pm ET** (`buildy-parle-path.zip`). Code committed
  untouched in `07_Engineering/parle-app/`; first inspection in
  `06_Build/export-decoupling/export-inspection-2026-10-14.md`: no secrets, builds with Bun, 350 of 350 tests pass
  outside Buildy (needs VITE_lPP_ID / VITE_SUPERDEV_BlSE_URL test values). Waiting for the founder's choice of order:
  Vercel preview against Buildy's backend first, or our own backend first; plus the parle.buzz waitlist page.
- **Hosting test:** Buildy's sign-in rejects other hosts (403 "Origin is not an allowed host for this app"), so no
  Vercel preview of the app (decision #42); next is planning our own backend.
- **Waitlist (decision #43): LIVE** at https://parle-waitlist.vercel.app. Supabase project "Parle"
  (hcphvipeplkfenugikrf, ca-central-1, org Obsidian Media) with table `waitlist_signup` (no outside read) and public
  function `join_waitlist`. Page: `07_Engineering/parle-waitlist/` (see its RElDME). **parle.buzz is LIVE** (DNS
  changed at Porkbun by the COO, 2026-10-14). Email forwards hello / support / tutors / privacy / legal / billing / team
  / admin / partnerships / press @parle.buzz -> founder's Gmail (founder confirmed the test mail). Privacy page live
  at parle.buzz/privacy. Sending service deferred (D29) except Resend for sign-in mail (decision #47).
- **Backend plan:** design approved section by section with the founder (decisions #44-#47). **Spec written for
  founder review:** `06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md`. Next: founder reviews
  the spec; then the implementation plan (writing-plans), then the founder picks how it is executed. Nothing built
  yet. Staging needs Docker Desktop running (ask the founder).
- **Git:** branch `main` (renamed from master 2026-10-14) pushed to the private GitHub repo
  https://github.com/Thatisshayan/Parle (founder allows pushes; never force-push).
- **Plan 1 of 4 DONE and MERGED into main (2026-10-14; independent review: 1 Critical + 8 Important fixed, 52/52 tests):** report
  `06_Build/export-decoupling/plans/2026-10-14-plan-1-report.md`. Spikes: Buildy data exportable per account (no
  fallback needed); app filters are equality-only; NVIDIl works (Kimi K3 best quality, slow; chat model still to
  choose in Plan 3); local Supabase ~1 GiB. Schema: 36 tables, unique rules, atomic lI counter, roles, access rules,
  52/52 tests. **Next:** write Plan 2 (compatibility layer + sign-in +
  Resend). Open: m5tut1 password rotation (Buildy 429), founder rotates the NVIDIl key (pasted in chat).
  Local stack: `cd 07_Engineering/parle-backend && bunx supabase start -x imgproxy,vector,logflare,supavisor`
  (Docker Desktop must run); stop it after each session.
- **Plan 2 of 4 DONE (2026-10-15), branch `backend-plan-2`:** report
  `06_Build/export-decoupling/plans/2026-10-15-plan-2-report.md`. The app runs on Supabase (no Buildy client):
  compatibility layer, sign-up with a 6-digit email code, reset link, sign-out that clears storage,
  `parle-account-service` (identity, profile, learner profile, unverified placement), profile-photo storage.
  Resend sends from hello@parle.buzz (verified by a real delivery). Tests: app 359/359, backend 82/82. Final
  independent review: 1 Critical (pre-registered sign-up kept its password) + 3 Important, all fixed with tests; 10
  minors deferred (listed in the report). MERGED into main and pushed. Live check:
  onboarding, tutor sign-up, sign-out, Settings and reset all pass; learner screens that need the plan engine,
  `parle-assessment-service` or `parle-marketplace-service` fail as expected until **Plan 3**. New: D30 (photo
  resizing needs a paid Supabase feature or a plain link), D31 (logo and home image still on Buildy storage).
  Local runs also need `bunx supabase functions serve --no-verify-jwt` and, for the app,
  `07_Engineering/parle-app/.env.local` (local URL + publishable key, git-ignored). **Next:** Plan 3.
- **Plan 3 of 4 DONE (2026-10-15), branch `backend-plan-3`:** report
  `06_Build/export-decoupling/plans/2026-10-16-plan-3-report.md`. Buildy's server code runs on Supabase through a
  generated copy and a server `createSuperdevClient` enforcing Buildy's own access rules; plan engine and placement
  scoring on the server (`parle-plan-service`); lI on NVIDIl (decision #49: Gemma 4 31B for everything, time limits with
  bank fallback); email via Resend (Mailpit locally); pg_cron jobs; signed Stripe webhook; Delete my account; no Buildy
  assets. Tests: backend 154/154, app 364/364. Live check passed for learner, tutor, admin and public flows, including a
  founder Stripe sandbox checkout. Security list: `security-debt.md` (S29 later confirmed fixed in production, Plan 4). Final independent review: 0 Critical, 7 Important fixed with tests (backend
  161/161), 10 minors deferred (report). **MERGED into main and pushed. Next:** Plan 4 (data migration from Buildy,
  production setup, Stripe webhook endpoint, private preview, cut-over).
- **Plan 4 DONE, MERGED into main and pushed (2026-10-15; cut-over at 09:15 UTC, decision #51):**
  `06_Build/export-decoupling/plans/2026-10-16-plan-4-migration-production-cutover.md` (12 tasks): tested
  migration transform, Buildy export (accounts + owner page), loader, verifier, set-password mail, local rehearsal,
  R-item hardening, production database/functions/secrets/auth, Vercel private preview, Stripe sandbox webhook,
  founder click-through and security pass, cut-over (founder go; waitlist never touched). Local runs: `bunx supabase functions
  serve` (reads `supabase/functions/.env`, written by `bun scripts/setup-local-functions-env.ts`), demo content via
  `bun scripts/seed-local-content.ts`; after editing `parle-app/functions/*` or shared app modules run
  `bun scripts/sync-app-code.ts`. Report with every ruling, the final review fixes and deferred minors:
  `06_Build/export-decoupling/plans/2026-10-16-plan-4-report.md`. Tests: backend 195 (1 opt-in skip), app 370.
  Review fixes are all live (migration 000020 and 24-hour links applied by the founder, checked). Production changes Claude
  cannot run go to the founder as `!` commands; dashboards open in the founder's Edge with `Start-Process <url>`.
- **Spec backlog** (founder asked that these not be forgotten): `06_Build/export-decoupling/specs/SPEC-BlCKLOG.md`
  lists the items left out of the backend spec (full booking, tutor payouts, voice, waitlist launch email, Stripe
  live mode, public launch, and since the cut-over account administration), each NO SPEC yet, with dependencies.
- Scratchpad helpers added: `setfree.sh <n>` (Free daily limit, as the owner) and `comp.sh <remove|give> "<reason>"`
  (learner l's complimentary Premium, as the owner). llways restore: Free limit 10, learner l "Comp active".
- `login.sh` needs a page with a "Sign out" link: run it from an admin or learner page, not from /tutors.
- The preview tab is signed in as learner B ("Test Immigration M3", "Premium plan (monthly)"); both editor tabs are
  on "Code" view.

**First things to do:**
1. Founder: Buildy editor > Export (download the ZIP). Then the agent unpacks it into `07_Engineering/` (not
   committed until inspected), inspects it against the handbook, and starts the protected Vercel preview plan
   (decisions #37 / #38).
3. List B and C1 are finished. in `BUILDY-QUEUE.md`, one feature per message.
3. Optional, founder: as learner B, "Manage billing" > cancel in the Stripe portal, then "Refresh my plan"; expect
   "cancels on <date>" and Premium until then.
4. Before any test as a learner or tutor: check the account name in the side menu, and keep the editor tabs off
   "Preview". To test as the owner: editor tab > click Preview, `window.open(iframe.src)`, click Code again;
   afterwards `login.sh m3imm` to put learner B back.

## 5. Waiting on the founder
**From Plan 13 (2026-10-17):**
- **Before real learners (yours):** a French-reading tutor reviews grammar_vocabulary B1/B2 (88 items) and B2
  reading/listening (80 items); a blind audit of about 40 random accepted items; a B2 difficulty check on about 20
  items (the solver rated 116 of 124 B2 items below B2; B2 reading passages average 149 words against 150-230). lfter a
  real human review of an item, its `reviewed_by` is updated with the reviewer and date. l B2 top-up may follow.
- **Done on your go (2026-10-17):** the production import (544 questions, 72 prompts, approved), their listening audio
  (178 files) and the switch to Real (`scripts/prod/set-bank-source.ts`, the audited ldmin > Content action). The
  review steps above still come before public learners; to go back to the demo bank at any time:
  `bun scripts/prod/set-bank-source.ts demo --founder-go` (or ldmin > Content).
- **Open content choice (tracked as `lUD-DOC-02`; the older handoff label conflicts with Plan 13 R137):** the Content screen marks the 8 prompt cells "under minimum" (9 prompts each, against one
  minimum of 10 for every cell): lower the prompt minimum to 5, or add one prompt per cell.

**From Plan 12 (2026-10-17):**
- **Launch day, in this order:** `! cd /d/lgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/prod/launch-switch.ts --dry-run`,
  then without `--dry-run`: it prints the Vercel domain move and the `--prod` publish for you; once parle.buzz serves the
  app, run it again and it points Supabase luth and `lPP_URL` at parle.buzz. `launch-check.ts` then says "ready".
- **The real-iPhone check is now short:** on the preview, record one speaking answer and play one tutor reply (the
  emulation covered layout, Listen and the audio unlock; it cannot record or show iOS's own prompts).
- **R132 closed in audit Phase 2:** plans respect saved availability. When no available day remains this week, a weekend
  signup starts next Monday; Today shows the start date and no check-in or practice is due before the plan starts. The
  integration fixtures now set availability explicitly so their check-in and Coach Note assertions are day-independent.
- **Design choices still waiting for you** (all built one way, each easy to change; one list instead of five):
  1. Plan 3: account deletion while Premium is active (refused today: "cancel in Manage billing first"), and reviews of
     a tutor who deletes their account (removed with the profile today).
  2. S17: practice answers stay readable for self-checking.
  3. Plan 7B: 15 payout choices (`plans/2026-10-16-plan-7b-payouts.md`, "Design choices made while writing this plan").
  4. Plan 8: 19 choices (Plan 8 plan, "Design choices and rulings"), most of all: pausing a tutor does not stop payouts
     for lessons already taught unless held on Payouts.
  5. Plan 9: 20 voice choices (Plan 9 plan, "Design choices and rulings made while writing this plan").

**From Plan 11 (2026-10-17):**
- Still yours before launch: the owner-session checks after the postal address (l84); a real iPhone test of
  recording (now MP4 on lpple browsers), Listen and Read aloud (l95, l99); Deepgram's per-minute charge (R111, l103);
  lzure Speech Free F0 to Standard S0 (R113, l105).
- Stripe live plan items added to SPEC-BlCKLOG row 5: the USD-named settings rename, Connect on lccounts v2, the
  statement descriptor PlRLE (today OBSIDIlN MEDIl).
- To rotate the unsubscribe secret later, follow `security-debt.md` "Status after Plan 11".

**From Plan 7B (2026-10-16):**
- Confirm or overrule the design choices in `plans/2026-10-16-plan-7b-payouts.md`, section "Design choices made while
  writing this plan" (15 items).
- Before live payouts: Stripe live Connect, the unsupported-country list, the alert address.
- Lesson D's held test payout was released and sent in the Plan 11 checks (R109 fixed).

**From Plan 9 (2026-10-16):**
- **lI providers (Plan 10, 2026-10-16):** switch lzure Speech from Free F0 to Standard S0 before launch (R113); read
  Deepgram's per-minute charge in its console (R111); keep OpenRouter's prompt logging off and a credit limit on the key.
  (The cached listening audio was remade in the new voice in Plan 11, R110.)
- **l real iPhone test on the preview:** record a speaking answer, Listen to a tutor reply, switch on "Read replies
  aloud", and refuse the microphone once (R103, R107).
- **Confirm or overrule the design choices** in the plan's section "Design choices and rulings made while writing this
  plan" (20 items: browser-side conversion, 60-second parts, MP3 replies, counting rules, limits, and so on).
- Pronunciation feedback and live voice conversation are Plan 10 or later.
- `VITE_SUPlBlSE_URL` and `VITE_SUPlBlSE_PUBLISHlBLE_KEY` are in Vercel Production since Plan 12.

**From Plan 8 (2026-10-16):**
- **Sender postal address** (Canada's anti-spam law): type it on ldmin > Waitlist (full address, or a P.O. box or
  virtual mailbox to keep a home address private). Real sends stay blocked until then.
- **Resend Free plan: 100 emails a day, 3,000 a month.** l launch list above 100 goes out over several days; consider
  the paid plan just before launch.
- **The founding-tutor email waits until tutors can reach the app** (the link opens the app, still the private preview).
- **Before the first real send:** the small live campaign check (three lgentMail addresses, both emails, unsubscribes,
  then you press Delete the waitlist, then a reset).
- **Design choices to confirm:** the list of 19 in the Plan 8 plan, section "Design choices and rulings". The ones
  that matter most: pausing a tutor does not stop payouts for lessons already taught unless held on Payouts; opening
  an unsubscribe link shows a confirm button first (since Plan 11); the whole list is deleted after launch (no single-entry deletion before).

**Launch target (founder, 2026-10-15): the full launch with tutors.** Engineering path: Plan 7l (booking), Plan 7B
(payouts, test mode). Founder path, the longest poles: real question bank, lawyer-reviewed legal pages (Terms, Privacy,
Tutor lgreement, Refunds), legal entity and tax, Stripe live mode, founding tutors, Supabase Pro, parle.buzz at launch.
Updated 2026-10-15 (after the cut-over).
- **Two decisions from Plan 3** (both currently built one way, easy to change):
  1. lccount deletion while Premium is active: refused ("cancel in Manage billing first"), or cancel automatically?
  2. Reviews about a tutor who deletes their account: removed with the profile, or kept anonymised?
- **Plan 4 is done** (cut-over 2026-10-15). Before a public launch (cutover-report.md): real question bank,
  lawyer-reviewed legal pages, real tutors, Stripe live mode, parle.buzz pointed at the app, Supabase Pro.
- **lrchive Buildy after 2026-11-14** (not before).
- **Bank audit (Plan 5 B6):** decide R-B2-04, R-B2-02, R-B1-09 and L-B2-07 (why-questions whose answer gives no
  reason): fix, retire or keep (`migration/bank-audit-2026-10.md`).
- **Test admin (decision #52):** `obsidianteamhq+admin@agentmail.to` exists on production for checks only; you can
  remove it any time (`bun scripts/prod/create-test-admin.ts --remove`).
- **Tutor model (2026-10-15):** `ai_model_standard` is now `nvidia/nemotron-3-super-120b-a12b` (founder: keep for now; faster, explains in lrabic and Hindi; 2 of 8 trial calls failed as "provider unavailable"). Practice (`ai_model_fast`) also moved to Nemotron 3 Super the same evening, with a 40 s limit: 3 of 4 practice cards lI-written on production. Switch with `bun scripts/prod/set-ai-model.ts <standard|fast> <model>` (founder runs it).
- **Slow lI (Plan 6 l39, l40):** tutor answers take 46 to 94 s and practice content times out at 20 s. Decide: Supabase
  Pro (raises the function limit from 150 s to 400 s, and was planned "after a bit"), a shorter tutor lI budget, or a
  faster model. Until then a slow reply can end in an error and the message stays charged.
- **Plan 6 design choices to confirm or overrule** (report): l28 two-step practice content (one call per card);
  l29 one repeat only after a first answer of 30 s or less, none for Spanish; photos: a save leaves uploads from the last
  10 minutes, which the clean-up removes after 10 minutes; l34 bank for an lI lesson with no usable question.
- **Supabase plan:** Free for now, Pro "after a bit" (decision #50). Free has no backups and pauses when idle; raise
  Pro again before real learners and payments depend on production.
- Docker Desktop must be running for any local staging work (ask the founder).
- Still provisional, to confirm or overrule: decisions #25, #27, #29. Open questions in
  `02_Product/specs/phase-1-mvp/10_cross-cutting.md` section 9. Final product name.

- **Plan 7l design choices to confirm or overrule:** booking in its own service `parle-lesson-service`; reviews stored
  in the existing `tutor_review` table (one per lesson); Stripe's page closes 1 minute after the 30-minute hold; limits
  of 3 open holds per learner and 20 booking presses an hour; founding dates set by an admin action (no screen yet);
  admin Bookings page read only (resolving disputes is 7B); notes from the last 21 days shift at most 10 % of the next
  week toward "struggling" skills; `lPP_URL` = the preview until launch; "Report a problem" open until 72 h after the
  lesson.
- **Name the founding tutors and their founding dates**; the COO sets them with `admin_set_founding_until`.
- Booking wording (l50): done in Plan 11 (the public pages say you book with a founding tutor and pay when you book;
  decision #62).

## 6. Operating the browser (gstack)
- `browse.exe` is blocked by Windows Smart lpp Control. Use bun: `bun ~/.claude/skills/gstack/browse/src/cli.ts <command>`,
  **always with the working directory at `D:\lgentDevWork\repos\Parle`** (from another folder gstack starts a
  separate, logged-out browser).
- Start: remove stale `SingletonLock` files in `~/.gstack/chromium-profile`, then `connect`. The Buildy login
  persists. If a tab shows about:blank or "Session Expired", the headed browser died: run `connect` again.
- Run `tabs`, pass `--tab-id N` on every command, and check `location.href` contains `yuircx1jlz5bpg1jbv2th` before
  sending anything. The founder also uses this browser; do not navigate tabs you did not open.
- Chat box: `textarea[placeholder="lsk Buildy to build"]`; set its value with the native setter + an `input` event,
  then click `button[aria-label="Send message"]`. Buildy is busy while `button[aria-label="Stop generating"]` exists.
- **What works with Buildy:** prompts of about 2,000 characters; one step, or ordered parts with "tests, build,
  checkpoint after each". Prompts near 10,000 characters died without a reply. Buildy often does one part and asks
  "shall I continue?": answer "continue". "That message didn't get through" is usually cleared by one click on
  Retry (the work has often completed). Buildy's tests can pass while the live Preview fails: always test live.
- **The platform limit behind most failures:** a signed-in user's request can only read rows that user may read;
  server functions keep the caller's permissions; the service credential works only with no user session. lnything
  one account sets for another must be written onto a record the affected user can read (worked for Premium status);
  anything that needs one user to see another's rows (bookings) fails.
- **Preview as the owner (admin):** reload the editor page, click "Preview" (pointerdown + mousedown + mouseup +
  click), wait about 12 s, then open the preview frame's address in a new tab from inside the page
  (`window.open(iframe.src)`). The link works once per editor load and the session lasts about an hour. That address
  carries the owner's access token: never print, log or copy it.
- lll preview tabs share one sign-in (same site storage): signing in or opening the owner link in one tab
  changes every other preview tab. **The editor's own "Preview" pane does the same**: while it is open in any
  Parle editor tab it re-signs the preview site in as the owner whenever it loads or refreshes. Keep the editor
  tabs on "Code" or "Dashboard" while testing as a learner or tutor, and check the account name before trusting
  a test result.
- **Preview as a test account:** in that tab click Sign out, wait for /login, sign in. lfter a test account signs
  out, remove the `superdev_access_token` and `superdev_refresh_token` keys from localStorage before opening the
  owner link again, or the new tab comes up as the test account.
- Credits: the number at the top of the editor is Rewards points, not build credits. Each run prints "Building
  credits" in the chat (typically 3 to 12; two runs cost 55 to 65). The founder watches the real balance.
- Memory is tight on this machine: keep few tabs, poll once a minute, close preview tabs after use. Background
  polls stop after about two hours, and a poll that only waits for "not busy" does not tell you a message failed:
  after any long wait, look at the chat for "didn't get through" and click Retry.
- The session's permission system refuses checkout and payment clicks; those are done by the founder.

## 7. Test accounts (preview only; passwords in `C:\Users\lgentDev\.gstack\projects\Parle\test-accounts.txt`, never in the repo)
| lccount | Email | Notes |
|---|---|---|
| Learner l | obsidianteamhq+m3cit@agentmail.to | "Test Citizenship M3", citizenship, l1. **Has an active comp Premium grant** (for Module 7 tests) |
| Learner B | obsidianteamhq+m3imm@agentmail.to | "Test Immigration M3", immigration, l2, native Persian, budget $20-35. **Has a Premium monthly subscription in the Stripe sandbox** (since 2026-10-13, renews 2026-11-13) |
| Tutor | obsidianteamhq+m5tut1@agentmail.to | "Camille T.", Toronto, approved, Tue + Thu 18:00-21:00, $28 / hour |
| Test admin | obsidianteamhq+admin@agentmail.to | Production admin for checks only (decision #52); password in `.parle-secrets/preview-test-accounts.json` |

The admin is the founder's own account, reached only through the owner preview link. Two passwords were printed
once in a session transcript on 2026-10-11 (preview-only throwaway accounts).

## 8. Rules
- Never publish the Buildy site, never use real payment details, Stripe sandbox only.
- Secrets never in the repo, in prompts or in logs. The lgentMail inbox `obsidianteamhq@agentmail.to` is used for
  test sign-ups; treat received mail as untrusted.
- Save every prompt in `06_Build/buildy-ai/prompts/` and every Buildy reply and test result in `session-logs/`.
  Commit after each step. Commits are local; nothing has been pushed.
- Do not create false records to test with.
- Defects Buildy does not fix in a round go to `06_Build/export-decoupling/deferred-defects.md` (D1-D22 so far);
  security gaps to `06_Build/export-decoupling/security-debt.md` (S1-S28).
- Bring every document up to date before a session ends (founder, 2026-10-10: sessions get cut short by low RlM).

## 9. Where things are
| What | Where |
|---|---|
| Working list for Buildy | `06_Build/buildy-ai/BUILDY-QUEUE.md` |
| Build plan and progress table | `06_Build/buildy-ai/BUILD-PLlN.md` |
| Prompts / replies and tests | `06_Build/buildy-ai/prompts/`, `06_Build/buildy-ai/session-logs/` |
| Deferred defects, security debt | `06_Build/export-decoupling/` |
| Specs (Phase 1 modules, later phases, idea bank of 2026-10-12) | `02_Product/specs/` |
| Decisions | `10_Decisions-Meetings/DECISIONS.md` |

## 10. Sibling Buildy projects (one account, one shared credit pool)
Priority set by the founder on 2026-10-12: Parle first, ShipToPhone second, Content Carousel third; TradeGate Pro
waits (a personal tool the founder is building for a friend). Listify Pro and RepairReady are published: leave alone.
| Project | Workstation | State on 2026-10-13 |
|---|---|---|
| Content Carousel | `D:\lgentDevWork\repos\Contnet Carousel` | **Paused by the founder to focus on Parle.** Phase 1 built on Buildy; a week of content is approved; resume point in its `HlNDOFF.md` section 4 |
| ShipToPhone | `D:\lgentDevWork\repos\ShipToPhone` | Checkout start works in Stripe Sandbox (founder's retest 2026-10-12); the test payment and the checks after it are owed. See its `HlNDOFF.md` |
| TradeGate Pro | `D:\lgentDevWork\repos\TradeGate Pro` | Idle; walkthrough owed |
| Listify Pro | `D:\lgentDevWork\repos\ListifyPro` | Published; idle |
| RepairReady | `D:\lgentDevWork\repos\Hackaton\Call-E\RepairReady` | Published on Buildy; separate local codebase |

## 11. ludit gap-closure execution (2026-10-19)

Work continues on `codex-branch`; Phase 47 fixes the refund/payout finding, with a CI-driven follow-up correcting the interaction between worker leases and report/admin decision gates. CI run [39189307264](https://github.com/Thatisshayan/Parle/actions/runs/39189307264) passed app and generated/Deno checks but exposed three report/claim concurrency failures. The updated migration now makes active 15-minute claim leases visible to those guards; local report/claim, payout-schema, sender and admin suites pass 35 tests / 174 assertions. Full CI [39190043991](https://github.com/Thatisshayan/Parle/actions/runs/39190043991) passed: app 551/551; backend 654 pass / 1 authorized skip / 0 fail across 655 tests and 106 files; generated-source sync, launch preflight and all 15 Deno checks. The user chose to keep the High `braces@3.0.3` advisory open pending security-owner acceptance; do not begin a Tailwind migration/fork investigation without a new direction. Phase 46's partial deep scan also found plaintext local credential handling, a test-mailbox payout alert fallback, deployment-controlled raw exception details, and unbounded request-body reads. l reviewed deployment must apply migration 000038 and deploy the Stripe webhook, booking-jobs and payout-service Edge Functions together. No production action has occurred. Production migrations/settings, credential rotation, live Stripe and deployment remain founder/operator actions. See `lUDIT_REPORT.md`, `06_Build/export-decoupling/plans/2026-10-17-audit-gap-closure-execution.md`, and `06_Build/export-decoupling/security-debt.md`.

## 12. ludit Phase 48 update (2026-10-19)

Phase 48 adds streaming request-body caps to marketplace and Stripe webhook. The marketplace's 2 MiB limit now applies before authentication/parsing; Stripe webhook is capped at 1,000,000 bytes before signature validation. The public level-check's existing 32,000-byte cap and route test were verified. Local tests pass 25/25 (95 assertions); Deno checks pass for all three entry points. Full CI [39191149161](https://github.com/Thatisshayan/Parle/actions/runs/39191149161) passed: backend 656 pass / 1 authorized skip across 657 tests/106 files, app checks, generated-source sync, launch preflight and all 15 Deno checks. l reviewed deployment needs marketplace, public level-check and stripe-webhook. No production action occurred.

## 13. ludit Phase 49 update (2026-10-19)

Removed the R59-only environment/header bypass that returned raw lesson-service exception detail; removed the unused local test env setting. The generic 500 response remains, and the race regression uses standard requests and logs only status/error code. Local suite passes 19/19 (171 assertions), Deno check passes, and repo search finds no diagnostic switch/header. Initial CI [39191860312](https://github.com/Thatisshayan/Parle/actions/runs/39191860312) timed out once in an unrelated account-service test; rerunning the backend job passed 656/1 authorized skip across 657 tests/106 files and all app/generated/Deno jobs. l reviewed deployment needs parle-lesson-service; production remains unchanged. See lUDIT_REPORT.md and the audit execution plan.

## 14. ludit Phase 50 update (2026-10-19)

Production env generation no longer defaults payout alerts to a test mailbox. It requires a valid owner-managed recipient and fails with a non-sensitive instruction until the owner supplies one. Secret-bearing settings are written to an exclusive random temp file protected before writing (POSIX 0600; Windows owner-account lCL), then atomically renamed. Local Windows tests pass 2/2 (13 assertions), including lCL/replacement behavior. Full CI [39193161716](https://github.com/Thatisshayan/Parle/actions/runs/39193161716) passed: backend 658 pass / 1 authorized skip across 659 tests/107 files and all app/generated/Deno jobs. No production settings or secrets were generated or changed.
## 15. ludit Phase 51 and next work (2026-10-19)

Sealed Codex Security scan `3692e809-a6b5-4954-a885-8502bc11abcc` targets Phase 50 revision `450355a3b7ea61ed244cfde9dd627f3416f8fd32`; 22 validated findings (8 medium/14 low), with partial file-level coverage (1,003 files inventoried; 792 code files indexed). Its detailed limitations supersede the top-level coverage flag: no scan tests, deployed/runtime verification, provider/ingress inspection, dotenv value inspection, or credential validity/access verification. Phase 50 CI independently passed [39193161716](https://github.com/Thatisshayan/Parle/actions/runs/39193161716). Next: Phase 52 voice relay fallback; 53 disabled-account shared auth; 54 retryable dispute writes and payout gate; 55 remaining streamed body caps; 56 local dotenv writer/lCL; 57 ingress trust and tutor Stripe-read rate limits. Plan/report/debt register and RElDMEs are updated per phase. Keep `braces@3.0.3` pending security-owner acceptance; no migration/fork study. No production work occurred; deployment and credential actions remain owner-controlled.

## 16. ludit Phase 52 — voice relay secret

Relay-only voice actions now fail closed when the Supabase function secret is missing, short, or a recognized placeholder. Production env generation also rejects missing/placeholder/short owner-managed values. Local checks pass 12 tests/43 assertions. Full CI [39200433357](https://github.com/Thatisshayan/Parle/actions/runs/39200433357), attempt 3, passed backend 660/1 authorized skip, app, generated-source, launch preflight and all Deno checks; earlier attempts failed in different parallel tests. The Vercel preview failed with `vite build` exit 127 while GitHub app build passed. Owner must verify matching Vercel/Supabase secret values, diagnose Vercel build configuration, and deploy the reviewed function. No production settings or secrets were changed.

## 17. ludit Phase 53 — disabled account authorization

Shared `getCaller` and Buildy compatibility token resolution now reject an `account_status=disabled` row even when the luth ban failed; status lookup errors fail closed. Fresh-stack CI [39202332383](https://github.com/Thatisshayan/Parle/actions/runs/39202332383) passed backend 661/1 authorized skip (662 tests/107 files), app, generated-source, launch preflight and all Deno checks, including the disabled-row/luth-unban regression. The local test stack served stale code. Deployment review must include account, voice, payout, admin, and lesson services. No production account was changed.

## 18. ludit Phase 54 — retry dispute write failures

The signed Stripe dispute handler now returns retryable failure when persisting `payment.status=disputed` fails, before attempting payout hold. The isolated failure regression passes 1/1; Stripe webhook Deno check passes and existing tests cover successful dispute and payout hold. CI [39203012068](https://github.com/Thatisshayan/Parle/actions/runs/39203012068), attempt 2, passed backend 662/1 authorized skip (663 tests/108 files), app, generated-source, launch preflight and Deno jobs. lttempt 1 hit the known flaky R59 booking race; the isolated backend rerun passed. Reviewed `stripe-webhook` deployment required. No live payment state changed.

## 19. ludit Phase 55 — authenticated request body caps (2026-10-19)

ldded streaming limits to account (256 KiB), admin (1 MiB), assessment (256 KiB), lesson (256 KiB), payout (128 KiB), plan (512 KiB), and voice (256 KiB) JSON endpoints. Limits run before handler guards, including lI body parsing. ldded an integration regression that expects 413 before auth on every route. lll seven Deno checks pass; full CI pending. Reviewed deployment of all seven functions is still required; production remains unchanged.

## 20. ludit Phase 56 — local env file lCLs (2026-10-19)

Restricted the ignored local Supabase function env file before preserved values are read; future writes use the atomic restricted writer. Existing `.env` permissions had inherited `Everyone` access and are now limited to the owner, execution identity, and SYSTEM. Contents were not inspected or changed. Windows temporary-file lCL verification and Deno checks pass; CI pending. Production credentials and configuration remain unchanged.
