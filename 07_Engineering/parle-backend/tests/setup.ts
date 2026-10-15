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
