import { describe, it, expect } from "bun:test";
import { scanShapes } from "../scripts/spikes/filter-shapes";

describe("scanShapes", () => {
  it("counts operators, sort strings, limit and skip use", () => {
    const src = `
      learner_task.filter({ user_id: me.id, status: { $ne: "done" } }, "-created_at", 50);
      week_plan.filter({ minutes: { $gte: 10, $lt: 60 }, skill: { $in: ["reading"] } }, "date_local", 10, 20);
      x.filter({ a: 1 });`;
    expect(scanShapes(src)).toEqual({ operators: { $ne: 1, $gte: 1, $lt: 1, $in: 1 }, sorts: { "-created_at": 1, date_local: 1 }, withLimit: 2, withSkip: 1 });
  });
});
