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

describe("duplicate counting mirrors the unique indexes (review findings 3, 4)", () => {
  it("week_plan counts only active rows of the same user and week", () => {
    const rows = [{ user_id: "a", week_start_local: "2026-10-12", status: "active" }, { user_id: "a", week_start_local: "2026-10-12", status: "replaced" }, { user_id: "a", week_start_local: "2026-10-12", status: "replaced" }];
    expect(summarise("week_plan", { readable: true, rows }, UNIQUE_KEYS.week_plan).duplicates).toBe(0);
  });
  it("booking counts requested and confirmed on the same slot as a collision", () => {
    const rows = [{ tutor_user_id: "t", start_time_utc: "2026-11-02T23:00:00.000Z", status: "requested" }, { tutor_user_id: "t", start_time_utc: "2026-11-02T23:00:00.000Z", status: "confirmed" }];
    expect(summarise("booking", { readable: true, rows }, UNIQUE_KEYS.booking).duplicates).toBe(1);
  });
  it("usage_counter keys with empty parts still count (that index has no empty-string exception)", () => {
    const rows = [{ user_id: "", period: "day", period_key: "" }, { user_id: "", period: "day", period_key: "" }];
    expect(summarise("usage_counter", { readable: true, rows }, UNIQUE_KEYS.usage_counter).duplicates).toBe(1);
  });
  it("coach notes with empty key parts are ignored (that index excludes them)", () => {
    const rows = [{ user_id: "", local_date: "" }, { user_id: "", local_date: "" }];
    expect(summarise("ParleCoachNote", { readable: true, rows }, UNIQUE_KEYS.ParleCoachNote).duplicates).toBe(0);
  });
});
