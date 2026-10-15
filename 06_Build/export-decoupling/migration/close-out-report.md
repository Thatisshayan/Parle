# Plan 5 close-out report

Date: 2026-10-15. Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-5-deferred-close-out.md` (groups A and B of
`deferred-inventory-2026-10-15.md`). Production Supabase "Parle" (hcphvipeplkfenugikrf); private preview
`https://parle-preview-shayans-projects-d00acc44.vercel.app`.

## Deploy

| Step | Result |
|---|---|
| Suites before deploy | backend 239 pass, 1 opt-in skip, 0 fail; app 396 pass; app type errors 63 (unchanged baseline) |
| App build | the local build cannot run here (Windows Smart App Control blocks the build tool's native file); the Vercel build succeeded (READY) |
| Migrations (founder) | dry run `pending: 2`; applied `20261016000021_profile_photo_limits` and `20261016000022_policy_wrap_followup` |
| Database check | waitlist 0 (unchanged); 0 read rules that work out the user per row; photo upload rule with the 10-file limit present; `private.wrap_policy_auth_calls()` not callable by signed-in users |
| Functions | all 8 deployed: account, assessment, billing-recheck, marketplace-refresh, marketplace-service, plan, public-level-check, stripe-webhook |
| Function settings | `PUBLIC_SUPABASE_URL` added to the settings file; upload by the founder pending (hosted functions already see the public address as `SUPABASE_URL`, so photos work without it) |
| Preview | deployment `parle-a2w14w3b2` (first attempt answered "Not authorized", the retry built), aliased to the stable address |

## Smoke checks on the preview

| Check | Result |
|---|---|
| New visitor sign-up | 6-digit code from no-reply@parle.buzz; lands on onboarding "STEP 1 OF 6", no account step |
| m3imm Today, Your plan, check-in | migrated plan; "Premium plan (monthly), renews 13 November 2026"; check-in opens |
| AI tutor plan label at 1.5 s (A17) | "PREMIUM PLAN, 299 of 300 AI messages left" (before: "Free plan" until a chat opened) |
| AI tutor | chat opened as Premium after 16 s; reply arrived |
| m5tut1, level check | listing published; question 1 of 10 |
| Wrong job secret (A4) | `parle-marketplace-refresh` 401 |
| Stranger origin (A6) | `parle-account-service` from evil.example: 401, `Vary: Origin`, no allow-origin header |
| Photo (A1, A7) | m3imm uploads a PNG in Settings, saves, reloads: the photo shows from our storage |
| Offline sign-out (A2) | lands on /login, no `parle-`/`sb-`/`superdev_` keys left |

Console messages seen and explained: the deliberate "same password" 422 after sign-up verification; 409
`ONBOARDING_REQUIRED` for a brand-new account; one "Failed to fetch" from the test leaving the tutor page mid-load; one
`ERR_INTERNET_DISCONNECTED` during the offline sign-out.
