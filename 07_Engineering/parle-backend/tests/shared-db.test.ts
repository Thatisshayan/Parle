import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { ownedTable } from "../supabase/functions/_shared/db";

const admin = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("ownedTable", () => {
  it("stamps owner and creator on insert and ignores those fields in the input", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const t = ownedTable(admin(), { id: a.id, email: a.email, role: "learner" }, "ParleProfile");
    const row = await t.insertMine({ owner_id: b.id, created_by: b.email, id: crypto.randomUUID(), time_zone: "America/Toronto" });
    expect({ owner: row.owner_id, by: row.created_by }).toEqual({ owner: a.id, by: a.email });
  });
  it("cannot update or find another user's row", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const tb = ownedTable(admin(), { id: b.id, email: b.email, role: "learner" }, "ParleProfile");
    const rowB = await tb.insertMine({ time_zone: "UTC" });
    const ta = ownedTable(admin(), { id: a.id, email: a.email, role: "learner" }, "ParleProfile");
    await expect(ta.updateMine(rowB.id, { time_zone: "Europe/Paris" })).rejects.toThrow("NOT_FOUND");
    expect(await ta.findMine({ id: rowB.id })).toEqual([]);
  });
});
