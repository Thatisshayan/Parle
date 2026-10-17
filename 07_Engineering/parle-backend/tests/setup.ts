// bunfig.toml's [test] timeout is ignored by this Bun (1.3.10), so the 30 s default is set here: a cold local Edge
// Function worker takes about 5 s to start, which made tests fail at Bun's 5 s default (Plan 12).
import { setDefaultTimeout } from "bun:test";
setDefaultTimeout(30_000);
// Shared Edge Function modules read settings through Deno.env; under Bun they read process.env.
(globalThis as any).Deno ??= { env: { get: (k: string) => process.env[k] } };
import { plugin } from "bun";
// Edge Functions import supabase-js with Deno's npm: specifier; map it to the installed package for Bun tests.
const target = require.resolve("@supabase/supabase-js");
plugin({
  name: "npm-specifier",
  setup(b) {
    b.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: target }));
    b.onResolve({ filter: /^@supabase\/supabase-js@2$/, namespace: "npm" }, () => ({ path: target, namespace: "file" }));
  },
});
