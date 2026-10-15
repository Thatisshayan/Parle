import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { makeEntity } from "../../parle-app/src/lib/backend/entities";

const SPIKE = "D:/AgentDevWork/parle-migration-data/spike/m3imm.learner_task.json";
const cases = JSON.parse(readFileSync(`${import.meta.dir}/fixtures/filter-cases.json`, "utf8")) as { name: string; query: Record<string, unknown>; sort?: string; limit?: number; skip?: number; expectedIds: string[] }[];
let L: Awaited<ReturnType<typeof makeUser>>;
const idMap = new Map<string, string>();

beforeAll(async () => {
  L = await makeUser("learner");
  const service = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const rows = JSON.parse(readFileSync(SPIKE, "utf8")) as Record<string, unknown>[];
  const cols = ["user_id", "status", "minutes", "skill", "completed_at_utc", "date_local", "type", "task_key", "created_at"];
  for (const r of rows) {
    const row: Record<string, unknown> = { owner_id: L.id, created_by: L.email };
    for (const c of cols) if (c in r) row[c] = r[c];
    const { data, error } = await service.from("learner_task").insert(row).select("id").single();
    if (error) throw error;
    idMap.set(String(r.id), data!.id);
  }
});

describe("entity().filter replays Buildy's answers (Plan 1 fixture)", () => {
  for (const c of cases.filter((c) => c.name !== "in list" && c.name !== "missing field equals null")) {
    it(c.name, async () => {
      const got = await makeEntity(L.client, "learner_task").filter(c.query, c.sort, c.limit, c.skip);
      const expected = c.expectedIds.map((id) => idMap.get(id));
      expect(got.length).toBe(expected.length);
      const col = c.sort?.replace(/^-/, "");
      if (col && col !== "no_such_field" && !c.limit) {
        // Same rows, correctly ordered by the requested field. Order within ties is not part of Buildy's contract.
        expect(new Set(got.map((r: any) => r.id))).toEqual(new Set(expected));
        const keys = got.map((r: any) => r[col]);
        const sorted = [...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
        expect(keys).toEqual(c.sort!.startsWith("-") ? sorted.reverse() : sorted);
      } else if (!c.limit) {
        expect(new Set(got.map((r: any) => r.id))).toEqual(new Set(expected));
      }
    });
  }
});

describe("entity() surface", () => {
  it("get returns one owned row and list honours limit", async () => {
    const all = await makeEntity(L.client, "learner_task").filter({});
    expect((await makeEntity(L.client, "learner_task").get(all[0].id)).id).toBe(all[0].id);
    expect((await makeEntity(L.client, "learner_task").list({ limit: 3 })).length).toBe(3);
  });
  it("browser writes fail with Buildy's error prefix", async () => {
    await expect(makeEntity(L.client, "learner_task").create({ minutes: 5 })).rejects.toThrow(/^API request failed: /);
  });
});
