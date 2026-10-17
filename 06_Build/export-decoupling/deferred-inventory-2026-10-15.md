# Deferred items: inventory after the cut-over

Plan 12 (review minors, iPhone emulation, launch readiness) done on 2026-10-17; see `migration/close-out-report.md` (Plan 12 sections) and "Plan 12 rulings" in `deferred-defects.md`. A113-A121 done; R130 and R131 found and fixed; A95 and A99 narrowed to a short real-iPhone check. New: A122-A126 (R132-R136).

Plan 11 (pre-launch close-out) done on 2026-10-17; see `migration/close-out-report.md` (Plan 11 sections) and the "Plan 11 rulings" block in `deferred-defects.md`. 56 items fixed, 7 accepted, 3 moved to the Stripe live plan, A94 decided (#61); A84, A95, A99 (iPhone), A103 and A105 stay with the founder. New: A113-A121 (R121-R129, final review minors).

Plan 10 (production AI providers) done on 2026-10-16; see `migration/close-out-report.md` (Plan 10 sections). A93 and A100 done; new: A102-A112 (R110-R120).

Plan 7B (tutor payouts, test mode) checks done on 2026-10-16; see `migration/close-out-report.md` ("Plan 7B checks"). New: A101 (R109).

Plan 9 (voice: natural French voice and scored speaking) done on 2026-10-16; see `migration/close-out-report.md` (Plan 9 sections). New: A88-A99 (Plan 9 final review minors, known items, checks; R96-R107).

Plan 8 (account administration and the waitlist launch email) done on 2026-10-16; see `migration/close-out-report.md` (Plan 8 sections). New: A73-A85 (Plan 8 final review, rulings, checks; R81-R93). Plan 7B (tutor payouts, CAD) merged 2026-10-16: A60-A72 (R68-R80).

Plan 7A (tutor lesson booking, Stripe test mode) done on 2026-10-16; see `migration/close-out-report.md` (Plan 7A sections). New: A50 (check) and A51-A59 (Plan 7A final review, R59-R67).

Group A and B items A28-A38, B4, B5 handled by Plan 6 on 2026-10-15; see `migration/close-out-report.md` (Plan 6 sections). New: A39, A40 (checks) and A41-A49 (Plan 6 final review, R49-R57).

Groups A and B closed by Plan 5 on 2026-10-15 (A1-A27 done, B1-B8 run); see `migration/close-out-report.md`. New: A28, A29 (checks) and A30-A38 (Plan 5 final review, R38-R46).

Date: 2026-10-15. Every open item from `deferred-defects.md` (D-list and R-register) and `security-debt.md`, sorted into
four groups. The founder asked to close the list; groups A and B become the next plan ("close-out plan"), C needs a
spec per feature first (`specs/SPEC-BACKLOG.md`), D is content and business work.

Closed or fixed items are not repeated here; see the two source files.

## Group A: code fixes (next plan)

Each fix gets a test that fails first. Order: security, then data safety and reliability, then display.

| # | Item | Problem | Fix | Status |
|---|---|---|---|---|
| A1 | R10 (Sec) | Account service accepts any `photo_url`, unchecked `native_language` / `track`; tutors can call learner actions | Validate against the known lists and our storage address; refuse learner actions for tutors | done (cb1c9ce) |
| A2 | R12 (Sec) | Sign-out while offline can leave the session in memory | Clear local session even when the server call fails; reload after sign-out | done (03956a8) |
| A3 | R21 (Sec) | `get_or_create_plan` accepts planning date, week number and "what changed" note from the browser | Server decides these; ignore browser values | done (cd1b0e0) |
| A4 | R23 (Sec) | Scheduled-job secret compared with a plain string comparison | Constant-time comparison (`sameSecret`) | done (0e8c615) |
| A5 | R25 (Sec) | "Not allowed" for another person's row vs "not found" for a missing row reveals that the row exists | Answer "not found" for both | done (3fd6347) |
| A6 | R32 (Sec) | An exception in a function reaches the browser without CORS headers; `Vary: Origin` only on allowed answers | try/catch in `serveWith` returning a CORS-wrapped 500; always set `Vary` | done (0e8c615) |
| A7 | R13 (Sec) | Old profile photos never deleted, no per-user limit, file type taken from the browser | Delete the previous photo on replace; size and count limit; check the file's real type | done (ef3f335) |
| A8 | R20 | Two simultaneous "finish" calls can save two placement results | Claim the run first (one finish per run) | done (74d4ac6) |
| A9 | R19 | The placement writing score can be requested again for the same test (AI cost, overwrite) | Score once per run; return the saved score | done (74d4ac6) |
| A10 | R11 | Two simultaneous first saves of a profile return an error | Upsert | done (0250932) |
| A11 | R27 | One checkout's three Stripe events race; two answer 500 until Stripe retries | Retry the sync once on a unique-key conflict | done (0250932) |
| A12 | R30 | Webhook skips an unknown subscription without a log line | Log a warning with the event type; answer `handled: "missing"` | done (b2b82f3) |
| A13 | R17 | Account deletion ignores a failed subscription read and photo-removal errors; photo listing stops at 100 | Refuse deletion when the subscription cannot be read; page through photos; report removal errors | done (b2b82f3) |
| A14 | R24 | Daily billing re-check reads at most 1,000 subscribers, one by one | Page through all subscribers | done (b2b82f3) |
| A15 | R34 | "No learner profile" detected by matching an English sentence | Error code from the plan engine | done (cd1b0e0) |
| A16 | R29 | Onboarding: failed sign-in check brings back the 7-step flow; "STEP 7 OF 6"; `aria-valuemax` 7 | Retry the check, clamp the step, fix the progress bar | done (c43af9c) |
| A17 | D25 (a) | AI tutor shows "Free plan" until a chat opens, even for Premium | Read the plan summary on page load | done (4c47d0a) |
| A18 | R14 | Errors when re-sending the sign-up code are not shown | Show the error message | done (4c47d0a) |
| A19 | D23 | Audit log shows question-bank edits without old and new values | Record and show changed fields, as for settings | done (4c47d0a) |
| A20 | D13 | AI tutor replies to A1 learners mix in too much English | Tune the A1 instruction in the tutor prompt (checked in B) | done (e03e6ea) |
| A21 | D25 (b) | AI lesson items can repeat the answer inside the question stem | Reject such items in the content check (falls back to the bank) | done (e03e6ea) |
| A22 | R31 | Migration 000019 gaps: mixed policies skipped, waitlist visited, `is_admin()` per row | Follow-up migration: exclude the waitlist, wrap `is_admin()`, test mixed policies | done (0a3b6d3) |
| A23 | R33 | The cut-over clean stops half-way on a concurrent waitlist sign-up | Check that the waitlist did not shrink | done (d0316d3) |
| A24 | R35 | The loader never demotes a former admin; existing logins keep old roles | Set every login's role on each load | done (d0316d3) |
| A25 | R9 | After choosing a role, the browser token keeps the old role until it refreshes | Refresh the session after `ensure_identity` | done (03956a8) |
| A26 | R15 | No automated test of the unverified-email branch or of sign-out clearing storage | Add the tests | done (03956a8) |
| A27 | R4 | Test-account helper rewrites every line sharing a label | Match the exact line | done (d0316d3) |
| A28 | D1, R36 | First Today for a new learner takes 21.3 s on production (B1) | Build practice content in the background or at plan creation; show the plan at once | done, Plan 6 (commits f11b966, 1cb3401; tests fn-task-content.test.ts, task-content-queue.test.ts): first Today 1.5 s |
| A29 | D12, R37 | Explanations in the learner's language: Arabic none, Spanish only a closing question (B4) | Strengthen the explain-in-native instruction; check the reply's script | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A30 | R38 | Onboarding at step 7 after a failed sign-in check still shows the account step; the password step flashes while checking | Re-check when the step is 6 or more; neutral state while checking | done, Plan 6 (commit 16051ab, test onboarding-steps.test.ts) |
| A31 | R39 | Two photo saves at once can delete each other's file | Delete only files older than the saved one | done, Plan 6 (commit 3fb8418, tests account-service.test.ts, profile-photo.test.ts) |
| A32 | R40 | Ten unsaved uploads block further photo uploads with a generic error | Clean up on page load, or say so | done, Plan 6 (commit 3fb8418, tests account-service.test.ts, image-kind.test.ts) |
| A33 | R41 | A brief storage error is reported as "not a photo" and deletes the upload | Tell a storage error apart; read only the first bytes | done, Plan 6 (commit 3fb8418, test profile-photo.test.ts) |
| A34 | R42 | An AI lesson with all questions dropped can show a passage with no questions | Decide, then use the bank for lessons too | done, Plan 6 (commit f3813da, test practice-content.test.ts) |
| A35 | R43 | Tutor badge stays "Checking your plan" if the plan summary fails | Fall back after an error; read the summary once | done, Plan 6 (commit 699e011, test ai-tutor.test.ts) |
| A36 | R44 | New refusals (language, subscription unreadable) show only a generic error | Map them to messages | done, Plan 6 (commit 699e011, test settings-errors.test.ts) |
| A37 | R45 | One rate-limit row per placement run stays until the 2-day clean-up | None needed (harmless) | closed, no change (harmless) |
| A38 | R46 | Local only: a browser on localhost gets PHOTO_INVALID | Accept both local addresses | done, Plan 6 (commit 3fb8418, test profile-photo.test.ts) |
| A39 | R47 | AI practice content times out at 20 s, so every card waits about 22 s and shows bank content | Faster model, or a longer budget for the per-task call | mostly done 2026-10-15: practice limit 40 s (commit 1455191) and practice model switched to Nemotron 3 Super by the founder; production check: 3 of 4 cards AI-written in 21 to 31 s, the 4th failed the content check and used the bank (as designed); watch |
| A40 | R48 | Slow tutor answers end in 546 on the Free plan's 150 s worker limit; the message stays charged | Supabase Pro, or a shorter tutor AI budget (founder decision) | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A41 | R49 | Two tabs, or reopening Today within about 22 s, prepare the same task twice (no visible effect; about double AI calls) | Claim the row before the AI call | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A42 | R50 | A photo save racing the pre-upload clean-up can point the profile at a deleted file (Save is not disabled while a photo uploads) | Disable Save while a photo uploads | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A43 | R51 | An upload removed meanwhile answers "That file is not a photo" | Own message for a missing upload | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A44 | R52 | A failing clean-up before an upload is silent | Log the failure | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A45 | R53 | A page cached from before the Plan 6 deploy shows pending cards without material until it reloads | None (reload) | accepted (Plan 11 ruling, 2026-10-17) |
| A46 | R54 | The Review Focus 5 test does not check that the message was charged once | Extend the test | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A47 | R55 | A plan rebuilt while a task is being prepared can save content for the old topic | Compare before writing | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A48 | R56 | PrepareMyTaskContent reads up to 500 task rows twice per call | Filter by id | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A49 | R57 | A writing, speaking or lesson card marked "unavailable" is never retried, though its message says to refresh | Retry on refresh | DONE 2026-10-17 (Plan 11 Task 1; live-checked where the close-out report lists it) |
| A50 | R58 | Public pages and the homepage still say booking is coming soon | Founder chooses the wording (test mode now, live at launch) | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A51 | R59 | Two Book presses arriving within about a second can answer "That time was just taken" against the learner's own hold; the own hold shows as busy after Back | Re-read a fresh own hold; leave own holds out of the busy list | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A52 | R60 | Moving a lesson does not first expire lapsed holds, so a time shown free can be refused for up to 10 minutes | Expire lapsed holds inside lesson_reschedule | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A53 | R61 | Learner and tutor cancelling at once (or cancel during deletion): the second sees "could not reach our payment provider" though the refund happened | Lock the booking first, or treat "already refunded" as success | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A54 | R62 | The cancellation email says "less than 24 hours, not refunded" whenever no money moves (e.g. a tutor cancel after an earlier dashboard refund) | Choose the wording from who cancelled and the refund history | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A55 | R63 | After a slot_lost refund the learner back from Stripe sees "still confirming" and the lesson is hidden; the email always says "booked by someone else"; no email when the tutor was deleted | Show a "refunded" banner; reason-specific wording | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A56 | R64 | Account deletion can stop after lessons were cancelled and refunded (a later step failing), leaving the account with its lessons cancelled | Accept, or check photos before the lesson step | DONE 2026-10-17 (Plan 11 Task 2: storage listed before the refunds); the rest accepted (Plan 11 ruling) |
| A57 | R65 | The booking read rule shows whole rows: a tutor can read pending and expired holds (learner message), a learner sees commission_pct | Column grants, or limit the tutor rule to confirmed and later | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A58 | R66 | Stripe page expiry is the hold plus 60 s against Stripe's 30-minute minimum; clock skew could breach it | Add 2-3 minutes | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A59 | R67 | A payment landing in the seconds between "holds expired" and the login deletion confirms a lesson with no learner and no refund | Re-check after the login deletion | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A60 | R68 | Auto-release can miss its moment: a job holding a payout as account_not_ready just after account.updated enabled the account leaves it held; out-of-order account.updated can win | Add a job step releasing account_not_ready holds whose account is enabled; re-read the account from Stripe in the webhook | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A61 | R69 | A learner's report overwrites a transfer_failed hold reason, so a later Release does not bump the transfer attempt and Stripe replays the old failure for 24 h | Bump the attempt whenever a payout was ever claimed | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A62 | R70 | A crashed refund decision is unprotected after 5 minutes: if Stripe refunded but the function died before payout_decide, another admin could Release (tutor paid and learner refunded) | Before release or split, refuse when a refund row with reason admin exists; reword the 'Nothing changed' message | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A63 | R71 | Refund-after-payout reversal after a split uses the full price as base (a later refund of $30 reverses $18 instead of $24); follows the plan's formula | Use the payment minus refunds made before the payout as base | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A64 | R72 | Chargeback items never leave the Payouts 'after payout' list, and a second refund-after-payout with another amount hits Stripe's idempotency error | Hide items already decided as refund_after_payout | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A65 | R73 | The Connect account key per hour still replays a refusal for up to 60 min (message says 'a few minutes'); a retry across the hour can create a second Express account; the fake keys on the tutor only | Store an attempt counter on tutor_payout_account and key on it; insert-if-absent the account id | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A66 | R74 | Webhook: event dedupe is read-then-write; the Connect secret is not limited to account events and the platform secret not to transfer events | Restrict each secret to its event types | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A67 | R75 | 7A refund double count reachable from 7B admin refunds: charge.refunded landing before lesson_record_refund counts refunded_cents twice | Make lesson_record_refund set refunded_cents to the sum of refund rows | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A68 | R76 | Test gaps: the Review Focus 1 test is sequential, not concurrent | Add a Promise.all variant | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A69 | R77 | Ruling: the setting key minimum_lesson_charge_usd and column hourly_rate_usd keep their names though amounts are CAD (decision #55) | Rename in a data migration when convenient | moved to backlog row 5 (Stripe live plan, Plan 11) |
| A70 | R78 | Ruling: Earnings shows the tutor's share; for the test-mode lessons paid in USD before the CAD switch the CAD actually sent (payout.transfer_cents) is recorded but not shown | Show transfer_cents when it differs (test data only today) | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A71 | R79 | Stripe 'Accounts v1 support' was switched on so Express accounts can be created; Stripe steers new Connect platforms to Accounts v2 | Move account creation to Accounts v2 before live payouts | moved to backlog row 5 (Stripe live plan, Plan 11) |
| A72 | R80 | The account's statement descriptor is 'OBSIDIAN MEDIA' | Change to PARLE before live payments | moved to backlog row 5 (Stripe live plan, Plan 11) |
| A73 | R81 | Routine admin actions (approval, demo reviews) republish a paused tutor's listing; bookings stay refused | Skip publishing while account_status is disabled | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A74 | R82 | Send can show 'unsaved' after a save when the text had trailing spaces or line breaks (a reload fixes it) | Use the stored text the server returns | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A75 | R83 | Pacing 600 ms x 50 per run every minute leaves little room under Resend's 2 requests per second; runs can overlap with lesson mail | About 1000 ms pacing or 30 per run | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A76 | R84 | A missing unsubscribe secret makes every sending run fail without a reason on the page; last_error is not cleared when sending resumes | Write and clear last_error | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A77 | R85 | Rotating WAITLIST_UNSUBSCRIBE_SECRET would break unsubscribe links already sent (CASL expects 60 days) | Never rotate, or accept the previous secret too | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A78 | R86 | The parle.buzz unsubscribe page shows a 429 or 500 as 'not valid', and posts on load (mail scanners that run scripts could unsubscribe someone) | Separate messages; consider a confirm button | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A79 | R87 | The Send explanation's count includes unsubscribed people and counts someone listed as learner and tutor twice | Count the addresses that would be queued | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A80 | R88 | Choosing 'keep' leaves payment holds open: a learner already on Stripe Checkout can still pay the paused tutor | End holds on every pause | DONE 2026-10-17 (Plan 11 Task 2; live-checked where the close-out report lists it) |
| A81 | R89 | An access token issued before a pause can read the person's own rows (PostgREST, Storage) for up to an hour; every server function refuses it | Accepted; shorten the token lifetime if needed | accepted (Plan 11 ruling, 2026-10-17) |
| A82 | R90 | The Buildy-era admin_get_metrics action is unused since the Metrics page reads the server's numbers | Remove it | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A83 | R91 | Account_status and paused-lesson lists read at most 1,000 to 5,000 rows per request | Page them when needed | accepted (Plan 11 ruling, 2026-10-17) |
| A84 | R92 | Owner-session checks not run live: invite and remove an administrator, the founder's own test sends, the small campaign, the list deletion and the reset (founder's call, 2026-10-16) | Run before the first real send, after the postal address is set | open (founder: owner-session checks after the postal address) |
| A85 | R93 | Www.parle.buzz serves the site without redirecting; APP_ORIGINS lists only https://parle.buzz (every unsubscribe link uses https://parle.buzz) | Redirect www to the apex, or add www to APP_ORIGINS | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A86 | R94 | FIXED 2026-10-16 (bank readers). Was LAUNCH BLOCKER: the real question bank would never be served (placement, check-in and app selectors read demo items only, capped at 150/100 and 150/40); the public level check mixes demo and real | One bank switch (default real), every reader filters by it, limits raised or paged, tests with 360 real items; before the bank import | done 2026-10-16 (bank readers fix); the import itself waits for the Lesson Bank hand-over |
| A87 | R95 | The preview click-through logs "tutor session could not open: Failed to fetch" though the tutor opened and replied | Find and abort the second request when leaving the page | DONE 2026-10-17 (Plan 11 Task 4; live-checked where the close-out report lists it) |
| A88 | R96 | Replaying a reply ('again') is not counted, so one account can make about 100 speech calls an hour | cap replays per day, or keep the reply audio for a short time | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A89 | R97 | A failed listening-audio generation keeps its claim, so that item answers 'audio being made' for 90 seconds before it can be tried again | a relay-only release of the claim on failure | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A90 | R98 | A 1,100-character speak request can take three 30-second speech calls (Azure since Plan 10) and pass Vercel's 60-second limit | one overall time budget of about 50 seconds | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A91 | R99 | Tutor messages that exist only in the page (no saved id) call the relay and show 'not available' when Listen is pressed | skip the relay for them and use the browser voice | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A92 | R100 | Placement speaking scoring can save into a run already finished in another tab (no status guard on the save) | guard the save on the run still being open | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A93 | R101 | LAUNCH BLOCKER: NVIDIA's trial terms forbid production use and let NVIDIA use content to improve its models; voice runs on them | Paid provider allowing production, founder's choice | DONE 2026-10-16 (Plan 10) |
| A94 | R102 | The AI tutor's microphone is offered only in speaking mode | product choice to confirm | DECIDED 2026-10-17: Speaking mode only (decision #61, Plan 11) |
| A95 | R103 | 'Read replies aloud' on phones: the audio is unlocked by the learner's tap (Listen, the switch, Send); if a phone still refuses, the page says 'Tap Listen to hear this reply.' Not yet tried on a real iPhone | real-iPhone check | narrowed (Plan 12): emulated iPhone fixed the unlock clip (R131); open: founder plays one reply on a real iPhone |
| A96 | R104 | A learner's task audio links last one hour; a replay after that fetches a new link | accepted (by design) | accepted (Plan 11 ruling, 2026-10-17) |
| A97 | R105 | 'Listen slowly' plays the same audio at 0.75 speed (not slower speech) | accepted (product choice to confirm) | accepted (Plan 11 ruling, 2026-10-17) |
| A98 | R106 | The AI tutor's old browser speech-recognition state (speechListening, speechNote and the recognition ref) remains in LearnerTutorPlaceholder.tsx, no longer used by the microphone | remove in a cleanup | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A99 | R107 | The 'microphone is blocked' message was not seen in the headless check (the typed-answer path passed); recording and playback in iPhone Safari not yet tried (the browser records WebM before MP4) | real-iPhone check; prefer audio/mp4 on Safari if recording fails | DONE in code 2026-10-17 (Plan 11); Plan 12 emulation: WebKit on Windows has no MediaRecorder; open: founder records one answer on a real iPhone |
| A100 | R108 | LAUNCH BLOCKER: all AI text features run on the same NVIDIA trial API | Paid OpenAI-compatible provider (URL and key change), founder's choice | DONE 2026-10-16 (Plan 10) |
| A101 | R109 | A payout whose lesson charge already carries a Stripe transfer group is refused and held; Release cannot send it | Transfer without our group when the charge has one, or refund | DONE 2026-10-17 (Plan 11 Task 3; live-checked where the close-out report lists it) |
| A102 | R110 | Listening audio already cached was made in NVIDIA's voice (Louise); it stays until an administrator prepares it again | Admin > Content > Prepare audio for the cached items before launch | DONE 2026-10-17 (Plan 11 Task 9; live-checked where the close-out report lists it) |
| A103 | R111 | Deepgram's price with the training opt-out (mip_opt_out) is not published; listed $0.0043/min | founder reads the per-minute charge in the Deepgram console (Usage); fallback OpenAI transcription behind the same relay | open (founder: Deepgram price, R111) |
| A104 | R112 | Text AI depends on OpenRouter alone: an OpenRouter outage shows the usual "not available" messages and the approved bank | accepted for launch; a second route (the provider's own API) is a URL and key change | accepted (Plan 11 ruling, 2026-10-17) |
| A105 | R113 | The Azure Speech resource is on the free tier F0 (0.5 million characters a month, then requests fail) | switch to Standard S0 before launch (resource > Pricing tier) | open (founder: Azure S0) |
| A106 | R114 | Set-ai-model.ts does not bump updated_at, and an update matching 0 rows reports no error (--check shows the values) | (see R row) | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A107 | R115 | The privacy page names OpenAI as fixed text; switching to another model's company needs a wording change | the switch script could warn when the author is not openai/ | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A108 | R116 | XML-invalid control characters are not stripped before the SSML; Azure answers 400 and the learner sees "Voice is busy" (rare) | (see R row) | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A109 | R117 | A malformed 200 from Deepgram reads as an empty transcript ("couldn't hear enough") instead of "Voice is busy", unlogged | (see R row) | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A110 | R118 | Deepgram smart_format writes spoken numbers as digits, slightly changing word counts and quoted corrections | consider punctuate=true | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A111 | R119 | An empty 200 from Azure gives a silent MP3 instead of "Voice is busy" | (see R row) | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A112 | R120 | Reasoning tokens count against max_tokens 4096; a cut-off reply is not logged as such | log finish_reason length | DONE 2026-10-17 (Plan 11 Task 5; live-checked where the close-out report lists it) |
| A113 | R121 | Account deletion while the tutor cancels the same lesson shows the learner "could not refund" though the tutor's cancel refunds it; a retry works (deletion.ts) | wait for the other cancel as cancelLesson does | DONE 2026-10-17 (Plan 12) |
| A114 | R122 | A webhook claim left by a killed worker answers Stripe's retries as duplicate; a lost transfer.reversed drops the outside-reversal alert (payouts/webhook.ts) | claim time plus processed mark; retake a stale claim | DONE 2026-10-17 (Plan 12) |
| A115 | R123 | The A101 fallback pages through every past transfer of the tutor for each new payout (payments.ts findTransfer) | fall back only when the charge has a group or the payout was claimed before; or limit by created date | DONE 2026-10-17 (Plan 12) |
| A116 | R124 | A Connect account call that times out counts as a refusal, so a retry can make a second, orphaned Connect account (payouts/accounts.ts) | raise the attempt number only on a Stripe 4xx | DONE 2026-10-17 (Plan 12) |
| A117 | R125 | Many abandoned expired holds can push real lessons out of the learner's 100-row list (booking.ts listLessons) | keep only slot_lost expired rows in the query | DONE 2026-10-17 (Plan 12) |
| A118 | R126 | A paused learner's slot-lost email says the tutor is not taking lessons (confirm.ts reason) | a reason and approved wording for a paused learner | DONE 2026-10-17 (Plan 12) |
| A119 | R127 | A start time overlapping the learner's own held time shows free but answers "just taken" until the hold lapses (store.ts blockedRanges) | hide only the exact own-hold time, or resume it | DONE 2026-10-17 (Plan 12) |
| A120 | R128 | Counting the tutor message after the AI reply lets concurrent sends with 1 message left each run the AI; a loser's message has no reply (parle-tutor-service.helper.ts) | a short claim before the AI call | DONE 2026-10-17 (Plan 12) |
| A121 | R129 | A second chargeback decision after payout: whether refund_cents is a running total or an extra amount is undefined (payouts/admin.ts) | define it in the payouts spec; then test 1000 then 2000 | DONE 2026-10-17 (Plan 12) |
| A122 | R133 | A late payment for a hold the learner replaced gets the "booked by someone else" refund email | a "replaced" reason with approved wording | open (Plan 12 final review minor) |
| A123 | R134 | payouts/send.ts casts the payout row to a type without created_at | add created_at to the cast | open (Plan 12 final review minor) |
| A124 | R135 | Stripe idempotency errors count as Connect refusals | treat 400 idempotency_error and 409 as not refused | open (Plan 12 final review minor) |
| A125 | R136 | Test gaps: R127 with another tutor's hold; R128 release after a 502 or thrown error; the launch switch's live path | add the tests | open (Plan 12 final review minor) |
| A126 | R132 | Three plan-service tests pass only Monday to Friday | date-independent tests; founder question on a weekend start | open (Plan 12 final suite) |

## Group B: checks on the real system (same plan)

| # | Item | What to check | Who | Status |
|---|---|---|---|---|
| B1 | D1 | Time to first Today for a new learner on production; if over about 10 s, plan the background build (then group A) | Claude | done: first Today 1.5 s by API, 2.2 s in the browser since Plan 6 (D1 closed) |
| B2 | D2 | Check-in options are shuffled between displays and scored by option id | Claude | shuffled on each load: D2 closed |
| B3 | D10 | The AI message count resets at the learner's local midnight | Claude (local, time zone set near midnight) | resets at local midnight: D10 closed |
| B4 | D12 (non-voice) | A2 vs B2 explanations differ; explanations in Arabic, Spanish, Hindi; a tutor task from Today is marked done | Claude | Plan 5: levels differ, Hindi ok. Plan 6: task hand-off passes (B4 check); language part stays with A29 |
| B5 | D21 | Question-bank screens refuse non-admins on the server; commission text follows the setting; Settings / Audit / Users at 375 px | Claude | Plan 5: server half closed. Plan 6: commission sentence follows 25 % and 20 %; Settings, Audit log, Users fit 375 px: D21 closed |
| B6 | D3 | Audit all 137 bank items (121 questions + 16 prompts) and list the problems | Claude lists, founder decides | 137 items, 4 why-questions flagged for the founder |
| B7 | D13 / A20 | A1 tutor replies after the prompt change | Claude | French first, at most one English line: D13 closed |
| B8 | R28 | How often AI practice content fails its check (production logs) | Claude, after launch too | too little traffic: watch after launch |

## Group C: features that need a spec first (`specs/SPEC-BACKLOG.md`)

| Backlog | Covers |
|---|---|
| 1 Full booking flow | D17, D18, R18, R2 |
| 2 Tutor payouts | Stripe Connect, commission, refunds |
| 3 Voice | S8, D12 (play-aloud, speech recognition) |
| 4 Waitlist launch email | D29 (rest) |
| 7 Account administration | D19, D20, D24 |

## Group D: content and business (founder)

| Item | Note |
|---|---|
| D28 Legal pages | Lawyer-reviewed Terms, Privacy, Tutor Agreement, Refunds |
| D3 Real question bank | 360 launch-ready items; today 121 test items |
| Stripe live mode | SPEC-BACKLOG 5 |
| Real tutors | Founding tutors (decision #22) |
| Supabase Pro | Decision #50 |
| parle.buzz to the app | At launch |
| S17 (accepted) | Practice answers stay readable for self-checking; confirm or change |
| Plan 3 decisions | Deletion while Premium; reviews of a deleted tutor |
