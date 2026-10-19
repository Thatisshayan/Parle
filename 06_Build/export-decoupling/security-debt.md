# Security debt register (Buildy phase -> fix at export)

Decision #26: Buildy build is a test-only demo. Everything below MUST be fixed on our own stack before real users or
real money. Each module adds its rows.

| # | Module | Gap on Buildy | Fix on own stack |
|---|---|---|---|
| S1 | 1 | No email verification | Auth provider email confirmation (e.g. Supabase Auth) |
| S2 | 1 | No account deletion | Server-side delete of auth user + data, 30-day job |
| S3 | 1 | Role record user-creatable; duplicates possible | Role set server-side only, unique constraint on user_id |
| S4 | 1 | No Google sign-in | OAuth provider |
| S5 | all | User-initiated functions can't write protected data; no unique constraints/transactions/atomic counters | Service-role server functions, RLS, constraints, transactions |
| S6 | 2 | Learner can edit own placement result/status records | Results written only by server after scoring |
| S7 | 2 | Duplicate learner_profile / placement_result possible | Unique constraints |
| S8 | 2 | No TTS/STT on Buildy: listening = transcripts, speaking unassessed | Provider via AI service layer (e.g. Deepgram, as in Alphonso) |
| S9 | 2 | Answer keys readable by signed-in users; scoring in browser | Server-side scoring, keys never sent to client |
| S10 | 2 | Writing-scoring function has no per-learner usage limit | Server-enforced limits |
| S11 | 3 | Learner can edit own skill estimates, check-ins, roadmap, week plans and tasks | Written only by server functions after scoring; RLS read-only for the learner |
| S12 | 3 | Check-in answer keys readable by signed-in learners; check-in scored in the browser | Server-side scoring, keys never sent to client |
| S13 | 3 | Problem reports: task ownership checked in the app only; forged task reference or status possible | RLS + server-side ownership check |
| S14 | 3 | No unique constraints or atomic updates: duplicate plans or check-ins on simultaneous submits | Unique (user, week) constraints, transactions |
| S15 | 3 | Practice generation and writing scoring have no rate limit | Server-enforced per-learner limits |
| S16 | 3 | Onboarding state stays in sessionStorage after sign-out; refresh token remains in localStorage after sign-out (validity to confirm) | Clear client state on sign-out; revoke refresh tokens server-side |
| S17 | 3 | Correct answer ids and explanations are stored with learner-owned practice content; a learner can read the key before answering | Keys stay on the server; score on the server |
| S18 | 3, 4, 7 | Learners can edit their own task, progress, check-in and usage-counter records directly, so completion, progress and the daily AI limit are self-reported; simultaneous requests can race past the limit | Server-only writes, atomic counters |
| S19 | 5 | Access rules cannot tell learners from tutors for direct data requests; a signed-in tutor may read published tutor profiles; system record details may reveal the administrator's email | Role-aware row-level rules; no creator email in public rows |
| S20 | 5 | Demo reviews use generated lesson references; one-reply rule can be bypassed by direct record changes | Reviews tied to completed bookings; server-enforced uniqueness |
| S21 | 5 | New accounts are signed in without email verification (seen at tutor sign-up; also D16) | Verified email before any action |
| S22 | 6 | A learner's request cannot see other learners' bookings, so double booking cannot be prevented; a public busy-time list would expose creator emails and allow fake blocks; learners could forge requests and tutors edit all booking fields directly | Bookings written only by server functions under a unique (tutor, start) constraint |
| S23 | 8 | Signed-in users can read the settings values and some question-bank records | Settings exposed through a server endpoint that returns only what the client needs; bank readable by admins and the test service only |
| S24 | 8 | An admin editing data directly bypasses the audit log; a setting and its audit row are written separately and are not atomic | Audit written in the same transaction by server code; no direct table edits |
| S25 | 8 | Admin role checks are not applied to the question-bank screens and their reads / writes | Server-side admin check on every admin route |
| S26 | 7 | Premium status sits on the learner's own identity record (`premium_comp_active`), readable by the learner and, per Buildy, changeable only by admin actions; this rests on Buildy's field rules and was not attacked | Plan stored server-side, read through a server endpoint; never client-writable |
| S27 | 4, 7 | A "Diagnostic (demo)" block exposes the limit logic (tier, limit, count, record and key type) to learners on the AI Tutor page (also D22) | Remove from production builds |
| S28 | all | Preview and platform: the owner's preview link signs in as the administrator; `superdev_refresh_token` survives sign-out and re-authenticates the previous test account in a new tab (S16, D4) | Own auth with token revocation on sign-out |
| S29 | public level check | Anonymous level check on Buildy has no server-side rate limit (platform gives no visitor IP and no atomic counter); only a browser-side limit. Repeated anonymous runs can read the demo question set. No AI calls, so no cost exposure. Per Buildy also: submissions are not tied to a served set (repeated guesses can reveal answers through the estimates). Found live 2026-10-14: option ids "choice-1" marked the correct reading answer; FIXED 2026-10-14 with random per-run ids and a server-side mapping (verified). Remaining: score requests for one run can race; expired mappings are not cleaned up | On our backend: IP / device rate limit, signed run tokens, item exposure control | 2026-10-14 |

