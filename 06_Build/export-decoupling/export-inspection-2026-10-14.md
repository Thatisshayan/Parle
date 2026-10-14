# Export inspection, first pass (2026-10-14)

Source: `C:\Users\AgentDev\Downloads\buildy-parle-path.zip` (founder export, 2026-10-14 ~4:50 pm ET, sha256 prefix
d31097a2b9cedf07). Committed untouched as `07_Engineering/parle-app/` (commit 0026c3f). Map of the code:
`buildy-export-handbook-2026-10-14.md`.

## Contents
- 229 files, about 59,000 lines (TypeScript / TSX / JSON). React + Vite + Tailwind + shadcn front end, 36 pages in
  `src/pages/`, 36 entity definitions in `entities/`, 24 server files in `functions/` (4 deployed functions plus
  helpers), 26 test files.
- Package name still `vite_react_shadcn_ts`; README is Buildy's one-line stub.

## Checks run (outside Buildy, on this PC)
| Check | Result |
|---|---|
| Secret scan (Stripe / JWT / AWS / private-key / long-token patterns, `.env` files) | None found |
| Real email addresses | None; only placeholder test addresses (`*@parle.test`, `*@example.test`) |
| `bun install` | 443 packages, OK |
| `bun run build` | **Builds.** One 2.0 MB JS chunk (503 KB gzip); Vite warns >500 KB; code-splitting needed |
| Tests: `VITE_APP_ID=parle-test-app VITE_SUPERDEV_BASE_URL=https://parle-test.invalid bun test` | **350 pass, 0 fail, 26 files**, same total as Buildy's last report. Without those two variables 2 files error ("appId is required"). Plain `node --test` cannot resolve the extensionless imports; Bun is the runner. No `test` script in package.json yet |

## Platform dependence (what ties it to Buildy)
- `src/lib/superdev/client.ts`: `createSuperdevClient({ appId: VITE_APP_ID, baseUrl: VITE_SUPERDEV_BASE_URL, ... })`;
  42 files import the Buildy client, `@/entities`, `@/functions` or `@/integrations/core`.
- 4 server functions use the Buildy SDK (`parle-assessment-service`, `parle-marketplace-service`,
  `parle-marketplace-refresh`, `parle-public-level-check`); they run on Buildy's Deno hosting.
- Icons, favicon and social image load from Buildy-hosted storage (`index.html`, `public/manifest.json`); copy
  them into `public/` before leaving Buildy.
- Dev dependency `superdev-tagger` and `plugins/superdev-compile-check.ts` are Buildy build helpers.

## What this means for the next steps (decisions #37 / #38)
- The front end can be built and hosted anywhere today, but while it uses `VITE_APP_ID` / `VITE_SUPERDEV_BASE_URL` it
  still talks to Buildy's backend (data, sign-in, functions). A protected Vercel preview of this code would be the
  same app on a new address with Buildy still behind it, so the owner-session and access-wall limits stay until the
  backend is replaced.
- Real decoupling = replace the client layer (sign-in, entities, functions, integrations) with our own backend; the
  deferred list (`deferred-defects.md` D1-D28, `security-debt.md` S1-S29) is the work list.

## Next
1. Founder decision on the order: (a) protected Vercel preview of the front end against Buildy's backend first, or
   (b) choose and stand up our backend first, then the preview.
2. Waitlist page on parle.buzz (independent of the above).
3. Housekeeping in the code: add `test` script with the two variables, rename the package, copy icons locally,
   code-split the bundle.
