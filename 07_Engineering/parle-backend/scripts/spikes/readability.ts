import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { readAccounts } from "../lib/test-accounts";
import { signIn, listAll, type ReadResult } from "../buildy/client";

export const ENTITY_DIR = "D:/AgentDevWork/repos/Parle/07_Engineering/parle-app/entities";
export const EXPORT_DIR = "D:/AgentDevWork/parle-migration-data/spike";

/** Natural keys that must be unique in the new schema (Task 8). Null-safe: rows missing a key part are ignored. */
export const UNIQUE_KEYS: Record<string, string[]> = {
  learner_profile: ["user_id"],
  usage_counter: ["user_id", "period", "period_key"],
  week_plan: ["user_id", "week_start_local", "status"],
  ParleCoachNote: ["user_id", "local_date"],
  Subscriber: ["user_id"],
  app_setting: ["key"],
  booking: ["tutor_user_id", "start_time_utc", "status"],
  tutor_booking_settings: ["tutor_user_id"],
};

export function summarise(entity: string, result: ReadResult, uniqueKeys?: string[]) {
  if (!result.readable) return { entity, readable: false, rows: 0, duplicates: 0, note: `${result.status} ${result.error}` };
  let duplicates = 0;
  if (uniqueKeys) {
    const seen = new Set<string>();
    for (const r of result.rows) {
      if (uniqueKeys.some((k) => r[k] === undefined || r[k] === null || r[k] === "")) continue;
      const key = uniqueKeys.map((k) => String(r[k])).join("|");
      if (seen.has(key)) duplicates++;
      else seen.add(key);
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
