import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
const ENTITY_DIR = `${import.meta.dir}/../../parle-app/entities`;
const entities = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => ({ name: f.slice(0, -5), props: JSON.parse(readFileSync(`${ENTITY_DIR}/${f}`, "utf8")).properties as Record<string, { type: string; enum?: string[] }> }));
const PUBLIC = new Set(["tutor_public_profile", "tutor_review", "tutor_review_reply", "tutor_payout_country"]);
/** Rebuilt with real types in Plan 7A (no owner_id / created_by columns); its read rule is in booking-schema.test.ts. */
const SERVER_TYPED = new Set(["booking"]);
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

/** A valid row of empty values for an entity (Buildy stored empty fields as ""). */
function emptyRow(props: Record<string, { type: string; enum?: string[] }>) {
  // fields in per-person unique keys get unique values so rows from earlier runs never collide; others stay ""
  const UNIQUE_PARTS = new Set(["user_id", "period_key", "key", "profile_id"]);
  return Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.type === "number" ? 0 : p.type === "boolean" ? false : p.type === "array" ? [] : (p.enum?.[0] ?? (UNIQUE_PARTS.has(k) ? `t-${crypto.randomUUID().slice(0, 8)}` : ""))]));
}

describe("access coverage (R5, R6)", () => {
  it("every public table except the waitlist has row-level security on", () => {
    const off = psql("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and relname <> 'waitlist_signup'");
    expect(off).toBe("");
  });
  it("no other learner and no anonymous visitor can read a learner's row in any private table", async () => {
    const owner = await makeUser("learner"), other = await makeUser("learner");
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const leaks: string[] = [];
    for (const e of entities.filter((x) => !PUBLIC.has(x.name) && !SERVER_TYPED.has(x.name))) {
      const { data, error } = await service().from(e.name).insert({ ...emptyRow(e.props), owner_id: owner.id, created_by: owner.email }).select("id").single();
      if (error) { leaks.push(`${e.name}: could not seed (${error.message})`); continue; }
      for (const [who, c] of [["anon", anon], ["other learner", other.client]] as const) {
        const { data: seen } = await (c as any).from(e.name).select("id").eq("id", data!.id);
        if ((seen ?? []).length) leaks.push(`${e.name}: readable by ${who}`);
      }
    }
    expect(leaks).toEqual([]);
  }, 60000);
});
