# Parle backend decoupling: design spec

- **Date:** 2026-10-14
- **Status:** APPROVED by the founder 2026-10-14 (self-critique fixes applied after approval: per-account migration
  reads, production clean-up before final migration, delivery phases, three risks)
- **Author:** COO agent, with the founder (brainstorming session 2026-10-14, sections 1-6 approved one by one)
- **Decisions behind it:** #10, #26, #37, #38, #42, #43, and #44-#47 (recorded with this spec)
- **Inputs:** `../buildy-export-handbook-2026-10-14.md`, `../export-inspection-2026-10-14.md`,
  `../deferred-defects.md` (D1-D29), `../security-debt.md` (S1-S29), exported code in `07_Engineering/parle-app/`

## 1. Goal

Run the full Parle app (learner, tutor, admin and public screens) on our own stack, with no part of it calling
Buildy, while keeping the exported React app and its tested logic largely unchanged, migrating all Buildy data, and
closing the access-wall and security gaps Buildy could not.

Leaving Buildy is **not** the public launch. parle.buzz keeps showing the waitlist until the founder decides to launch
(section 10).

## 2. Founder decisions taken in this session

| # | Decision |
|---|---|
| 44 | Approach A: Supabase as the backend (Postgres, Auth, Edge Functions, Storage, cron) with a compatibility layer that mimics Buildy's client, so pages change little. Rejected: B (Vercel functions + Neon + separate auth; more vendors, Deno code rewritten for Node), C (rewrite on a new framework; discards working code) |
| 45 | Migrate **everything** from Buildy's database (content, settings and all accounts' data). Passwords cannot be exported: migrated people set a new password by email |
| 46 | The app will live at **parle.buzz** itself at launch (replacing the waitlist page); until then on a private Vercel preview address |
| 47 | AI provider: **NVIDIA API** (OpenAI-compatible endpoint). Email sending: **Resend** (pulled forward from D29 for sign-in mail; the waitlist launch email stays deferred). Staging: **local Supabase in Docker** on the founder's PC (Docker Desktop started by the founder on request) |

## 3. Architecture

```
Browser (React/Vite app, Vercel)
  └─ src/lib/backend/*  ── compatibility layer, same surface as the Buildy client:
       entity("x").filter/get/list/create/update/delete/bulkCreate, auth.me/login/logout/register/...,
       functions.parleAssessmentService / parleMarketplaceService / parlePublicLevelCheck
       └─ supabase-js ──► Supabase project "Parle" (ca-central-1)
            ├─ Postgres: 36 app tables + waitlist_signup, row-level security per table
            ├─ Auth: email + password, verification, reset (mail via Resend SMTP)
            ├─ Edge Functions (Deno): ported Buildy functions + stripe-webhook
            │     ├─ ai module ─► NVIDIA API (OpenAI-compatible)
            │     ├─ email module ─► Resend
            │     └─ Stripe (sandbox until launch)
            ├─ Storage: tutor photos (public), tutor documents (private)
            └─ pg_cron: availability refresh, level-check cleanup, Stripe safety re-check
```

Units and their single job:

| Unit | Job | Depends on |
|---|---|---|
| `src/lib/backend/client.ts` | create the supabase-js client from two public settings | Supabase URL, publishable key |
| `src/lib/backend/entities.ts` | `entity(name)` with the Buildy method surface, translating filters / sort / limit to PostgREST queries | client |
| `src/lib/backend/auth.ts` | `User` object: `me`, `login`, `logout`, `register`, `isAuthenticated`, `updateMe`, password reset; `me()` returns the same shape pages use today | client, `ParleIdentity` |
| `src/lib/backend/functions.ts` | `functions.X(payload)` routed to `supabase.functions.invoke` | client |
| `src/lib/backend/integrations.ts` | `uploadFile` / `getUploadedFile` via Storage; other Buildy integrations not used by Parle throw "not available" | client |
| `supabase/migrations/*` | tables, constraints, row-level security, roles | - |
| `supabase/functions/<name>/` | one Edge Function per Buildy function + `stripe-webhook` | `_shared/*` |
| `supabase/functions/_shared/db.ts` | same `filter/get/create/update` style over a service-role client | - |
| `supabase/functions/_shared/caller.ts` | verify the caller's token, load role, reject before any work | Auth |
| `supabase/functions/_shared/ai.ts` | OpenAI-style chat call to NVIDIA, model per feature from settings, schema check + one retry, global daily cap | NVIDIA key |
| `supabase/functions/_shared/email.ts` | send through Resend | Resend key |
| `scripts/migrate-from-buildy/*` | export Buildy rows, map ids and owners, load, verify | Buildy data API, service role |

