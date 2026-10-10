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
