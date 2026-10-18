import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { aggregateUsage, convertRow, mapPersonIds, transformBundle, PERSON_ID_COLUMNS } from "../scripts/migrate/transform";
import type { ExportBundle } from "../scripts/migrate/types";
import { MIGRATION_SPIKE_DIR } from "./helpers/migration-fixtures";

const SPIKE = MIGRATION_SPIKE_DIR;
const read = (f: string) => JSON.parse(readFileSync(`${SPIKE}/${f}`, "utf8"));

describe("migration transform", () => {
  it("converts Buildy values to the column types and drops unknown fields", () => {
    const row = convertRow("learner_task", { id: "a", created_by: "x@y.z", minutes: "15", optional: "false", created_date: "old", status: "done" });
    expect(row).toEqual({ id: "a", created_by: "x@y.z", minutes: 15, optional: false, status: "done" });
    expect(convertRow("learner_task", { id: "b", minutes: "" }).minutes).toBeNull();
  });
  it("maps person ids to the new logins and reports unknown ones, not guessed (Review Focus 1)", () => {
    const report = { unknownPersonIds: [] as any[] };
    const people = new Map([["old-1", { newId: "new-1", email: "a@x" }]]);
    const row = mapPersonIds("booking", { id: "b1", learner_user_id: "old-1", tutor_user_id: "ghost" }, people, report as any);
    expect(row).toMatchObject({ learner_user_id: "new-1", tutor_user_id: "ghost" });
    expect(report.unknownPersonIds).toEqual([{ entity: "booking", id: "b1", column: "tutor_user_id", value: "ghost" }]);
    expect(PERSON_ID_COLUMNS).toContain("user_id");
  });
  it("merges Buildy's one-row-per-message usage into one daily-total row per learner and day", () => {
    const rows = [
      { id: "1", user_id: "u", period: "day", period_key: "2026-10-12", ai_messages: 1, created_at: "2026-10-12T10:00:00Z" },
      { id: "2", user_id: "u", period: "day", period_key: "2026-10-12", ai_messages: 1, created_at: "2026-10-12T09:00:00Z" },
      { id: "3", user_id: "u", period: "day", period_key: "2026-10-13", ai_messages: 1, created_at: "2026-10-13T09:00:00Z" },
    ];
    const merged = aggregateUsage(rows);
    expect(merged.map((r: any) => [r.period_key, r.ai_messages, r.source_session_id, r.id])).toEqual([["2026-10-12", 2, "daily-total", "2"], ["2026-10-13", 1, "daily-total", "3"]]);
  });
  it("transforms the Plan 1 export of m3imm with owners and no Buildy hosts", () => {
    const people = [{ buildyId: read("m3imm.learner_task.json")[0].user_id, email: "obsidianteamhq+m3imm@agentmail.to", fullName: "Test", buildyRole: "user" as const }];
    const bundle: ExportBundle = { exportedAt: "x", people, rows: { learner_task: read("m3imm.learner_task.json"), usage_counter: read("m3imm.usage_counter.json") } };
    const { tables, report } = transformBundle(bundle, new Map([[people[0].buildyId, { newId: "11111111-1111-1111-1111-111111111111", email: people[0].email }]]));
    expect(tables.learner_task.length).toBe(35);
    expect(tables.learner_task.every((r: any) => r.owner_id === "11111111-1111-1111-1111-111111111111" && r.user_id === "11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(tables.usage_counter.length).toBeLessThan(9);
    expect(report.usageMerged.from).toBe(9);
    expect(report.unknownPersonIds).toEqual([]);
    expect(report.buildyHosts).toEqual([]);
  });
});