## Status after backend Plan 1 (2026-10-14)
Addressed **in the new schema** (proved by tests in `07_Engineering/parle-backend/tests/`); closed for users only when
the app runs on it (Plans 2-4). Everything else is still open.

| item | how the new schema addresses it | test |
|---|---|---|
| S3 | roles in `app_metadata`, only server code writes them; `is_admin()` | `roles.test.ts` |
| S6, S11, S18 | no browser INSERT/UPDATE/DELETE on any app table; writes only through server functions | `access-rules.test.ts` (learner cannot change own task) |
| S7, S14 | unique learner profile, active week plan, coach note per day, subscriber, identity, profile | `constraints.test.ts` |
| S9, S12, S17 (bank part), S23 | question / prompt banks and settings are server-only | `access-rules.test.ts` (server_only) |
| S18 (usage) | atomic `increment_usage()`; 20 concurrent calls cannot pass a limit of 10 | `constraints.test.ts` |
| S19 | public reads limited to published tutor profiles, visible non-test reviews, replies | `access-rules.test.ts` (public_read) |
| S22 | one live booking per tutor slot; bookings readable only by their learner and tutor | `constraints.test.ts`, `access-rules.test.ts` |

## Status after backend Plan 2 (2026-10-15)
Addressed **in the new sign-in** (app on Supabase Auth, local staging); closed for users at cut-over (Plan 4).

| item | how | proof |
|---|---|---|
| S1, S21 | sign-up requires the 6-digit emailed code before the account can sign in; server functions refuse callers without a confirmed email (`getCaller`) | `auth-flow.test.ts`, `shared-db.test.ts`; live check flows 1 and 1b (Plan 2 report) |
| S16, S28 | sign-out ends the Supabase session and removes the `parle-*`, `sb-*` and `superdev_*` keys and the onboarding session key; no Buildy token exists any more | `auth-flow.test.ts`; live check flow 2 (localStorage empty after sign-out) |
| S3, S6 (account part) | identity, profile, learner profile and unverified placement are written only by `parle-account-service`, which stamps owner and creator from the caller and ignores them in the payload | `account-service.test.ts` |

Still open: **S2 account deletion** (Plan 3), and everything not listed in either status section.

## Status after backend Plan 4 (cut-over 2026-10-15)
Every item. Plans 1-3 closed them on local staging; Plan 4 put them in production at the cut-over (2026-10-15) and confirmed S29 there. Tests are in `07_Engineering/parle-backend/tests/`.

