export const LOCAL_URL = "http://127.0.0.1:54321";
let cached: { anon: string; service: string } | null = null;
export function localKeys(): { anon: string; service: string } {
  if (cached) return cached;
  const out = Bun.spawnSync(["bunx", "supabase", "status", "-o", "json"], { cwd: `${import.meta.dir}/../..` });
  const j = JSON.parse(out.stdout.toString());
  cached = { anon: j.ANON_KEY, service: j.SERVICE_ROLE_KEY };
  return cached;
}
