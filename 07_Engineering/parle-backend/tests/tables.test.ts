import { describe, it, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { ENTITY_DIR } from "../scripts/spikes/readability";

describe("app tables in local staging", () => {
  it("has one table per Buildy entity", async () => {
    const names = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    for (const n of names) {
      const { error } = await db.from(n).select("id").limit(1);
      expect({ table: n, error: error?.message ?? null }).toEqual({ table: n, error: null });
    }
    expect(names.length).toBe(36);
  });
});
