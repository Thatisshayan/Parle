# Backend Plan 2 report: compatibility layer, sign-in, Resend, account writes

- **Plan:** `2026-10-15-plan-2-layer-auth-account.md` (9 tasks), executed inline ("native") on branch `backend-plan-2`.
- **Date:** 2026-10-15 (UTC).
- **Result:** all 9 tasks complete. Tests after the final review fixes: **app 359 of 359**, **backend 82 of 82**. Production build passes.
  The app no longer depends on `@superdevhq/client` or `superdev-tagger`; it talks to Supabase.

## What was built
| Task | Result |
|---|---|
| 1 Query translation | `parle-app/src/lib/backend/query.ts`: Buildy `filter(query, sort, limit, skip)` to PostgREST; sorted queries get a final `id` order so paging is repeatable |
| 2 `entity()` | `backend/entities.ts`: filter, list, get, create, update, delete, bulkCreate; errors read "API request failed: ..."; the Plan 1 Buildy fixture replays 10 of 10 |
| 3 Sign-in | `backend/auth.ts`: sign-up with a 6-digit email code, sign-in, reset by emailed link (single use), sign-out clears `parle-*`, `sb-*`, `superdev_*` and the onboarding session key |
| 4 Function helpers | `supabase/functions/_shared/`: `getCaller` (verified email required), `ownedTable` (owner and creator always from the caller), `json` / `fail` / `preflight` |
| 5 `parle-account-service` | identity (one role per account, sets `app_metadata.role`), profile, learner profile, unverified placement; 6 tests incl. ignored owner fields |
| 6 Re-pointing the app | bridge files (`superdev/client`, `entities`, `functions`, `integrations/core`) use the new layer; profile, identity and onboarding writes go through the service; `profile-photos` bucket (own folder only); Buildy packages removed |
| 7 Code step | `VerifyEmailCode` on `/signup` and in onboarding (new phase `verify_email`, survives a reload); resend with a 60 s wait |
| 8 Resend | real email from `Parle <hello@parle.buzz>` arrived in AgentMail (`spikes/resend-report.md`); production SMTP settings recorded in `config.toml` (commented, Plan 4) |
| 9 Live check | below |

## Live check in the browser (local staging, `http://127.0.0.1:5173`)
| Flow | Result |
|---|---|
| 1 Learner onboarding end to end (`live-...@example.test`) | **Pass.** 7 steps, "Check your email" code step, code from Mailpit, then placement intro, "Skip placement", "Your level is unverified ... A2". Service-client check: user confirmed, `app_metadata.role` learner; one each of ParleIdentity (learner), ParleProfile (America/Toronto), learner_profile, placement_result (unverified, A2); every row has `created_by` = the user and `user_id` = the user |
| 1b Tutor sign-up via `/signup?role=tutor` | **Pass.** Code step, then `/tutor/application`; role tutor in both `app_metadata` and ParleIdentity |
| 2 Sign out | **Pass.** Redirect to `/login`; localStorage empty (was `parle-auth`); onboarding session key gone |
| 3 Sign in, Settings | **Pass, with one local-only gap.** Name and time zone (Europe/Paris) saved and still there after reload; photo uploaded to `profile-photos/<user id>/...` and the stored file serves (200, image/png). The page shows it through Supabase's **image resize** address (`/render/image/...`), which returns 404 locally because the local stack runs without imgproxy (`-x imgproxy`). See open items |
| 4 Forgot password | **Pass.** Mail "Reset your Parle password" with a link to `/reset-password?token=...`; new password saved; the new password signs in and the old one is refused; opening the same link again shows "expired or was already used" |
| 5 Learner screens | **Fail as expected** (functions not ported). List below |

