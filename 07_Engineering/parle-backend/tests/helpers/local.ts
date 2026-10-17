import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

export const LOCAL_URL = "http://127.0.0.1:54321";
let cached: { anon: string; service: string } | null = null;
// `supabase status` can take 10 s; the local keys do not change between restarts, so they are kept for 12 hours in the
// stack's own git-ignored folder (Plan 12). Delete the file to force a fresh lookup.
const CACHE = `${import.meta.dir}/../../supabase/.temp/local-keys.json`;
const CACHE_MS = 12 * 3_600_000;

export function localKeys(): { anon: string; service: string } {
  if (cached) return cached;
  try {
    if (existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < CACHE_MS) {
      const keys = JSON.parse(readFileSync(CACHE, "utf8"));
      if (keys.anon && keys.service) return (cached = keys);
    }
  } catch { /* a broken cache is replaced below */ }
  const out = Bun.spawnSync(["bunx", "supabase", "status", "-o", "json"], { cwd: `${import.meta.dir}/../..` });
  const j = JSON.parse(out.stdout.toString());
  cached = { anon: j.ANON_KEY, service: j.SERVICE_ROLE_KEY };
  try {
    mkdirSync(`${import.meta.dir}/../../supabase/.temp`, { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cached));
  } catch { /* the cache is only a speed-up */ }
  return cached;
}