The existing imports (`@/entities`, `@/functions`, `@/integrations/core`, `@/lib/superdev/client`) are re-pointed to
`src/lib/backend/*`, so the 36 pages and the shared logic keep their code.

## 4. Data and access rules

- **Tables.** Each of the 36 Buildy entities becomes a table with the same name and fields, generated by a script
  from `entities/*.json`. Every table keeps `id`, `created_at`, `updated_at`, `created_by` and gains `owner_id`
  (references the auth user). Numbers, booleans and arrays get real types; string fields (including dates) stay `text`, so the app's ISO-string
  comparisons keep working and Buildy's `""` empty values survive; enum checks also accept `""`. Real date types are
  revisited after cut-over (Plan 1, Tasks 4 and 7).
- **Guarantees** (S5, S7, S14, S18, S22): unique one-per-learner records (learner profile, placement result,
  current roadmap, current week plan per week); unique (tutor, start time) for bookings; atomic usage counters for
  the AI limit.
- **Access, three tiers:**
  1. Private learner data (tasks, plans, check-ins, AI chats, estimates, mastery, coach notes, subscription cache):
     the owner may read; writes only through Edge Functions (S6, S11, S18).
  2. Content and answer keys (question and prompt items, level-check runs): no browser access; served without
     answers and scored on the server (S9, S12, S17, S23).
  3. Public tutor data (approved public profiles, visible reviews, availability snapshots): readable by anyone;
     other tutor records readable by the tutor and admins only (S19).
- **Admin** is a role on the account settable only by an admin action, audit-logged (S3). Admin reads run in Edge
  Functions with full rights, which ends "Not available to administrators" (D19, D24).
- **Audit:** a setting change and its audit row are written in one transaction (S24).
- **Settings** (`app_setting`) keep their current values; new keys: AI model per feature, global AI daily cap.

## 5. Sign-in and accounts

