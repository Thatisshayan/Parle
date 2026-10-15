import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "../tests/helpers/local";

/** Plan 1 export (outside the repo). The learner account m3imm could read the demo bank and the settings on Buildy. */
const SPIKE = "D:/AgentDevWork/parle-migration-data/spike";
const TABLES = [
  { table: "question_item", file: "imm1.question_item.json", key: "demo_code" },
  { table: "prompt_item", file: "imm1.prompt_item.json", key: "demo_code" },
  { table: "app_setting", file: "imm1.app_setting.json", key: "key" },
];
const DROP = new Set(["id", "created_at", "updated_at", "created_date", "updated_date", "created_by_id", "is_sample"]);

/** Loads the demo content into local staging; safe to run again (adds only rows whose natural key is missing). */
export async function seedLocalContent(): Promise<Record<string, number>> {
  const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const loaded: Record<string, number> = {};
  for (const { table, file, key } of TABLES) {
    const path = `${SPIKE}/${file}`;
    if (!existsSync(path)) throw new Error(`Plan 1 export file missing: ${path}`);
    const { data: present, error: readError } = await db.from(table).select(key).limit(10000);
    if (readError) throw new Error(`${table}: ${readError.message}`);
    const have = new Set((present ?? []).map((r: any) => r[key]));
    const rows = (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[])
      .filter((r) => !have.has(r[key]))
      .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !DROP.has(k))));
    if (!rows.length) { loaded[table] = 0; continue; }
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
    loaded[table] = rows.length;
  }
  return loaded;
}

if (import.meta.main) console.log("seeded", await seedLocalContent());
