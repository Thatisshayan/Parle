import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";

/**
 * Plan 11 (A102): listening audio made before the switch to Azure is in NVIDIA's voice. This removes it (file first,
 * then the row), so the next request makes it again in the Azure voice. Run by the founder as a `!` command:
 *   bun scripts/prod/reset-listening-audio.ts --check   counts only
 *   bun scripts/prod/reset-listening-audio.ts           deletes
 * Prints counts only.
 */
export const AZURE_SINCE = "2026-10-16T23:00:00Z";
const BUCKET = "listening-audio";
const PAGE = 100;

export async function resetBefore(db: SupabaseClient, iso: string, opts: { dryRun?: boolean } = {}): Promise<{ found: number; deleted: number }> {
  let found = 0, deleted = 0;
  for (;;) {
    const { data, error } = await db.from("listening_audio").select("cache_key, path").eq("status", "ready").lt("ready_at", iso)
      .order("cache_key").range(opts.dryRun ? found : 0, (opts.dryRun ? found : 0) + PAGE - 1);
    if (error) throw new Error(`list failed (${error.code})`);
    const rows = data ?? [];
    found += rows.length;
    if (opts.dryRun) { if (rows.length < PAGE) break; continue; }
    if (!rows.length) break;
    const paths = rows.map((r) => String(r.path)).filter(Boolean);
    if (paths.length) {
      const removed = await db.storage.from(BUCKET).remove(paths);
      if (removed.error) throw new Error(`file removal failed (${removed.error.name})`);
    }
    const { error: delError } = await db.from("listening_audio").delete().in("cache_key", rows.map((r) => String(r.cache_key))).eq("status", "ready");
    if (delError) throw new Error(`row removal failed (${delError.code})`);
    deleted += rows.length;
    if (rows.length < PAGE) break;
  }
  return { found, deleted };
}

if (import.meta.main) {
  const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
  const check = process.argv.includes("--check");
  const r = await resetBefore(db, AZURE_SINCE, { dryRun: check });
  console.log(check ? `listening audio made before ${AZURE_SINCE}: ${r.found}` : `removed ${r.deleted} listening audio files and rows made before ${AZURE_SINCE}`);
}