| item | status | how / why | proof |
|---|---|---|---|
| S1 | fixed | email code required before use (Plan 2) | `auth-flow.test.ts` |
| S2 | fixed | "Delete my account" in Settings: password + typed DELETE; personal rows and login removed; bookings and review stars kept without personal data; refused while Premium is active | `account-deletion.test.ts`; live: deleted in the browser |
| S3 | fixed | roles in `app_metadata`, written only by server code; one identity per account | `roles.test.ts`, `account-service.test.ts` |
| S4 | not applicable | Google sign-in stays off (decision #24) | - |
| S5 | fixed | unique keys (Plan 1), atomic usage counter, setting + audit in one transaction | `constraints.test.ts`, `fn-marketplace.test.ts` |
| S6, S11, S18 | fixed | the browser writes no app table; plan engine, check-in, placement and usage run on the server | `access-rules.test.ts`, `fn-plan-service.test.ts`, `superdev-compat.test.ts` |
| S7, S14 | fixed | unique learner profile, placement run, plan and check-in keys | `constraints.test.ts` |
| S8 | open (by scope) | no text-to-speech / speech-to-text yet: voice is in SPEC-BACKLOG | - |
| S9 | fixed | placement questions served without answers; scored on the server | `fn-placement.test.ts`; live placement test |
| S10, S15 | fixed | AI actions limited to 60 per account per 10 minutes and 150 per account per day, so no account can drain the global daily AI cap | `fn-assessment.test.ts`, `ai.test.ts` |
| S12 | fixed | check-in questions served without answer keys; scored on the server on submit (found and fixed in the live check) | `fn-plan-service.test.ts` |
| S13 | fixed | problem reports are written by the plan service for the caller's own task only | `fn-plan-service.test.ts` (task ownership) |
| S16, S28 | fixed | sign-out clears the session and storage; no Buildy token or preview script remains | `auth-flow.test.ts`, `no-buildy.test.ts` |
| S17 | open (accepted) | practice tasks still carry their answers so the learner can self-check after answering, as designed on Buildy; practice is not scored | - |
| S19 | fixed | public reads limited to published tutor profiles and visible reviews | `access-rules.test.ts` |
| S20 | fixed | review replies and records change only through server actions (one-reply rule enforced there); demo review references remain test data | `fn-marketplace.test.ts` |
| S21 | fixed | as S1 | `auth-flow.test.ts` |
| S22 | fixed | one live booking per tutor slot (Plan 1) | `constraints.test.ts` |
| S23 | fixed | settings and question bank are server-only | `fn-placement.test.ts` ("browser cannot read the question bank") |
| S24 | fixed | setting and its audit row saved in one transaction; admins have no direct table access | `admin-settings.test.ts`, `fn-marketplace.test.ts` |
| S25 | fixed | every admin action is refused to learners and tutors on the server | `fn-marketplace.test.ts` (25 actions x 2 roles) |
| S26 | fixed (write) | Premium comp can be changed only by an admin action; the learner can still read it (needed for the plan page) | `superdev-compat.test.ts` (identity create rule) |
| S27 | not applicable | the diagnostic block was removed on Buildy (2026-10-13) | - |
| S29 | fixed | level check: 10 starts and 30 scores per address per hour, 1,000 starts per hour in total, expired runs cleaned daily. Confirmed on production (2026-10-15): Cloudflare refuses a client-set `cf-connecting-ip` (error 1000), and 12 starts with different faked `x-forwarded-for` values were limited at this machine's 10th | `fn-public-level-check.test.ts`, `rate-limit.test.ts`, `fn-jobs.test.ts`; live check in `migration/preview-report.md` |

## Production advisors (Plan 4, 2026-10-15)

Supabase's security and performance advisors on production after the first deploy
(`migration/prod-advisors-2026-10-15.md`), and what was done:

| Finding | Decision |
|---|---|
| Mutable search path on `set_updated_at`, `app_role`, `is_admin` | fixed (migration 000019) |
| `auth.uid()` evaluated per row in 28 read rules | fixed: `(select auth.uid())` (000019) |
| Two read rules on `tutor_payout_country` | fixed: owner rule dropped (000019) |
| `placement_run.owner_id` without an index | fixed (000019) |
| Row security on, no read rule: question bank, prompts, settings, audit log, level-check runs, placement runs, rate limits, AI test queue, waitlist | accepted: server-only by design (Plan 1 tiers); only the functions read them with the service key |
| `join_waitlist` callable without signing in | **Code fix in Phase 40, CI verified:** browser writes now go through `parle-waitlist-join` with bounded body, per-address/email and global limits; additive migration 000037 revokes anon/authenticated execution and retains service-role access. Five original signup integration tests pass in CI [39180293455] on `19b0bdd`, including anonymous RPC denial. Phase 42 adds an independent same-address/unique-email test of the 20/hour IP limit; CI pending. Schema, RPC signature and insert behavior are preserved. Reviewed production migration, Edge Function and waitlist-site deployments plus production IP-header verification are required before this is closed operationally. |
| Voice relay buffers oversized audio/JSON before applying input limits | **Code fix in Phase 41, CI verified:** audio body is streamed and capped at 2,400,000 bytes; JSON actions are capped at 8,192 bytes before parsing. Both regressions passed in app CI [39181566071] on `947273e`; the full three-job workflow passed. Production effect requires the reviewed Vercel app deployment. |
| `pg_net` installed in schema `public` | accepted: pg_net cannot be moved to another schema; it exposes no table to the browser |
| 36 unused owner indexes | ignored: empty database at the time |

Production runs on the Supabase Free plan (no backups, smallest compute, pauses when idle). The database stalled once
during the review (2026-10-15 07:55-08:27 UTC, no error logged; restarted). Moving to Pro before cut-over is a founder
decision (HANDOFF section 5).

## Status after Plan 5 (2026-10-15)

Fixed, each with a test that failed first: R10 (account service input checks, tutors refused learner actions;
`account-service.test.ts`), R12 (sign-out ends the local session even offline; `auth.test.ts`), R13 (photos checked by
their real type, previous photo removed, 10 files per person; `storage.test.ts`, `image-kind.test.ts`), R21 (plan
options decided on the server; `fn-plan-service.test.ts`), R23 (constant-time job secret; `guards.test.ts`), R25
(another person's row answers not found; `superdev-compat.test.ts`), R32 (thrown errors keep CORS headers, Vary always;
`cors.test.ts`). Confirmed on production: wrong job secret 401; a stranger origin gets no allow-origin header.

Migrations 000021 (profile-photo upload rule with the 10-file limit; storage rules work out the user once per query) and
000022 (every bare `auth.uid()` / `is_admin()` wrapped, the waitlist never visited) are applied. `my_profile_photo_count()`
is a security-definer function callable by signed-in users; accepted: it counts only the caller's own files.

## Status after Plan 6 (2026-10-15)

- R41: a temporary storage error during the photo check answers 503 and keeps the upload (it no longer looks like "not
  a photo" and no longer deletes the file); the check asks storage for the first 16 bytes only.
- R39: two saves at once never delete the photo the profile points to when the uploads are from the last 10 minutes
  (the normal case; an older unsaved upload saved during a clean-up can still race, R50): a save removes only files
  older than the saved photo and older than 10 minutes; unsaved uploads are removed after 10 minutes by `clean_unsaved_photos`.
- New actions `prepare_task_content` and `clean_unsaved_photos` refuse a caller with no sign-in (401 on production)
  and act only on the caller's own rows and folder.
- **Accepted:** a production test admin `obsidianteamhq+admin@agentmail.to` (decision #52). Its password is only in
  `.parle-secrets` on the COO computer and it is used only for checks. The founder can remove it at any time with
  `bun scripts/prod/create-test-admin.ts --remove`. Its settings changes appear in the Audit log under its address
  (first use: commission 25 % and back to 20 %, Plan 6 B5).
- Open, not security: R48 (a reused function worker shut down at 150 s ends a slow tutor reply in 546 and leaves the
  message charged).

## Status after Plan 7A (2026-10-16)

- Money amounts come only from the frozen booking on the server; the webhook verifies Stripe's signature and refuses
  live-mode events; the lesson code refuses any Stripe key that is not a test key.
- Refunds and Checkout sessions carry Stripe idempotency keys (`lesson-refund:<id>:<reason>`, `lesson-checkout:<id>`);
  one refund per reason per booking is a database rule; the same Stripe event is recorded once (`stripe_event`).
- Payments, refunds and Stripe event rows are server-only (no browser grant); learners and tutors read only their own
  bookings; the lesson brief only by the booking's tutor; notes by both parties.
- **Accepted for test mode:** `stripe_test_object` and `stripe_test_fail` exist in production but are read only when
  `STRIPE_PROVIDER=fake`, which production never sets.
- **Open:** a hold can be created by any verified learner (limits: 3 open holds, 20 booking presses an hour).

Security-relevant minor findings from the backend reviews (R5, R6, R8, R10, R12, R13, R21, R22, R23, R25, R32, R39, R41; all done after Plan 6) are tracked in
`deferred-defects.md`, section "Open minor findings from the backend reviews".

## Status after Plan 7B (2026-10-16)

- Payout amounts come only from the frozen booking; one payout per lesson (database rule); every transfer and
  reversal carries an idempotency key and a transfer group, and a lost answer is looked up before any repeat.
- `payout` and `tutor_payout_account` are server-only (no browser grant); every administrator decision is audited and
  locked (`payout_decision_begin`).
- The webhook verifies two signing secrets (Parle's destination and the connected-accounts destination) and still
  refuses live mode.
- **Accepted for test mode:** payout alerts go to a test mailbox (`ADMIN_ALERT_EMAIL`).
- **Open:** before live payouts (row 5): re-check the unsupported-country list with Stripe live, decide the alert
  address, and review negative-balance liability for Express accounts.

## Status after Plan 8 (2026-10-16)

- Owner-only actions (invite and remove administrators, delete the waitlist) are checked on the server (`ownerOnly`);
  verified on production: a regular administrator gets 403 `OWNER_REQUIRED` for all three. Nobody can pause or
  demote themselves or an owner; removing an administrator restores their previous role.
- Every Plan 8 administrator action is written to `admin_audit_log` (the waitlist deletion in the same transaction).
- A paused person is refused by every server function at once (`getCaller`, the Buildy compatibility layer) and at
  sign-in (Auth ban); **accepted:** ruling 2, an access token issued before the pause can read the person's own rows
  directly for up to an hour (R89).
- Unsubscribe tokens are HMAC-signed with `WAITLIST_UNSUBSCRIBE_SECRET` (never rotate: links already sent would stop
  working, R85); a forged token answers 400; only bad links count toward the rate limit, so a mail provider's
  one-click unsubscribes are never dropped.
- The waitlist is read only by security definer SQL; `waitlist_signup` and `join_waitlist()` are never altered; the one
  deletion is the owner's button after the launch campaign has finished with nothing queued or failed.
- New tables have row-level security on and no browser grant; new SQL functions run with `search_path = ''`, execute
  granted only to service_role.
- **Open:** the lawyer review (D28) should include the waitlist emails, the CASL footer and the privacy page change.

## Status after Plan 9 (2026-10-16)

- No audio is stored or logged, in the relay or the backend; only transcripts and scores are kept.
- The NVIDIA key is only in Vercel (the relay) and Supabase (the AI tutor), never in the browser.
- The relay secret `VOICE_RELAY_SECRET` is in Vercel and Supabase; rotate it together with the NVIDIA key (spec risk 5).
- Every relay call is checked by the backend's `getCaller()` (bad tokens, unconfirmed emails and paused accounts are
  refused) before any NVIDIA call; checked on production: no sign-in answers 401.
- Read-aloud text is bound to the learner's own tutor reply (Review Focus 5); daily voice limits are counted on the server
  (placement recordings capped at 12 a day).
- Listening audio lives in a private bucket (`listening-audio`, audio/mpeg only) served by one-hour links.
- Transcripts are deleted with the account (foreign keys and the task audio files).
- **Open:** the lawyer review (D28) to include the voice privacy paragraph. (NVIDIA's terms, R101, were settled by
  Plan 10's providers; replays, R96, are capped since Plan 11, A88.)

## Status after Plan 10 (2026-10-16)

- No NVIDIA key anywhere (Supabase and Vercel settings removed, `scripts/prod/env.ts` no longer uploads it); with
  `AI_PROVIDER=live` a model setting without `openrouter:` is refused, never sent to NVIDIA.
- Text AI: the OpenRouter key in Supabase only; every request asks for providers that collect nothing and keep nothing
  (`data_collection: "deny"`, `zdr: true`); the model is OpenAI GPT-6 Luna (decision #59).
- Speech: Deepgram and Azure keys in Vercel only; `mip_opt_out=true` on every Deepgram request; Azure in Canada
  Central; the voice and region settings are checked against plain-name patterns before they reach the URL or SSML.
- Provider errors are logged by provider, model and status only (error bodies can repeat learners' words); tested.
- Minimum age 18 (decision #58), so the providers' extra rules for teens do not apply.
- **Open:** the lawyer review (D28) to include the new privacy paragraphs and the providers as subprocessors
  (OpenRouter, OpenAI, Deepgram, Microsoft); OpenRouter's data location is not stated (US company); OpenRouter's own
  account setting for prompt logging must stay off; Deepgram's opt-out price (R111).

## Status after Plan 11 (2026-10-17)

- **Booking read rule (A57):** the booking table's browser read rule now covers only its participants, and a tutor no
  longer sees a learner's holds (pending payment or expired); column grants limit what the browser can read. Every
  screen reads lessons through `parle-lesson-service`.
- **Stripe webhook secrets (A61):** platform events are checked only against `STRIPE_WEBHOOK_SECRET` and Connect
  events (`account.updated`, transfers) only against `STRIPE_CONNECT_WEBHOOK_SECRET`; a Connect event signed with the
  platform secret is refused (`wrong_destination`).
- **Atomic webhook dedupe (A60):** a payout event is claimed (insert, ignore duplicates) before it is handled, and the
  claim is removed when handling fails, so two deliveries never both act and Stripe's retry is handled. Open: a worker
  killed mid-handler leaves the claim (R122).
- **Unsubscribe page (A78):** opening a link no longer unsubscribes; the page asks first ("Unsubscribe me"), so mail
  scanners that open links cannot unsubscribe anyone. Mail providers' one-click header still posts to the function.
  `www.parle.buzz` redirects to `parle.buzz`.
- **Unsubscribe secret rotation (A77):** to rotate `WAITLIST_UNSUBSCRIBE_SECRET`, put the old value in
  `WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS` (at least 32 characters; `scripts/prod/env.ts` uploads it when the secrets
  folder has it) and the new value in `WAITLIST_UNSUBSCRIBE_SECRET`; links in emails already sent keep working. Remove
  the previous secret no sooner than 60 days later. A missing current secret stops sending with a reason on the
  Waitlist page (A76).
- **Paused accounts:** a paused tutor's listing stays hidden whatever else publishes it (database trigger, A73), and a
  late payment never confirms a lesson for a paused learner or tutor; it is refunded (final review).
- **Logging:** new log lines carry status codes and model names only (Deepgram unreadable answers, Azure empty answers,
  AI replies cut off at the token limit); never audio, transcripts or provider bodies.

## Status after Plan 12 (2026-10-17)

- **Payout webhook claims (R122):** a claim records when it was taken and is cleared once handled; a claim left by a
  stopped worker is taken again after 2 minutes, so Stripe's retry is handled (`stripe_event_retake`, server only).
- **One AI reply at a time (R128):** a per-learner claim (`tutor_reply_claim`, server only, row security on, 150 s) with
  a token, so only the request that took it releases it; usage is read again after the claim.
- **Preview check scripts:** the Vercel bypass is opened through `scripts/lib/bypass.ts`, which removes the secret from
  any navigation error.
- **Launch switch:** `scripts/prod/launch-check.ts` compares secrets by their SHA-256 digests (never reads or prints
  them); `launch-switch.ts` changes Supabase only after parle.buzz serves the app.
- **Media policy:** the audio unlock clip is a `blob:` URL, inside the app's existing `media-src`; the policy was not
  widened.

## Status after Plan 13 (2026-10-17)

- **Listening transcripts stay on the server.** Placement questions and answer feedback, the weekly check-in and the
  signed-out public level check send a listening question's audio address, never its transcript (placement feedback
  also leaves out listening explanations, which quote it). Audio addresses are signed for an hour; a failed or expired
  file falls back to the voice relay, which signs a fresh one.
- **Public level check audio:** the backend checks which items have prepared audio without signing, then signs only
  the five shown; lookup failures mean "no audio", never an error.
- **Import and audio scripts:** `import-lesson-bank.ts` and `prepare-listening-audio.ts` refuse production writes
  without `--founder-go`, checked before any key is fetched, and print counts and demo_codes only.

## Current dependency security debt (2026-10-19)

- **High app build-tool advisory:** Bun 1.4.3 `bun audit --json` at checkout `f28615e` reports `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm (affected `<=3.0.3`); the backend audit returns no findings. The package is a transitive Tailwind CSS 3 development dependency. The checked-in Tailwind content globs are static and developer-authored; no user-controlled glob input was found. On 2026-10-19 the [GitHub Advisory Database](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still listed no patched release and [npm](https://www.npmjs.com/package/braces) still listed 3.0.3 as latest. Upstream maintainer discussion disputes that a code fix is needed ([issue #84](https://github.com/micromatch/braces/issues/84)). The finding still carries build/CI availability risk. Do not call the app scan clean. Security-owner disposition or an approved, tested toolchain/fork remediation and a fresh scan on the frozen release SHA remain required before public launch. See `AUDIT_REPORT.md` Phases 32 and 44.

## Status after Phase 45 (2026-10-19)

- Refreshed the upstream advisory/registry status and reviewed the exact lockfile dependency path and checked-in Tailwind globs. No user-controlled glob expression was identified in the app path reviewed.
- The registry still has no patched release; upstream maintainer discussion disputes that a change is needed. This evidence narrows product runtime reachability but does not clear build/CI availability risk or the High app scan result.
- The user selected to keep this finding open pending security-owner acceptance. Tailwind migration/fork investigation is not authorized by that choice. The dependency is unchanged and remains a public-launch gate until the owner records acceptance or later authorizes remediation.

## Status after Phase 46 (2026-10-19)

- Sealed Codex Security Deep Scan `dfb92ea3-b286-4bc2-ae92-3301a2534495` for revision `1f1a18dbd303281eef980c0e227a097430847dd3`; five validated findings (one medium, four low).
- Findings: refund/payout race can send stored tutor payout after payment refund; ignored dotenv and environment-builder paths contain/write plaintext credential material; payout alert recipient defaults to a test mailbox; a deployment flag/header can expose lesson-service exception detail; marketplace, level-check and Stripe webhook bodies buffer before input caps/auth/signature verification.
- Coverage is partial (792 indexed files / 1,001 inventoried), selected-path static review only. Credential values were redacted. Credential validity, distribution, production configuration, deployed policies, ingress limits and runtime reachability remain unverified.
- Ordered fixes and owner gates are tracked in Phase 46 of the execution plan. Production secret rotation, migrations/settings, deployments and live money actions remain with authorized owners; public launch remains NO-GO.

## Status after Phase 47 (2026-10-19)

- The refund/payout code path is fixed in the branch. Migration 000038 holds scheduled payouts with any recorded refund, prevents new/due/claimed unpaid payouts from bypassing that hold, and serializes transfer start against refund recording with a payment-row lock.
- A refund that commits first prevents a Stripe transfer and leaves the payout held for finance review. A transfer-start gate that commits first marks the transfer in flight; the refund webhook alerts finance for reconciliation. Partial refunds do not create an inferred proportional payout.
- Explicitly approved admin split refunds retain their reduced tutor share through a one-use authorization, consumed immediately before transfer start and cleared on abort. The existing split/refund/admin/recovery regression suite passes.
- Local migration applied without resetting local data. Initial CI 39189307264 passed app and generated/Deno jobs, then found three report/claim races where report and admin-decision gates still treated `transfer_started_at` as the worker lease. The migration now respects the fresh claim lease in those gates. Follow-up local report/claim, schema, sender and admin suites pass 35/35 tests (174 assertions); the three affected Deno entry points type-check. Follow-up full CI is pending.
- Production remains unchanged. A reviewed deployment must apply migration 000038 and deploy the webhook, booking-jobs, and payout-service functions together. Existing refunds/transfers that have passed the gate still require finance reconciliation. Other Phase 46 findings and the partial scan coverage remain open; public launch is NO-GO.

## Status after Phase 33 (2026-10-18)

- Codex Security Standard scan `d8fce14a-df70-407d-b1b2-f8fde17f6cb8` was completed against `c173e130ea71fb995dff9fdbb33ca926d487eae0`; it reported zero new confirmed findings in selected source paths.
- Coverage was explicitly partial: no line-by-line review of all 1,011 inventoried files, no delegated workers, no Daybreak access, and no inspection of production/provider configuration. See Phase 33 in `AUDIT_REPORT.md` and the audit execution plan.
- This continuation does not alter, close, or downgrade the `braces@3.0.3` advisory above. Security-owner disposition, fresh final-SHA scans, and production/provider evidence remain open.

## Status after Phase 34 (2026-10-18)

- Removed raw exception messages from the shared Edge Function wrapper, lesson checkout, and scheduled booking-job logs. The shared-wrapper regression confirms a deliberately sensitive message is not emitted.
- Local focused test passes; all 15 Deno Edge Function entry points type-check. Full push-triggered CI is pending, and a reviewed backend deployment is needed before production logs receive this change.
- This logging change does not clear the `braces@3.0.3` advisory or prove every application/infrastructure log is free of personal data.

## Status after Phase 35 (2026-10-18)

- A broader source search found and removed 38 additional raw-message logging sites in canonical backend functions/shared helpers and 15 error-object logging sites in canonical app server functions. Generated Edge Function copies were refreshed from their app source.
- Local source-sync, focused redaction regression and all 15 Deno checks pass. Phase 34's full backend CI is still running; Phase 35 full CI is pending after push.
- Browser-console payload logging and Vercel/Supabase/Stripe/email/AI/speech provider log configuration remain unreviewed. Production log behavior changes only after a reviewed backend release.
