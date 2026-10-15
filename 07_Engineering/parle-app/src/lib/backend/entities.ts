import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBuildyQuery } from "./query";

type Row = Record<string, any>;
const fail = (e: { message?: string } | null | undefined): never => { throw new Error(`API request failed: ${e?.message ?? "unknown error"}`); };
const UNKNOWN_COLUMN = /column .* does not exist|Could not find the '.*' column/i;

/** Buildy's entity(name) surface on top of supabase-js (backend Plan 2). Row-level rules decide what the caller may see. */
export function makeEntity(client: SupabaseClient, name: string) {
  async function filter(query: Record<string, unknown> = {}, sort?: string, limit?: number, skip?: number): Promise<Row[]> {
    const run = (s?: string) => applyBuildyQuery(client.from(name).select("*"), query, s, limit, skip) as unknown as Promise<{ data: Row[] | null; error: any }>;
    let { data, error } = await run(sort);
    if (error && sort && UNKNOWN_COLUMN.test(error.message)) ({ data, error } = await run(undefined)); // Buildy ignores unknown sort fields
    if (error) fail(error);
    return data ?? [];
  }
  return {
    filter,
    list: (opts: { sort?: string; limit?: number; skip?: number } = {}) => filter({}, opts.sort, opts.limit, opts.skip),
    async get(id: string) { const { data, error } = await client.from(name).select("*").eq("id", id).single(); if (error) fail(error); return data as Row; },
    async create(row: Row) { const { data, error } = await client.from(name).insert(row).select("*").single(); if (error) fail(error); return data as Row; },
    async update(id: string, row: Row) { const { data, error } = await client.from(name).update(row).eq("id", id).select("*").single(); if (error) fail(error); return data as Row; },
    async delete(id: string) { const { error } = await client.from(name).delete().eq("id", id); if (error) fail(error); },
    async bulkCreate(rows: Row[]) { const { data, error } = await client.from(name).insert(rows).select("*"); if (error) fail(error); return (data ?? []) as Row[]; },
  };
}
