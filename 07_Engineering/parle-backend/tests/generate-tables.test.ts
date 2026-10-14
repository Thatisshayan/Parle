import { describe, it, expect } from "bun:test";
import { tableSql } from "../scripts/schema/generate-tables";

describe("tableSql", () => {
  const sql = tableSql({ name: "usage_counter", properties: { user_id: { type: "string" }, period: { type: "string", enum: ["day", "month"] }, ai_messages: { type: "number" }, optional: { type: "boolean" }, tags: { type: "array" } } });
  it("creates the table with system columns first", () => {
    expect(sql).toContain('create table public."usage_counter" (');
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("owner_id uuid references auth.users(id) on delete set null");
  });
  it("maps field types and enums", () => {
    expect(sql).toContain('"user_id" text');
    expect(sql).toContain(`"period" text check ("period" in ('day','month',''))`);
    expect(sql).toContain('"ai_messages" double precision');
    expect(sql).toContain('"optional" boolean');
    expect(sql).toContain('"tags" jsonb');
  });
  it("adds the updated_at trigger and an owner index", () => {
    expect(sql).toContain('create trigger set_updated_at before update on public."usage_counter"');
    expect(sql).toContain('create index on public."usage_counter" (owner_id)');
  });
  it("escapes quotes in enum values", () => {
    expect(tableSql({ name: "t", properties: { k: { type: "string", enum: ["it's"] } } })).toContain("'it''s'");
  });
});
