import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { readAccounts } from "../lib/test-accounts";
import { signIn, listAll, type ReadResult } from "../buildy/client";

export const ENTITY_DIR = resolve(import.meta.dir, "../../../parle-app/entities");
export const EXPORT_DIR = process.env.PARLE_MIGRATION_SPIKE_DIR ?? "D:/AgentDevWork/parle-migration-data/spike";

/**
 * Natural keys that must be unique in the new schema. Each entry mirrors one unique index in
 * supabase/migrations/20261014000002_constraints.sql: same columns, same row filter, same treatment of "".
 */
export type UniqueKey = { cols: string[]; where?: (r: Record<string, unknown>) => boolean; skipEmpty: boolean };
const live = (r: Record<string, unknown>) => r.status === "requested" || r.status === "confirmed";
export const UNIQUE_KEYS: Record<string, UniqueKey> = {
  learner_profile: { cols: ["user_id"], skipEmpty: true },
  usage_counter: { cols: ["user_id", "period", "period_key"], skipEmpty: false },
  week_plan: { cols: ["user_id", "week_start_local"], where: (r) => r.status === "active", skipEmpty: true },
  ParleCoachNote: { cols: ["user_id", "local_date"], skipEmpty: true },
  Subscriber: { cols: ["user_id"], skipEmpty: true },
  app_setting: { cols: ["key"], skipEmpty: true },
  booking: { cols: ["tutor_user_id", "start_time_utc"], where: live, skipEmpty: true },
  tutor_booking_settings: { cols: ["tutor_user_id"], skipEmpty: true },
};

export function summarise(entity: string, result: ReadResult, key?: UniqueKey) {
  if (!result.readable) return { entity, readable: false, rows: 0, duplicates: 0, note: `${result.status} ${result.error}` };
  let duplicates = 0;
  if (key) {
    const seen = new Set<string>();
    for (const r of result.rows) {
      if (key.where && !key.where(r)) continue;
      if (key.cols.some((k) => r[k] === undefined || r[k] === null)) continue;
      if (key.skipEmpty && key.cols.some((k) => r[k] === "")) continue;
      const v = key.cols.map((k) => String(r[k])).join("|");
      if (seen.has(v)) duplicates++;
      else seen.add(v);
    }
  }
  return { entity, readable: true, rows: result.rows.length, duplicates, note: "" };
}

if (import.meta.main) {
  const entities = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  mkdirSync(EXPORT_DIR, { recursive: true });
  const lines: string[] = ["| account | entity | readable | rows | duplicate keys | note |", "|---|---|---|---|---|---|"];
  for (const acc of readAccounts()) {
    let session;
    try { session = await signIn(acc.email, acc.password); }
    catch { lines.push(`| ${acc.label} | (sign-in) | no | 0 | 0 | sign-in failed |`); continue; }
    for (const e of entities) {
      const r = await listAll(session, e);
      if (r.readable) writeFileSync(`${EXPORT_DIR}/${acc.label}.${e}.json`, JSON.stringify(r.rows));
      const s = summarise(e, r, UNIQUE_KEYS[e]);
      if (s.rows > 0 || !s.readable) lines.push(`| ${acc.label} | ${e} | ${s.readable ? "yes" : "no"} | ${s.rows} | ${s.duplicates} | ${s.note} |`);
    }
  }
  writeFileSync(`${EXPORT_DIR}/accounts-table.md`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}
