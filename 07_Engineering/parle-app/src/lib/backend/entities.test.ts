import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeEntity } from "./entities";

type Result = { data: Record<string, unknown> | null; error: { message: string } | null };
interface UpdateQuery {
  update(values: Record<string, unknown>): UpdateQuery;
  eq(column: string, value: unknown): UpdateQuery;
  is(column: string, value: null): UpdateQuery;
  select(columns: string): UpdateQuery;
  maybeSingle(): Promise<Result>;
}

class FakeUpdateQuery implements UpdateQuery {
  constructor(private readonly calls: Array<[string, ...unknown[]]>, private readonly result: Result) {}
  update(values: Record<string, unknown>): UpdateQuery { this.calls.push(["update", values]); return this; }
  eq(column: string, value: unknown): UpdateQuery { this.calls.push(["eq", column, value]); return this; }
  is(column: string, value: null): UpdateQuery { this.calls.push(["is", column, value]); return this; }
  select(columns: string): UpdateQuery { this.calls.push(["select", columns]); return this; }
  async maybeSingle(): Promise<Result> { return this.result; }
}

function fakeClient(result: Result) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = new FakeUpdateQuery(calls, result);
  const client = { from: (table: string) => { calls.push(["from", table]); return query; } } as unknown as SupabaseClient;
  return { client, calls };
}

describe("entity conditional update", () => {
  it("updates only when the id and current claim fields match, using IS NULL for null fields", async () => {
    const data = { id: "task-1", source_ref: "preparing:123" };
    const { client, calls } = fakeClient({ data, error: null });
    const saved = await makeEntity(client, "learner_task").updateWhere(
      "task-1",
      { source_ref: "preparing:123" },
      { content_source: "pending", source_ref: null },
    );

    expect(saved).toEqual(data);
    expect(calls).toEqual([
      ["from", "learner_task"],
      ["update", { source_ref: "preparing:123" }],
      ["eq", "id", "task-1"],
      ["eq", "content_source", "pending"],
      ["is", "source_ref", null],
      ["select", "*"],
    ]);
  });

  it("returns null when another worker already claimed the row", async () => {
    const { client } = fakeClient({ data: null, error: null });
    const saved = await makeEntity(client, "learner_task").updateWhere(
      "task-1",
      { source_ref: "preparing:456" },
      { content_source: "pending", source_ref: "preparing:123" },
    );

    expect(saved).toBeNull();
  });

  it("throws a database error instead of reporting a successful update", async () => {
    const { client } = fakeClient({ data: null, error: { message: "database unavailable" } });

    await expect(makeEntity(client, "learner_task").updateWhere("task-1", { source_ref: "preparing:123" }, {}))
      .rejects.toThrow("API request failed: database unavailable");
  });
});
