# Owner-gate verification — 2026-10-19

**Status:** Engineering verification complete where access was available; production and owner gates remain open.

This record covers the three requested workstreams: `braces@3.0.3`, production migration/cutover verification, and backup/restore/rollback rehearsal. It is read-only for hosted systems and local-only for the database rehearsal.

## 1. `braces@3.0.3`

- Current advisory status: affected through `3.0.3`, no patched release listed, npm latest `3.0.3`.
- Locked dependency path: `braces@3.0.3` → `chokidar@3.6.0` / `micromatch@4.0.8` in `07_Engineering/parle-app/bun.lock`.
- Reachability control: Tailwind uses literal checked-in paths in `tailwind.config.ts`; no request or learner/tutor value reaches the glob parser in the reviewed app path.
- Action completed: created [`SECURITY_OWNER_ACCEPTANCE_BRACES.md`](SECURITY_OWNER_ACCEPTANCE_BRACES.md) with bounded scope, compensating controls, expiry, reopen triggers, and a pending owner decision table.
- Decision: **not self-accepted**. Security-owner signature remains required.

## 2. Production migration, RLS, function, Vercel, DNS, Auth, and gateway verification

### Read-only command results

- Native Bun launch check completed successfully and reported exactly three findings:
  1. Supabase Auth `site_url` is `https://parle-preview-shayans-projects-d00acc44.vercel.app`, not `https://parle.buzz`.
  2. `APP_URL` is not `https://parle.buzz`.
  3. `parle.buzz` is on `parle-waitlist`, not `parle-app`.
- Native Bun launch-switch dry run completed with no mutation and printed four required actions: move the domain, deploy the approved app to Vercel Production, update Auth site/redirects, then set `APP_URL`.
- `supabase migration list --linked` returned `ProjectRefNotLinkedError`; production migration/RLS drift cannot be verified from this checkout until an authorized operator links the production project.

### Vercel and DNS evidence

- `parle-app`: `live:false`, SSO protection enabled, latest branch preview READY, target `null`.
- `parle-waitlist`: `parle.buzz` and `www.parle.buzz` remain attached; latest deployment target is production.
- Latest `codex-branch` preview for `c5964c3` is READY and non-production: `parle-ielxiqgb8-shayans-projects-d00acc44.vercel.app`.
- DNS: `parle.buzz` resolves to `216.150.1.1`; `www.parle.buzz` CNAME resolves to `bf1e4357e217add6.vercel-dns-016.com`.
- Public HTTP check: `https://parle.buzz/` returns `200` from Vercel and serves “Join the waitlist” HTML. It is not serving the app.
- Gateway header limitation: the public root response exposes no client-IP forwarding header. This does not validate Supabase ingress behavior for rate limiting; an authorized operator must inspect sampled function ingress headers.

**Decision:** production migration, RLS, function deployment, Vercel production, DNS, Auth, and gateway gates remain **BLOCKED**. No provider mutation was performed.

## 3. Backup/restore and rollback rehearsal

### Local recovery rehearsal

- Source: running local disposable container `supabase_db_parle-staging`.
- Backup: `pg_dump -Fc --no-owner --no-acl --schema=public --schema=private` completed successfully.
- Restore target: disposable database inside the same local container.
- Required local extension provisioned: `btree_gist`.
- Application pre-data and data restore completed with exit code `0`.
- Verification: **59 public application tables** and approximately **17,034 live rows** restored.
- Provider-owned exclusions recorded: `pg_cron` and `realtime` cannot be replayed into an arbitrary database; application foreign keys referencing `auth.users` require the production Auth dataset or an authorized equivalent. These are not silently treated as restored.
- All disposable restore databases and dump artifacts were removed after verification.

### Rollback rehearsal evidence

- Launch-switch dry run verified the ordered rollback-sensitive sequence without changing DNS/Auth/`APP_URL`.
- Vercel has READY protected previews for `c5964c3`, `26b75ae`, and `ac86b4c`, providing concrete prior deployment references for a future operator rollback.
- No production deployment or rollback was executed. DNS/Auth rollback, migration rollback, and live backup restoration remain owner/operator actions.

**Decision:** local application recovery is evidenced; production backup/PITR, provider-managed restore, and production rollback remain **NOT PROVEN**.

## Required next owner actions

1. Security owner completes the decision table in `SECURITY_OWNER_ACCEPTANCE_BRACES.md`.
2. Production operator links the authorized Supabase project, captures migration/RLS/storage/function receipts, and samples gateway headers.
3. Founder/operator selects the paid backup/PITR plan, restores into an isolated project, records invariants and duration, and rehearses Vercel/DNS/Auth/application rollback.

