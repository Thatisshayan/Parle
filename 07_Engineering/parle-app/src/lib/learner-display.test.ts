import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "@/lib/i18n";
import { calculateCompletedStudyProgress, gradePracticeAnswer } from "@/lib/roadmap-engine";
import {
  approximateNclcLevel,
  cefrLabelForScore,
  checkInResultCopyKey,
  completedMinutesForLocalDate,
  completedMinutesForLocalDateRange,
  formatCalendarDate,
  formatCurrentEstimate,
  formatLearnerLevel,
  formatSkillLevel,
  formatTaskCountLabel,
  learnerLocalDateFromUtcTimestamp,
  scheduledMinutesForTasks,
  shuffleQuestionOptions,
} from "@/lib/learner-display";

describe("Parle learner display helpers", () => {
  it("formats date-only values with the year without shifting the calendar day", () => {
    assert.equal(
      formatCalendarDate("2028-04-17", { weekday: "long", month: "long", day: "numeric" }, "en-US"),
      "Monday, April 17, 2028",
    );
    assert.equal(formatCalendarDate("not-a-date", {}, "en-US"), "not-a-date");
  });

  it("counts only completed minutes on the learner's local date across a UTC midnight", () => {
    const tasks = [
      { status: "done", minutes: 12, completedAtUtc: "2026-10-12T03:30:00.000Z" },
      { status: "done", minutes: 18, completedAtUtc: "2026-10-12T04:30:00.000Z" },
      { status: "done", minutes: 8, completedAtUtc: "2026-10-11T03:30:00.000Z" },
      { status: "planned", minutes: 40, completedAtUtc: "2026-10-12T03:45:00.000Z" },
      { status: "done", minutes: 14, completedAtUtc: "" },
    ];

    assert.equal(completedMinutesForLocalDate(tasks, "2026-10-11", "America/Toronto"), 12);
    assert.equal(completedMinutesForLocalDate(tasks, "2026-10-12", "America/Toronto"), 18);
  });

  it("counts a Sunday completion in its local week and keeps the Monday plan row done", () => {
    const timeZone = "America/Toronto";
    const tasks = [
      {
        id: "monday-task",
        dateLocal: "2026-10-12",
        status: "done",
        minutes: 10,
        completedAtUtc: "2026-10-11T14:30:00.000Z",
      },
      {
        id: "tuesday-task",
        dateLocal: "2026-10-13",
        status: "done",
        minutes: 24,
        completedAtUtc: "2026-10-13T15:00:00.000Z",
      },
      {
        id: "missing-time-task",
        dateLocal: "2026-10-14",
        status: "done",
        minutes: 80,
        completedAtUtc: "",
      },
    ];
    const progressTasks = tasks.map((task) => ({
      dateLocal: learnerLocalDateFromUtcTimestamp(task.completedAtUtc, timeZone) ?? "",
      minutes: task.minutes,
      status: task.status,
    }));
    const progress = calculateCompletedStudyProgress(progressTasks, "2026-10-13");
    const todayThisWeek = completedMinutesForLocalDateRange(tasks, "2026-10-12", "2026-10-18", timeZone);

    assert.equal(learnerLocalDateFromUtcTimestamp(tasks[0].completedAtUtc, timeZone), "2026-10-11");
    assert.equal(completedMinutesForLocalDate(tasks, "2026-10-11", timeZone), 10);
    assert.equal(completedMinutesForLocalDateRange(tasks, "2026-10-05", "2026-10-11", timeZone), 10);
    assert.equal(todayThisWeek, 24);
    assert.equal(todayThisWeek, progress.completedMinutesByWeek["2026-10-12"] ?? 0);
    assert.equal(progress.completedMinutesByWeek["2026-10-05"], 10);
    assert.equal(tasks[0].dateLocal, "2026-10-12");
    assert.equal(tasks[0].status, "done");
  });

  it("keeps an 11:30 p.m. completion on the learner's date west of UTC", () => {
    const timeZone = "America/Los_Angeles";
    const task = { status: "done", minutes: 18, completedAtUtc: "2026-10-12T06:30:00.000Z" };

    assert.equal(learnerLocalDateFromUtcTimestamp(task.completedAtUtc, timeZone), "2026-10-11");
    assert.equal(completedMinutesForLocalDate([task], "2026-10-11", timeZone), 18);
    assert.equal(completedMinutesForLocalDate([task], "2026-10-12", timeZone), 0);
    assert.equal(completedMinutesForLocalDateRange([task], "2026-10-05", "2026-10-11", timeZone), 18);
    assert.equal(completedMinutesForLocalDateRange([task], "2026-10-12", "2026-10-18", timeZone), 0);
  });

  it("keeps Today's scheduled total equal to its visible task rows and completed minutes timestamp-based", () => {
    const todayTasks = [
      { status: "done", minutes: 12, completedAtUtc: "2026-10-12T15:00:00.000Z" },
      { status: "planned", minutes: 25, completedAtUtc: "2026-10-12T16:00:00.000Z" },
      { status: "skipped", minutes: 10, completedAtUtc: null },
    ];
    const listedTaskMinutes = todayTasks.reduce((total, task) => total + task.minutes, 0);

    assert.equal(scheduledMinutesForTasks(todayTasks), listedTaskMinutes);
    assert.equal(scheduledMinutesForTasks(todayTasks), 47);
    assert.equal(completedMinutesForLocalDate(todayTasks, "2026-10-12", "America/Toronto"), 12);
  });

  it("labels CEFR anchors and quarter scores with consistent tie-up rounding", () => {
    assert.deepEqual(
      [0, 0.25, 0.5, 1, 1.25, 1.5, 2.5, 3.5, 4.5, 5].map(cefrLabelForScore),
      ["A0", "A0", "A1", "A1", "A1", "A2", "B1", "B2", "C1", "C1"],
    );
    assert.equal(formatSkillLevel(1, "en-US"), "A1 · 1.00 / 5");
    assert.equal(formatSkillLevel(1.25, "en-US"), "A1 · 1.25 / 5");
    assert.equal(formatSkillLevel(1.5, "en-US"), "A2 · 1.50 / 5");
  });

  it("uses only the approved approximate NCLC anchors on Canadian tracks", () => {
    const scores = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    assert.deepEqual(scores.map((score) => approximateNclcLevel(score, "immigration")), [3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(approximateNclcLevel(1.75, "citizenship"), 4, "quarter-step ties round to the higher NCLC anchor");
    assert.equal(approximateNclcLevel(1.25, "immigration"), "below");
    assert.equal(approximateNclcLevel(1, "general"), null);
    assert.equal(formatLearnerLevel(1, "immigration", "en-US"), "A1 · 1.00 / 5 · Approx. below NCLC 3");
    assert.equal(formatLearnerLevel(2, "citizenship", "en-US"), "A2 · 2.00 / 5 · Approx. NCLC 4");
    assert.equal(formatLearnerLevel(2, "general", "en-US"), "A2 · 2.00 / 5");
  });

  it("keeps the exact estimate caveat beside each current estimate", () => {
    assert.equal(
      formatCurrentEstimate(1, "general", "en-US"),
      "A1 · 1.00 / 5 · Estimate - not an official score",
    );
    assert.equal(
      formatCurrentEstimate(1.25, "citizenship", "en-US"),
      "A1 · 1.25 / 5 · Approx. below NCLC 3 · Estimate - not an official score",
    );
  });

  it("uses singular task wording only for one task", () => {
    const singular = "{count} task today";
    const plural = "{count} tasks today";
    assert.equal(formatTaskCountLabel(1, singular, plural), "1 task today");
    assert.equal(formatTaskCountLabel(2, singular, plural), "2 tasks today");
    assert.equal(formatTaskCountLabel(0, singular, plural), "0 tasks today");
  });

  it("selects a result label by each evidence row's kind", () => {
    assert.equal(t(checkInResultCopyKey("listening")), "Listening: {correct} of {total} correct, {comparison}");
    assert.equal(t(checkInResultCopyKey("reading")), "Reading: {correct} of {total} correct, {comparison}");
    assert.equal(t(checkInResultCopyKey("grammar")), "Grammar and vocabulary: {correct} of {total} correct, {comparison}");
  });

  it("shuffles each question's option view while scoring the correct stable ID after repeated displays", () => {
    const question = {
      id: "weekly-reading-1",
      kind: "reading" as const,
      options: [
        { id: "place-park", text: "the park" },
        { id: "place-library", text: "the library" },
        { id: "place-station", text: "the station" },
        { id: "place-market", text: "the market" },
      ],
      answerOptionId: "place-park",
    };
    const originalOptions = [...question.options];
    const displays = [
      shuffleQuestionOptions([question], () => 0),
      shuffleQuestionOptions([question], () => 0.999999),
      shuffleQuestionOptions([question], () => 0.45),
    ].map(([shuffled]) => shuffled);

    assert.ok(new Set(displays.map((display) => display.options.map((option) => option.id).join(","))).size > 1);
    assert.deepEqual(question.options, originalOptions, "the saved question order remains untouched");
    for (const display of displays) {
      assert.equal(display.answerOptionId, "place-park");
      assert.equal(display.options.find((option) => option.id === display.answerOptionId)?.text, "the park");
      assert.equal(gradePracticeAnswer(display.options, display.answerOptionId, "place-park")?.correct, true);
      assert.equal(new Set(display.options.map((option) => option.id)).size, question.options.length);
    }
  });
});
