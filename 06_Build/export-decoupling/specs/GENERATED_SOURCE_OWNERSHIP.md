# Generated App Source Ownership

**Status:** Active engineering rule  
**Scope:** TypeScript modules from `07_Engineering/parle-app` copied into `07_Engineering/parle-backend/supabase/functions/_app/` for use by Supabase Edge Functions.

## Source of truth

- `parle-app` owns the canonical source. Make shared app behavior changes in the app source tree.
- `parle-backend/supabase/functions/_app/` is generated output. Do not hand-edit it; generator output will overwrite those edits.
- `parle-backend/scripts/sync-app-code.ts` owns the copy rules and server-specific import rewrites.
- `ENTRY_FILES` declares app function entry points transformed from `Deno.serve(...)` to exported handlers. `LIB_ROOTS` declares additional server-shared app modules. The generator follows their relative and `@/` TypeScript imports recursively.
- `SHIMS` and `REWRITES` map app-only aliases or packages to backend-compatible modules. Add or change such mappings in the generator, not in generated output.

## Change procedure

From `07_Engineering/parle-backend`:

1. Edit canonical app source in `07_Engineering/parle-app`.
2. If a module must be included independently of an entry point, add it to `LIB_ROOTS`; update `ENTRY_FILES`, `SHIMS`, or `REWRITES` only when the generator contract requires it.
3. Run `node scripts/sync-app-code.ts` (Bun is also supported). This writes changed generated files and removes stale generated files.
4. Review the app source and generated diff together. Generated files start with a provenance comment; any behavior-only difference belongs in an explicit backend adapter under `_shared/`, or a documented generator rewrite.
5. Run `bun test tests/app-code-sync.test.ts` and `deno check --no-lock supabase/functions/*/index.ts`.
6. Commit canonical source, generated output, generator changes, and meaningful tests in the same change. Deploy affected Edge Functions only through the approved release process; a local sync does not update production.

## Drift prevention and ownership

`tests/app-code-sync.test.ts` regenerates the expected map and compares it with every file on disk, including path-set equality. This catches both stale content and orphaned generated files. The check is part of the backend test suite and now runs in `.github/workflows/quality.yml`, along with both launch-preflight tests and Deno checks for all 15 function entry points. The workflow also runs app tests, typechecks, lint and production build. It intentionally excludes backend integration tests that mutate the local database; keep those as a separately controlled local gate until an isolated test database is available. A passing CI run still does not prove production has received the change.

For review, trace generated output back to the source path in its first-line comment. Never fix a generated-file defect directly: change the app source or generator rule, regenerate, and retain the regression test. Backend-only behavior belongs outside `_app/` so future synchronization cannot erase it.
