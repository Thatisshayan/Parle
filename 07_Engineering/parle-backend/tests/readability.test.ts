import { describe, it, expect } from "bun:test";
import { summarise, UNIQUE_KEYS } from "../scripts/spikes/readability";

describe("summarise", () => {
  it("separates not readable from zero rows", () => {
    expect(summarise("question_item", { readable: false, status: 403, error: "Forbidden" })).toEqual({ entity: "question_item", readable: false, rows: 0, duplicates: 0, note: "403 Forbidden" });
    expect(summarise("booking", { readable: true, rows: [] })).toEqual({ entity: "booking", readable: true, rows: 0, duplicates: 0, note: "" });
  });
  it("counts rows that repeat a unique key", () => {
    const rows = [{ user_id: "a", period: "day", period_key: "2026-10-14" }, { user_id: "a", period: "day", period_key: "2026-10-14" }, { user_id: "b", period: "day", period_key: "2026-10-14" }];
    expect(summarise("usage_counter", { readable: true, rows }, UNIQUE_KEYS.usage_counter).duplicates).toBe(1);
  });
});