- Supabase Auth, email + password. **Email verification required** before use (D16, S1, S21). Password reset by
  email. Google sign-in configured but switched off (decision #24, S4).
- **Sign-out clears** the session, onboarding state and stored tokens (D4, S16, S28).
- **Roles** learner / tutor / admin stored where only server code writes; sign-up as learner or tutor sets the
  starting role.
- **Account deletion** (S2): "Delete my account" in Settings; personal data removed, records that must remain
  (for example a review's rating) anonymized.
- **Migrated people** are created without a password and receive a "Set your password for Parle" email; their data
  is linked by email (section 9).
- **Auth email** is sent through Resend's SMTP from parle.buzz (section 7).

## 6. Server functions

- The 4 Buildy functions (`parle-assessment-service`, `parle-marketplace-service`, `parle-public-level-check`,
  `parle-marketplace-refresh`) and their 20 helpers become Edge Functions with the same actions and payloads. Only
  the data-client calls change (to `_shared/db.ts`).
- **Every function** starts with `caller.ts`: verify token, load role, reject with 401/403 before any work; then
  act with full rights. Public actions (level check) are explicitly marked and rate-limited instead.
- **Transactions** for multi-step writes (check-in -> re-plan -> audit; coach-note create; usage increment).
- **Rate limits** per account, and per IP for public actions: AI generation, writing scoring, practice generation,
  public level check (S10, S15, S29).
- **Stripe** billing code moved as-is in sandbox mode; new `stripe-webhook` function verifies the Stripe signature
  and updates the subscription cache immediately (replaces the no-webhook workaround of decision #40); hourly
  re-check replaced by a daily safety-net re-check (section 7). The founder adds the webhook endpoint in the Stripe
  sandbox dashboard once (guided step), which yields `STRIPE_WEBHOOK_SECRET`.
- Error replies keep Buildy's `{ error_code }` shapes so existing page handling still works.

## 7. AI, email, files, scheduled jobs

- **AI (NVIDIA):** `_shared/ai.ts` replaces `invokeLLM` for the AI tutor, AI lessons, coach note, writing scoring,
  AI drafts and practice generation. Model per feature from settings. Structured outputs (lesson items, drafts,
  scores) are validated against their schema, rejected and retried once (D25b). Per-account limits unchanged plus a
  global daily cap. **Model selection:** before cut-over, run a fixed prompt set (an A2 writing correction, an AI
  lesson, a Persian explanation, a check-in writing score) through 2-3 NVIDIA models and let the founder choose.
- **Email (Resend):** `_shared/email.ts` for app mail (tutor application decisions and the existing Buildy
  `sendEmail` uses) and Auth SMTP for verification / reset / set-password mail. From `hello@parle.buzz` (people) and
  `no-reply@parle.buzz` (automatic). Porkbun: add Resend's SPF, DKIM and DMARC records, keep the forwarding MX.
- **Files (Storage):** bucket `tutor-public` (profile photos, public read) and `tutor-private` (documents; tutor and
  admins). App icons and the brand mark copied from Buildy storage into `public/`.
- **Jobs (pg_cron):** hourly tutor availability refresh (moved); daily expired level-check run cleanup (new); daily
  Stripe subscription re-check (safety net).

## 8. Environments and hosting

- **Staging:** local Supabase in Docker on the founder's PC via `bunx supabase` (Docker Desktop must be running;
  stop the stack when idle, the PC is short on RAM). Used for development, tests and the rehearsal migration.
- **Production:** the existing Supabase project "Parle" (ref `hcphvipeplkfenugikrf`, ca-central-1), which already
  holds `waitlist_signup`.
- **Front end:** new Vercel project `parle-app` from `07_Engineering/parle-app/`, settings
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public). Private preview behind Vercel Authentication until
  launch; it points at production (test accounts only until launch).
- **Secrets** (never in chat, repo or logs): `NVIDIA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` set in Supabase function secrets by the founder through a guided step or a local file read
  only by a setup script; the agent never echoes them.

## 9. Data migration

- **Readability first (critique fix).** Buildy's access rules (checked in `entities/*.json`) let a signed-in account
  read only its own rows (`created_by` = its email), so the owner session alone cannot export learners' data. The
  script therefore reads **as each account in turn**: the owner for admin-owned rows and content, and each of the 6
  accounts for its own rows. All 6 accounts are AgentMail aliases the agent controls; 3 have saved passwords, the
  other 3 (`imm1`, `learner1`, `tutor1`) get a Buildy password reset whose email the agent receives. A Phase 0 spike
  proves this works before anything else is built; fallback: a temporary, secret-protected Buildy export function.
- A one-off script reads every row of every Buildy entity through Buildy's data API (per-account sessions as
  above), maps old ids to new uuids (keeping cross-references), sets `owner_id` by matching
  `created_by` email to the new auth user, converts field types, and loads into the target database.
