import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const ENTITIES = `${import.meta.dir}/../../../parle-app/entities`;
const OUT = `${import.meta.dir}/../../supabase/functions/_shared/entity-rules.json`;

/** Buildy's own access rule per entity and operation, as written in entities/*.json ("rls"). */
export function generateEntityRules(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of readdirSync(ENTITIES).filter((f) => f.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(`${ENTITIES}/${f}`, "utf8"));
    const rls = d.rls ?? {};
    out[f.slice(0, -5)] = { read: rls.read, create: rls.create, update: rls.update, delete: rls.delete };
  }
  return out;
}
if (import.meta.main) { writeFileSync(OUT, JSON.stringify(generateEntityRules(), null, 2) + "\n"); console.log("wrote entity-rules.json"); }
