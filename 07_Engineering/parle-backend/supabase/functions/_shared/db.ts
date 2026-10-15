import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Caller } from "./caller.ts";
import { isUniqueConflict } from "./retry.ts";

const PROTECTED = ["id", "owner_id", "created_by", "created_at", "updated_at"];
const clean = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !PROTECTED.includes(k)));

/** Full-rights client for server code; only used after getCaller() has identified the user. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

/** Reads and writes limited to the caller's own rows; owner and creator are always stamped from the caller. */
export function ownedTable(admin: SupabaseClient, caller: Caller, table: string) {
  async function findMine(filters: Record<string, unknown> = {}, sort = "-created_at", limit = 100) {
    let q: any = admin.from(table).select("*").eq("owner_id", caller.id);
    for (const [k, v] of Object.entries(filters)) q = v === null ? q.is(k, null) : q.eq(k, v);
    const desc = sort.startsWith("-");
    q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc }).limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, any>[];
  }
  async function insertMine(row: Record<string, unknown>) {
    const { data, error } = await admin.from(table).insert({ ...clean(row), owner_id: caller.id, created_by: caller.email }).select("*").single();
    if (error) throw new Error(error.message);
    return data as Record<string, any>;
  }
  async function updateMine(id: string, row: Record<string, unknown>) {
    const { data, error } = await admin.from(table).update(clean(row)).eq("id", id).eq("owner_id", caller.id).select("*");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("NOT_FOUND");
    return data[0] as Record<string, any>;
  }
  /** Update the caller's row, or create it; if a simultaneous first save won, update that row instead (R11). */
  async function saveMine(values: Record<string, unknown>, defaults: Record<string, unknown> = {}) {
    const [existing] = await findMine({}, "-created_at", 1);
    if (existing) return updateMine(existing.id, values);
    try {
      return await insertMine({ ...defaults, ...values });
    } catch (e) {
      if (!isUniqueConflict(e)) throw e;
      const [winner] = await findMine({}, "-created_at", 1);
      if (!winner) throw e;
      return updateMine(winner.id, values);
    }
  }
  return { findMine, insertMine, updateMine, saveMine };
}
