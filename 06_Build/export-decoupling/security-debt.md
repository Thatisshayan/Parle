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