- Auth users are created for every distinct account email, without passwords; role from `ParleIdentity`.
- **Rehearsal** into local staging first; **verification script**: row counts per table equal Buildy's, no row
  without an owner where one is required, spot checks (paid test learner's subscription cache, R-A2-01 options,
  settings values, the 137-item bank, tutor M5's profile and availability).
- **Final run** into production at cut-over, same verification, then set-password emails.
- Stripe: the sandbox customer and subscription ids move with the subscription cache; no Stripe-side change.

## 10. Cut-over and launch

Cut-over (leaving Buildy), in order:
1. Build and test on staging, including the rehearsal migration.
2. Deploy the private preview against production; founder clicks through as learner, tutor and admin.
3. Freeze Buildy (no more changes there).
4. Empty the app tables in production (test data created while reviewing the preview), **never** touching
   `waitlist_signup`; then the final migration, verification, set-password emails.
5. Buildy left untouched and unpublished for 30 days as a fallback, then archived.

Public launch (separate, founder's call): real question bank (0 of 360 today), lawyer-reviewed legal pages (D28),
tutors recruited, Stripe live mode, then the parle.buzz domain moves from `parle-waitlist` to `parle-app` in Vercel.

## 10a. Delivery phases (critique fix: too large for one plan)

| Phase | Content | Plan |
|---|---|---|
| 0 | Spikes that can change the design: Buildy per-account data readability (section 9); Buildy `filter` semantics vs PostgREST on real query patterns; NVIDIA API access and a first French answer; local Supabase running in Docker on this PC | Plan 1 |
| 1 | Local staging, schema generated from `entities/*.json`, constraints, row-level security, roles, RLS tests | Plan 1 |
| 2 | Compatibility layer (entities, auth, functions routing, storage) + Supabase Auth with Resend SMTP; app runs against staging for read-only screens | Plan 2 |
| 3 | Edge Functions port, caller checks, transactions, rate limits, Stripe webhook | Plan 3 |
| 4 | AI module (NVIDIA, model bake-off), email module, Storage buckets, cron jobs | Plan 3 |
| 5 | Migration script, rehearsal on staging, verification | Plan 4 |
| 6 | Production setup, private preview, live checks, security pass, cut-over | Plan 4 |

Each plan is written after the previous phase reports, so findings (especially from Phase 0) shape it.

## 11. Testing and done criteria

- Existing 350 tests keep passing; add a `test` script.
- New tests against local staging: row-level security (learner cannot read another learner's rows or answer keys;
  tutor cannot read learners' private rows), role checks on every admin action, the guarantees (no double booking,
  no second profile, no AI-limit bypass under concurrency), caller check on every Edge Function action.
- Migration verification script (section 9).
- Live checks per role in the private preview (learner incl. a founder-clicked Stripe sandbox checkout, tutor,
  admin, signed out), as on Buildy.
- Security pass: S1-S29 each marked fixed / not applicable / open with reason; Supabase security advisors clean or
  each warning explained.

**Done** means: every screen that worked on Buildy works on our stack; all Buildy data migrated and verified;
sign-up with verification, sign-in, reset and deletion work with Resend mail from parle.buzz; access-wall gaps
closed (admin metrics, user detail, Premium status); security list reviewed; no code path calls Buildy.

## 12. Out of scope (own specs later)

Tracked in `SPEC-BACKLOG.md` (same folder) so none of these is forgotten; none has a spec yet.


Full booking flow (accept / decline, lessons, reminders, calendar files, attendance), tutor payouts and Stripe
Connect, voice (TTS / STT, live voice), the waitlist launch email (D29 remainder), Stripe live mode, public launch,
code-splitting and performance work beyond what the move requires.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Buildy's data API cannot read some rows even as owner (access wall) | Read learner-owned rows through admin actions or per-account sessions for the 6 test accounts; worst case, those rows are recreated from the test scripts and noted |
| Filter semantics differ between Buildy and PostgREST | Compatibility tests on the 196 `filter` calls' patterns before porting pages |
| NVIDIA model quality for French tutoring | Model bake-off before cut-over; model per feature in settings |
| RAM pressure from local Supabase | Stop the stack when idle; run tests in batches |
| Edge Function cold starts slow the AI tutor | Measure in preview; keep functions warm with the existing cron if needed |
| NVIDIA API cost or rate limits unknown | Phase 0 checks the account's limits and pricing; global daily cap in settings |
| Secrets mishandled (keys pasted in chat) | Guided secret step: founder enters keys in Supabase / Vercel dashboards or a local file read only by a setup script; agent never prints them |
| Production holds both waitlist and app data | Migrations and clean-ups name app tables explicitly; `waitlist_signup` excluded and its row count checked before and after |