### Screens waiting for Plan 3
| Screen | Fails on |
|---|---|
| `/learner` (Today) | browser write to `roadmap` refused (plan engine, decision #48); `parle-marketplace-service` missing (lesson requests) |
| `/learner/check-in`, `/learner/roadmap`, `/learner/progress` | `roadmap` write refused (plan engine) |
| `/learner/ai-tutor`, `/learner/plan` | `parle-assessment-service` missing |
| `/learner/tutors`, `/learner/lessons` | `parle-marketplace-service` missing |

Not visited: `/placement-test` (needs `parle-assessment-service`), and the tutor and admin areas (their services are Plan 3).

## Open items found
1. **Photo display needs image resizing.** `parle-profile.ts` turns photo links into `/storage/v1/render/image/...`
   links. Locally that needs imgproxy (start the stack without `imgproxy` in `-x` to check). On hosted Supabase,
   image transformations are a paid-plan feature: confirm the production plan in Plan 4, or show the plain
   `/object/public/...` link. Recorded as D30.
2. **Buildy-hosted images.** `components/parle/Brand.tsx` (logo) and `pages/Index.tsx` (home image) load from
   Buildy's own storage (`ellprnxjjzatijdxcogk.supabase.co/.../project-yuircx1jlz5bpg1jbv2th/...`). They must be
   copied into our storage or `public/` before cut-over. Recorded as D31.
3. `tutor-profile-load-state.ts` still has a comment naming `@superdevhq/client` (comment only).

## Rulings made during execution
- Task 1: `.env.example` force-added despite the root `.env*` ignore rule (placeholders only). Cost if wrong: none.
- Task 2: the replay test keeps Buildy's own `created_at`. Cost if wrong: none.
- Task 3: added a test for `updateMyName`; `tokenHashFrom` decodes `&amp;`. Cost if wrong: none.
- Task 4: the Bun test preload maps the `npm:` specifier both ways (Bun reads `npm:` as a namespace). Test-only.
- Task 6: `auth-pages` also exports `resendSignupCode`; an app `test` script sets placeholder Supabase values;
  `createMyIdentity` maps `ROLE_EXISTS` to the old message. Cost if wrong: none.
- Task 6 (on Task 2): sorted queries get a final `id` order and the replay test checks ties as groups. All 35
  replayed rows share one `created_at`, so Buildy's order within ties was storage order, not a contract. Cost if
  wrong: tied rows could list in a different order than on Buildy.
- Task 7: `normaliseCode` lives in a pure file; new texts are English-only (decision #14); `ResetPassword.tsx` was
  left unchanged (confirmed live in flow 4).
- Task 8: `readSecret` accepts `NAME=value` and quoted values.

## Security status
S1 (email verification), S16, S21 and S28 are addressed in the new sign-in; see `security-debt.md`,
"Status after backend Plan 2". S2 (account deletion) stays open for Plan 3.

## Final review (fresh reviewer) and fixes
Independent whole-branch review: 1 Critical, 3 Important, 10 Minor. All Critical and Important fixed, each with a test
that failed first (or a live browser check where the app has no component tests).

| Finding | Fix | Proof |
|---|---|---|
| **Critical:** signing up again with an unverified email kept the first sign-up's password and name, so whoever pre-registered an address owned the account once its real owner verified it | after the code is accepted, the app sets the password and name the person just typed and ends every other session; after a reload the code step asks for the password again | `auth-flow.test.ts` "a pre-registered unverified sign-up cannot keep its password or name" |
| A failed reset (for example the same password again) left the browser signed in | the reset always signs the browser out afterwards | "a failed reset leaves no session behind" |
| `ensure_identity` ignored a failed role write and never repaired it | the role in `app_metadata` is checked and re-written on every call | `account-service.test.ts` "repairs a missing app_metadata role" |
| Sign-in told an unverified account "We can send you a new code" with no way to do it | sign-in sends a new code and shows the code step; after the code the person is signed in | live: unverified account, code from Mailpit, signed in, password works |

Not checked live: the onboarding code step after a page reload (it now shows a password field; logic only).

### Deferred minors (from the review)
- CORS `*` on functions: restrict to the app's addresses before Plan 4.
- After `ensure_identity` the browser's token keeps the old role until it refreshes: refresh it before Plan 3 rules rely on it.
- Thin server checks: `photo_url` accepts any address; `native_language` and `track` are not checked; tutors can call learner actions.
- Two simultaneous first saves return an error instead of one succeeding (safe, unique index): use an upsert.
- The "limit and skip" replay case checks only the count; `skip` without `limit` is dropped.
- Sign-out while offline can leave the session in memory: reload after sign-out.
- Replaced photos are never deleted; no per-user quota; the content type comes from the browser.
- Resend errors in the code step are not shown; raise the auth email rate limit when custom SMTP is on (Plan 4).
- No automated test of `getCaller`'s unverified-email branch or of sign-out clearing storage (live check covered it).
- The bucket is named `profile-photos`; spec section 7 says `tutor-public`. To settle in Plan 3 with tutor photos.

