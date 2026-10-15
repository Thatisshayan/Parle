import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pendingTaskIds, prepareTasks, withPreparedTask } from "./task-content-queue.ts";
import { TaskContent } from "../pages/LearnerTodayPlan.tsx";
import type { LearnerTaskView } from "./learner-plan.ts";

const task = (id: string, over: Partial<LearnerTaskView> = {}): LearnerTaskView => ({
  id, taskKey: id, dateLocal: "2026-10-19", scheduledAtUtc: "", completedAtUtc: "", type: "writing", skill: "writing",
  minutes: 10, topic: "work", reason: "weekly_practice", reasonSkill: null, status: "planned", rolloverCount: 0,
  optional: false, tutorWindow: "", contentSource: "pending", sourceRef: "", content: {}, ...over,
});

describe("Today fills practice after showing the plan (A28, D1)", () => {
  it("prepares today's open pending tasks first, then later days, and nothing else", () => {
    const plan = { today: "2026-10-19", tasks: [
      task("later", { dateLocal: "2026-10-21" }),
      task("today"),
      task("done", { status: "done" }),
      task("skipped", { status: "skipped" }),
      task("ready", { contentSource: "generated" }),
      task("rolled", { status: "rolled", dateLocal: "2026-10-20" }),
    ] };
    assert.deepEqual(pendingTaskIds(plan), ["today", "rolled", "later"]);
  });
  it("puts a prepared task back without changing its status", () => {
    const plan = { tasks: [task("a", { status: "done" }), task("b")] };
    const next = withPreparedTask(plan, task("a", { contentSource: "generated", content: { title: "Au bureau", instructions: "Lisez." } }));
    assert.equal(next.tasks[0].status, "done");
    assert.equal(next.tasks[0].contentSource, "generated");
    assert.equal(next.tasks[0].content.title, "Au bureau");
    assert.equal(next.tasks[1].contentSource, "pending");
  });
  it("prepares two at a time and keeps going after a failure (Review Focus 3)", async () => {
    let running = 0, most = 0;
    const done: string[] = [], failed: string[] = [];
    await prepareTasks(["a", "b", "c", "d"], async (id) => {
      running += 1; most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (id === "b") throw new Error("API request failed: 500");
      return task(id, { contentSource: "generated" });
    }, (t) => done.push(t.id), (id) => failed.push(id));
    assert.equal(most, 2);
    assert.deepEqual(done.sort(), ["a", "c", "d"]);
    assert.deepEqual(failed, ["b"]);
  });
  it("shows a waiting note on a pending card", () => {
    const html = renderToStaticMarkup(createElement(TaskContent, {
      task: task("p"), answers: {}, onAnswer: () => {}, vocabularyRevealed: {}, vocabularyResponses: {},
      onRevealVocabulary: () => {}, onRateVocabulary: () => {},
    }));
    assert.match(html, /Preparing your practice/);
    assert.match(html, /role="status"/);
  });
  it("the Today page prepares pending tasks once the plan is shown, and a failed card offers a refresh", () => {
    const src = readFileSync(new URL("../pages/LearnerTodayPlan.tsx", import.meta.url), "utf8");
    assert.match(src, /pendingTaskIds\(plan\)/);
    assert.match(src, /prepareTasks\(/);
    assert.match(src, /prepareMyTaskContent/);
    assert.match(src, /contentSource: "unavailable" as const/);
  });
});
