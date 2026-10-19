# Parle release evidence packet

**Status:** Prepared for owner review; not a release authorization.

**Candidate baseline:** `codex-branch` at `ac86b4c` (Phase 61 packet commit). Complete Quality Gates [39219997735](https://github.com/Thatisshayan/Parle/actions/runs/39219997735) passed the full ephemeral-Supabase backend suite, app tests/typechecks/lint/build, generated-source checks, launch preflight and Deno checks. Any release candidate must rerun the full workflow after the final SHA is frozen.

**Decision:** Public release remains **NO-GO**. This packet makes the required receipts concrete; it does not claim that any production deployment, migration, DNS/Auth change, live Stripe action, backup restore, alert delivery, legal approval, or device review has occurred.

## Evidence already available

| Evidence | Reference | Scope and limit |
|---|---|---|
| Full CI | [39217414034](https://github.com/Thatisshayan/Parle/actions/runs/39217414034) | Backend 665 pass / 1 authorized skip / 0 fail across 666 tests and 109 files, app tests/types/lint/build, generated-source checks, launch preflight and Deno checks. Source/ephemeral environment only. |
| Audit reports | Local `AUDIT_REPORT.md` and external `D:\AgentDevWork\repos\Hackaton\Parle\Codex\AUDIT_REPORT.md` | SHA-256 `7315627C31A2672F1D10F56F215A17277DFD9326F8DF7C57EE78479794D06ADF` for both copies at Phase 60. |
| Vercel preview | `parle-592hbexf6`, `parle-dcoy1uz19` | Protected READY previews for earlier commits. No deployment exists for `581cb64` or `8321128`; neither preview is production evidence. |
| Security scan | Prior sealed scan plus Phase 59 continuation record | Prior coverage is partial (792 indexed / 1,001 inventoried). The continuation stopped at the platform usage limit with no manifest. No clean-scan claim is permitted. |
| Dependency disposition | Phase 45 and `security-debt.md` | `braces@3.0.3` remains open pending security-owner acceptance, as directed by the user. |

## Production deployment units to reconcile

The production operator and engineering must produce a receipt for each unit actually enabled in the release. The list below is the repository inventory, not proof that all units are deployed or required for every cohort.

| Unit | Repository source | Required receipt |
|---|---|---|
| `parle-account-service` | `07_Engineering/parle-backend/supabase/functions/parle-account-service/index.ts` | Reviewed function deploy, config/secret names, smoke result |
| `parle-admin-service` | `07_Engineering/parle-backend/supabase/functions/parle-admin-service/index.ts` | Reviewed function deploy, admin auth smoke |
| `parle-assessment-service` | `07_Engineering/parle-backend/supabase/functions/parle-assessment-service/index.ts` | Reviewed deploy, placement/assessment smoke |
| `parle-lesson-service` | `07_Engineering/parle-backend/supabase/functions/parle-lesson-service/index.ts` | Reviewed deploy, booking/payment smoke |
| `parle-marketplace-service` | `07_Engineering/parle-backend/supabase/functions/parle-marketplace-service/index.ts` | Reviewed deploy, marketplace auth/body-cap smoke |
| `parle-plan-service` | `07_Engineering/parle-backend/supabase/functions/parle-plan-service/index.ts` | Reviewed deploy, plan/placement smoke |
| `parle-payout-service` | `07_Engineering/parle-backend/supabase/functions/parle-payout-service/index.ts` | Reviewed deploy, held-payout/refund/rate-limit smoke |
| `parle-voice-service` | `07_Engineering/parle-backend/supabase/functions/parle-voice-service/index.ts` | Reviewed deploy, relay-secret and body-cap smoke |
| `stripe-webhook` | `07_Engineering/parle-backend/supabase/functions/stripe-webhook/index.ts` | Reviewed deploy, signature/idempotency/dispute retry evidence |
| `parle-booking-jobs` | `07_Engineering/parle-backend/supabase/functions/parle-booking-jobs/index.ts` | Reviewed scheduled-job deploy and lease/cleanup evidence |
| `parle-billing-recheck` | `07_Engineering/parle-backend/supabase/functions/parle-billing-recheck/index.ts` | Reviewed scheduled-job deploy and reconciliation evidence |
| `parle-waitlist-join` | `07_Engineering/parle-backend/supabase/functions/parle-waitlist-join/index.ts` | Deploy with migration 000037, production IP-header/aggregate smoke |
| `parle-waitlist-unsubscribe` | `07_Engineering/parle-backend/supabase/functions/parle-waitlist-unsubscribe/index.ts` | Reviewed deploy and 413/body-cap smoke |
| `parle-waitlist-jobs` | `07_Engineering/parle-backend/supabase/functions/parle-waitlist-jobs/index.ts` | Reviewed scheduled-job deploy and retention evidence |
| `parle-public-level-check` | `07_Engineering/parle-backend/supabase/functions/parle-public-level-check/index.ts` | Reviewed deploy, IP/rate/body-cap smoke |
| `parle-marketplace-refresh` | `07_Engineering/parle-backend/supabase/functions/parle-marketplace-refresh/index.ts` | Reviewed scheduled refresh deploy and alert/lease evidence |
| Vercel app | `07_Engineering/parle-app` | Exact-SHA build/deploy receipt, protected preview or production target, smoke and rollback URL |

## Required owner receipts before a future GO review

1. **Schema/access:** linked production project, migration comparison, RLS/storage policy review, gateway header sample, and migration/function/app deployment receipts.
2. **Recovery:** paid plan/PITR decision, isolated restore with invariants, rollback rehearsal, and named operator.
3. **Payments:** Stripe live-readiness checklist, Accounts API decision, webhook/idempotency/refund/dispute/payout reconciliation, and finance owner sign-off.
4. **Security:** successful continuation of the same Deep Scan with manifest, final dependency scan, and security-owner decision for `braces@3.0.3`.
5. **Legal/content:** signed Terms/Privacy/consent/retention/adult-only/tutor-refund decisions, vendor posture, content provenance and blind-review record.
6. **Device/accessibility:** exact-SHA browser/device/assistive-technology matrix, contrast/focus/reduced-motion results, and defect dispositions.
7. **Operations:** named primary/backup responders, alert delivery and acknowledgement, provider budgets, support hours, cohort bounds, and stop criteria.
8. **Cutover:** DNS/domain verification, Auth site URL/redirects, `APP_URL`/origins, waitlist/app smoke, and tested rollback.

## Packet completion rule

The founder/production operator reassembles this packet against one frozen SHA. A hard gate is closed only when the receipt is attached and the named owner accepts it. Any exception must include bounded mitigation, expiry/review date, and explicit owner approval. Until then, keep traffic restricted to the protected preview/waitlist posture.

