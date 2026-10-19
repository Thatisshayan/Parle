# Security-owner acceptance proposal — `braces@3.0.3`

**Finding:** GHSA-vfj7-8cjw-p6xm / CVE-2026-93687  
**Severity:** High upstream availability risk  
**Decision status:** **PENDING SECURITY-OWNER ACCEPTANCE**  
**Proposed scope:** Bounded build/CI risk acceptance only; this is not a runtime vulnerability acceptance.

## Current evidence

- The GitHub Advisory Database lists `braces <= 3.0.3` as affected and currently lists **no patched version**: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- npm currently lists `3.0.3` as the latest published version: [braces on npm](https://www.npmjs.com/package/braces).
- The app lockfile pins `braces@3.0.3` and shows the path through `chokidar@3.6.0` and `micromatch@4.0.8` (`07_Engineering/parle-app/bun.lock`).
- Tailwind content inputs are developer-authored literal paths in `07_Engineering/parle-app/tailwind.config.ts`: `pages`, `components`, `app`, and `src` TypeScript/TSX globs. No learner, tutor, or request body is used as a glob pattern.
- The local Bun 1.3.10 `bun pm why` command could not parse this lockfile (`UnknownLockfileVersion`); dependency-path evidence therefore comes from the checked-in lockfile and prior registry-backed scan, not from an invented clean result.
- The advisory's impact is stack exhaustion when an attacker can supply deeply nested brace patterns to the vulnerable parser. The reviewed Parle runtime does not expose a user-controlled Tailwind/glob parser path. The remaining risk is build/CI availability and any future tooling path that accepts untrusted patterns.

## Proposed bounded acceptance

The security owner may accept the finding temporarily for the **developer/build toolchain only** if all conditions below are recorded:

1. No production runtime dependency or user-facing request path imports `braces` as an application feature.
2. Tailwind and related glob inputs remain checked-in static paths; changes that introduce user-controlled patterns require a new security review.
3. CI continues to run locked dependency installation and the full quality workflow on every release candidate.
4. Build runners are isolated and disposable; a build failure is treated as a release-blocking availability incident rather than retried indefinitely.
5. The acceptance expires on **2026-11-19** or when a patched upstream release/toolchain replacement is available, whichever comes first.
6. Reopen immediately if a patched release appears, a runtime import is added, a dynamic glob source is introduced, or a build runner processes untrusted pattern input.

## Owner decision record

| Field | Value |
|---|---|
| Security owner | **Pending** |
| Decision | **Pending — accept bounded build/CI risk / remediate / reject** |
| Scope | Build/CI tooling only; no production runtime acceptance |
| Expiry/review date | 2026-11-19 proposed |
| Compensating controls | Static globs, locked CI, disposable runners, release-blocking build failure |
| Evidence reviewed | `AUDIT_REPORT.md`, app lockfile, Tailwind config, current advisory/npm pages |
| Signature/date | **Pending** |

Until this table is completed by the security owner, the advisory remains a launch gate and public release remains **NO-GO**.

