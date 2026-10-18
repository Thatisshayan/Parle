# Operations and Cutover Readiness — Parle

**Status:** Phase 31 full quality workflow is green; cutover is NOT ready. R59's PostgreSQL deadlock was reproduced and fixed in code, but migration 000036 has not been deployed to production. No DNS, Vercel, Auth, secret, production migration, backup, alert or deployment changes were made.

**Review date:** 2026-10-18
**Owners:** Founder / production operator; Operations; Engineering

## Rehearsal evidence

### Production launch preflight (read-only)

Ran `bun run scripts/prod/launch-check.ts` against the linked Supabase/Vercel project. Exit code 0. The script hashes secret values and prints names/status only. It found:

1. Supabase Auth `site_url` is still the Vercel preview URL; it must become `https://parle.buzz` after cutover.
2. Supabase function secret `APP_URL` does not match `https://parle.buzz`.
3. `parle.buzz` currently resolves to Vercel project `parle-waitlist`, not `parle-app`.

No finding was emitted for the required Vercel Production environment variable names, `APP_ORIGINS`, or the reset-password redirect URI. This records only what the script checks; it does not validate secret correctness, provider health, deploy readiness, live payments, or end-to-end email links.

### Launch-switch dry-run

Ran `bun run scripts/prod/launch-switch.ts --dry-run`; exit code 0. It printed four planned actions and made no changes:

1. Founder moves `parle.buzz` and `www.parle.buzz` from `parle-waitlist` to `parle-app`, configuring `www` as a 308 redirect.
2. Founder deploys the approved application release to Vercel Production.
3. Script updates Supabase Auth site URL/redirect allow-list after the domain serves the app.
4. Script sets `APP_URL` after the domain serves the app.

The command's runtime guard prevents scripted Supabase settings from applying until the domain is reported on `parle-app`; Phase 5 tests cover the guard. Do not run the non-dry-run switch until the founder executes and verifies the domain move.

### Migration and local stack evidence

- `bun x supabase migration list --linked` could not run: this checkout has no linked Supabase project (`ProjectRefNotLinkedError`). No `supabase link` operation was attempted. Production-versus-repository migration state is therefore unverified.
- `supabase/config.toml` identifies a local project named `parle-staging`; it is not proof of the production project or its schema state.
- Local Docker-backed Edge Function integration tests ran in Phase 5. The standalone `supabase status` check could not start because Bun's temporary directory access was denied; this does not change the completed integration-test evidence.
- Phase 31's migration 000036 applied successfully to the local Docker and ephemeral CI databases. Full CI run [39170462275](https://github.com/Thatisshayan/Parle/actions/runs/39170462275) on `d05f32b` passed all jobs: backend 638 pass / 1 skip / 0 fail (2,480 expectations; 639 tests/105 files), app tests/types/lint/build and generated-source/Deno checks. The sole skipped test is the real Plan 1 paying-account migration/set-password rehearsal. This is code and disposable-environment evidence only; the production migration state was not inspected or changed.
- Repository records identify the Supabase Free plan as having no managed backups. Current backup/restore capability and an actual restoration rehearsal were not verified. Treat recoverability as NOT PROVEN.

### Monitoring and incident response

Local tests verify some administrator payout/dispute alert messages and routes. No alert was sent to a real operational destination, and no production alert rule/receiver or on-call acknowledgement was tested. No primary or backup incident owner is named in repository evidence. Proposed provider spend, latency and error thresholds are documented in `AI_PROVIDER_BUDGET_READINESS.md`; they are not yet accepted or configured.

## Operator runbook before any controlled release

1. Name a primary and backup for product availability, database/auth, AI/speech cost, email, Stripe/webhook, refunds/disputes/payouts, privacy incidents and user support. Record contact path and escalation response target.
2. Freeze the exact release SHA. Run current app/backend typechecks, full suites, Deno checks, production build, lint and dependency scans on that SHA. Phase 30 reproduced R59 as PostgreSQL `deadlock detected`; Phase 31 migration 000036 serializes holds per tutor, and CI run 39170462275 passes with the 30-pair regression. ESLint currently has zero errors and 18 Fast Refresh warnings. Complete the real-account rehearsal and obtain security-owner disposition for the unpatched dev-only `braces@3.0.3` advisory; produce current dependency scans on the frozen SHA.
3. From the authorized production account, compare every repository migration version with the project's applied history. Inspect security/RLS and storage policy drift. Capture redacted evidence. Never run `db push`, migrations or repair commands as part of a read-only check.
4. Confirm the paid database plan, automatic backup/PITR retention, backup owner and restore procedure. Restore into an isolated non-production project, verify row counts/invariants and record duration. A dashboard backup indicator alone is not a restore test.
5. Configure alerts for auth/API availability, Edge Function 5xx/latency, database capacity, webhook age/failure, payout holds, duplicate/refund anomalies, provider spend/quotas and email failures. Use proposed starting thresholds in `AI_PROVIDER_BUDGET_READINESS.md` pending owner acceptance. Send a test alert to primary and backup and capture acknowledged evidence.
6. Rehearse rollback in a disposable preview: previous Vercel deployment, domain redirect route, Auth site/allow-list and `APP_URL` restoration. Include an approved recovery path for the reviewed backend migration/function release (000036) and the prior `lesson_hold` implementation; confirm the rollback preserves booking integrity and document how to reapply the concurrency guard. Record who can perform each action and how to validate email links, login, payment-return URLs and API calls.
7. Only after domain, application deployment and owner checks pass, run the protected non-dry-run launch switch. Capture sanitized `ready` output, then execute founder-owned smoke tests. Keep the waitlist's restoration path available through the observation window.

## Current disposition

**NO-GO for cutover.** Three explicit domain/Auth blockers above remain; production migration drift, backups/restore, live alert delivery, named incident owners and rollback rehearsal also lack evidence. Migration 000036 and the matching backend release need a reviewed operator deployment before the R59 fix affects production. The domain move, production deployment, Auth/secret mutation, migration and finance actions require the founder/authorized operator. Deployment needed to publish this runbook: no. Application/domain deployment remains founder-operated and has not occurred.
