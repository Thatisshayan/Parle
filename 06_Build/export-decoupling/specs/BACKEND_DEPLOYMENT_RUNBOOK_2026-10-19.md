# Backend deployment runbook: migrations 34-38 and Edge Function refresh

**Status:** Draft for founder review. Nothing here has been executed. Prepared after PR #1 (`80c02dc`) merged `codex-branch` into `main`.

**What the merge did and did not do:** it built `parle-app` on Vercel as a production-target deployment with no custom domain (SSO protected; `parle.buzz` still serves `parle-waitlist`). It did **not** touch Supabase. Production Supabase (`hcphvipeplkfenugikrf`) is at migration `20261017000033`, and its Edge Functions are the pre-audit versions. `parle-waitlist-join` does not exist there yet.

**Who runs it:** the founder or an authorized operator, per repo policy (production migrations are founder-run). Public launch stays NO-GO; this runbook only brings the private preview backend up to the merged code.

## 0. Preconditions (do all before touching anything)

1. **Backup.** The Supabase plan has no PITR evidence. Take a manual logical backup (`supabase db dump`, or a dashboard backup) and note where it is stored. Without it there is no restore path for migrations 36-38, which replace functions in place.
2. **Link and compare.** `supabase link --project-ref hcphvipeplkfenugikrf`, then `supabase migration list --linked`. Expect remote = 1-33 and local = 1-38. If remote has anything else, stop and reconcile first (the audit could not run this check).
3. **Voice relay secret.** `parle-voice-service` now refuses relay-only actions unless `VOICE_RELAY_SECRET` is at least 32 characters and not `pending`, `change-me` or `placeholder`. Check the length of the Supabase secret and the matching Vercel `VOICE_RELAY_SECRET` without printing either. Rotate both to the same new value if short. If you skip this, voice breaks on deploy.
4. **Stripe stays in test mode.** The payment adapter refuses `sk_live_` keys by design. Do not change Stripe keys as part of this runbook.
5. **Quiet window.** Pause the payout and booking cron jobs (or choose a time with no scheduled payouts) for step 3.

## 1. Additive migrations: 34, 35, 36

Safe to apply first; old function code ignores them.

- 34 `atomic_lesson_bank_import`: new service-role-only import RPC.
- 35 `provider_concurrency`: tables/RPCs used by the new provider lease code.
- 36 `serialize_lesson_holds`: per-tutor hold serialization (fixes the R59 deadlock).

Command: `supabase db push --linked` applies every pending migration, including 37 and 38, which must wait. Run it from a scratch copy of `supabase/` that holds only migrations 1-36 (link that copy to the project), then confirm with `supabase migration list --linked` that the remote is at 36.

## 2. Migration 38 (payouts paused)

Migration 38 (`refund_aware_payouts`) adds columns, a new hold reason and rewrites `payout_schedule`, `payout_hold`, `payout_due`, `payout_claim`, `payout_transfer_start`. It also **holds every scheduled payout that already has a refund**. With payout jobs paused (precondition 5), apply it, then go straight to step 3. The new function code expects these objects, and the old payout code does not expect them, so keep the gap short. Stripe is in test mode, so exposure is test data only.

After step 3, confirm no payout is `scheduled` while its payment has a refund, and that `held` rows with `hold_reason = payment_refund` exist only where a refund exists. A partial refund now needs an explicit finance decision; this is intended. Then resume the payout jobs.

## 3. Deploy all Edge Functions

`bunx supabase functions deploy --project-ref hcphvipeplkfenugikrf` (requires `SUPABASE_ACCESS_TOKEN` in the environment; do not paste it into logs). This deploys all 16 functions including the new `parle-waitlist-join`. All use `verify_jwt = false` in `config.toml`; that is unchanged.

Do **not** apply migration 37 yet. The live waitlist page still calls `join_waitlist` directly, and the old and new functions both work with the current grants.

Smoke checks after deploy (see section 6).

## 4. Publish the waitlist page, then apply migration 37

Order matters. Migration 37 revokes anon/authenticated execute on `join_waitlist`. The currently published page calls it directly, so signups break the moment 37 lands unless the new page is live.

1. From `07_Engineering/parle-waitlist`, deploy to the `parle-waitlist` Vercel project (`vercel --prod`; this project is not git-triggered).
2. On `parle.buzz`, submit a test signup (use a mailbox you control). Confirm a success message and a new `waitlist_signup` row.
3. Apply migration 37.
4. Submit another test signup. Confirm it still succeeds via the Edge Function, and that a direct call to `/rest/v1/rpc/join_waitlist` with the publishable key is now denied.

Rollback for this step: re-grant execute on `public.join_waitlist(text,text,text,text,text)` to `anon, authenticated` and redeploy the previous waitlist deployment (`dpl_7SDoDE8uNV5XLXaLpTUQckusLaWk` is a rollback candidate).

## 5. Vercel app

Already built from `80c02dc` (`dpl_m3WF7A6acXvdhHrSFbCJ6YaKX1mA`, READY, production target, no custom domain). Confirm the `VOICE_RELAY_SECRET` value (precondition 3) is present for the Production environment before relying on voice. Do not attach `parle.buzz` here; that is the cutover, a separate gated operation.

## 6. Smoke tests

- Sign in to the preview as a learner; open Today and the plan.
- Public level check completes; an oversized body is rejected with 413.
- Voice: one record, transcribe, score on desktop; confirm relay-only action accepted with the configured secret.
- Booking: create a hold twice in quick succession for one tutor; no 500s.
- Test-mode lesson checkout, then a refund; the payout row for that booking is `held` / `payment_refund`.
- Admin sign-in works; a disabled account cannot sign in or call a function.
- Waitlist signup and unsubscribe (unsubscribe rejects oversized bodies).
- Edge Function logs show no `unhandled function error` for these paths.

## 7. Rollback

- **Functions:** redeploy previous versions from git (`git checkout 8264f02 -- 07_Engineering/parle-backend/supabase/functions`, then deploy) if a function misbehaves. Version numbers before this deploy are in the Supabase dashboard.
- **Migrations 34-36:** additive; leave in place.
- **Migration 38:** not trivially reversible (rewritten functions, new constraint value). Restore the old function bodies from `20261016000025_tutor_payouts.sql` and `20261016000031_payout_fixes.sql` if needed, and release held rows manually after review. Use the step-0 backup for anything else.
- **Migration 37:** see section 4 rollback.

## 8. Record the receipts

For the release evidence packet, save: migration list before and after, function version numbers before and after, waitlist deployment ID, smoke test results, and the backup location. Update `HANDOFF.md` and the audit execution log in the same pass. Items still open afterwards: gateway client-IP header sample, alert delivery test, restore rehearsal, legal, Stripe live, device voice testing, domain cutover, and the `braces@3.0.3` security-owner decision.
