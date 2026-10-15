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

## Status after backend Plan 3 (2026-10-15)
Every item, on local staging (closed for users at cut-over, Plan 4). Tests are in `07_Engineering/parle-backend/tests/`.

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
| S10, S15 | fixed | AI actions limited to 60 per account per 10 minutes; global daily AI cap | `fn-assessment.test.ts`, `ai.test.ts` |
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
| S29 | fixed | level check: 10 starts and 30 scores per address per hour, expired runs cleaned daily; trusted client-address header to confirm in Plan 4 | `fn-public-level-check.test.ts`, `fn-jobs.test.ts` |
