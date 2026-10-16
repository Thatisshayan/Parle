import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateCompletedMinutesByWeek,
  applyCheckInEvidence,
  applyCheckInUpdates,
  buildCheckInChangeNote,
  buildWeeklyPlan,
  calculateAllocationShares,
  calculateOverallReadiness,
  calculateSkillProgressPercentage,
  calculateStudyStreak,
  calculateCompletedStudyProgress,
  gradePracticeAnswer,
  transitionLearnerTaskStatus,
  validatePracticeAnswerKey,
  cefrToScore,
  comparisonFromThreeItemScore,
  createRoadmapPlanKey,
  compareWritingLevel,
  guidedHoursBetween,
  nclcToScore,
  planPremiumLanguagePointPractice,
  type PremiumLanguagePointPracticeInput,
  normalizeLevelScore,
  parseTargetScore,
  reconcileMissedTasks,
  scoredWritingLevelToScore,
  type PlannerInput,
  type PlannedTask,
  type SkillValues,
  type Weekday,
} from "./roadmap-engine";

const weekdays: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function everyDay(minutes: number): Record<Weekday, number> {
  return Object.fromEntries(weekdays.map((day) => [day, minutes])) as Record<Weekday, number>;
}

function immigrationWeekInput(today: string, overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    track: "immigration",
    current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
    targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
    availability: everyDay(30),
    tutorBudget: "none",
    tutorWindows: [],
    targetDate: null,
    today,
    speakingAssessed: true,
    weekNumber: 2,
    ...overrides,
  };
}

function sum(values: SkillValues<number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function assertClose(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

const premiumTriggerDates = [
  "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
];

function premiumLanguagePointInput(overrides: Partial<PremiumLanguagePointPracticeInput> = {}): PremiumLanguagePointPracticeInput {
  return {
    priorScore: 80,
    nextScore: 50,
    premiumEligible: true,
    triggerEnabled: true,
    languagePoint: "passé composé with être",
    skill: "writing",
    todayLocal: "2026-10-12",
    weekStartLocal: "2026-10-12",
    weekEndLocal: "2026-10-18",
    weekPlanId: "week-plan-current",
    dailyLimits: Object.fromEntries(premiumTriggerDates.map((date) => [date, 36])),
    dailyMinutes: Object.fromEntries(premiumTriggerDates.map((date, index) => [date, index === 0 ? 26 : 30])),
    scheduledTaskMinutes: 206,
    plannedLearningMinutes: 180,
    existingTasks: [],
    existingWhatChangedNote: "A plan built around this week's available study time.",
    ...overrides,
  };
}

describe("Parle deterministic roadmap engine", () => {
  it("reuses a deterministic roadmap key for identical settings and changes it for planning-relevant edits", () => {
    const base = {
      track: "general" as const,
      placementStatus: "unverified" as const,
      startingLevels: { listening: 1, reading: 1, writing: 1, speaking: 1 },
      speakingAssessed: false,
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      targetDate: "2026-11-30",
      availability: { monday: 30, wednesday: 45 },
      tutorBudget: "none",
      tutorWindows: ["weekday_evening"],
      generalGoal: "job interview French",
      timeZone: "America/Toronto",
    };
    const original = createRoadmapPlanKey("profile-1", null, base);
    const reordered = createRoadmapPlanKey("profile-1", null, {
      ...base,
      targets: Object.fromEntries(Object.entries(base.targets).reverse()) as typeof base.targets,
      availability: Object.fromEntries(Object.entries(base.availability).reverse()) as typeof base.availability,
    });
    assert.equal(reordered, original, "object property order must not create a new roadmap");
    assert.equal(createRoadmapPlanKey("profile-1", null, base), original, "repeat visits must reuse the saved plan key");
    assert.notEqual(createRoadmapPlanKey("profile-1", "placement-retake", base), original, "a new placement result must create a new plan key");

    const changedInputs = [
      { ...base, track: "citizenship" as const },
      { ...base, startingLevels: { ...base.startingLevels, listening: 1.25 } },
      { ...base, speakingAssessed: true },
      { ...base, targets: { ...base.targets, speaking: 3.25 } },
      { ...base, targetDate: null },
      { ...base, availability: { ...base.availability, monday: 40 } },
      { ...base, availability: { ...base.availability, tuesday: 20 } },
      { ...base, tutorBudget: "20_35" },
      { ...base, tutorWindows: ["weekend_evening"] },
      { ...base, generalGoal: "French for work" },
      { ...base, timeZone: "America/Vancouver" },
      { ...base, placementStatus: "assessed" as const },
    ];
    changedInputs.forEach((settings, index) => {
      assert.notEqual(
        createRoadmapPlanKey("profile-1", null, settings),
        original,
        `planning input ${index + 1} should create a fresh roadmap key`,
      );
    });
  });

  it("a) plans citizenship around listening and speaking, checks speaking first, and reserves the last available day for check-in", (t) => {
    const plan = buildWeeklyPlan({
      track: "citizenship",
      current: { listening: 1.5, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 2.0, reading: null, writing: null, speaking: 2.0 },
      availability: { monday: 20, tuesday: 20, wednesday: 20, thursday: 20, friday: 20 },
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: false,
      weekNumber: 1,
    });

    assert.equal(plan.tasks.some((task) => task.skill === "reading" || task.skill === "writing"), false);
    assertClose(plan.allocationShare.listening, 1 / 3, 1e-6);
    assertClose(plan.allocationShare.speaking, 2 / 3, 1e-6);
    assert.ok(plan.allocationShare.speaking > plan.allocationShare.listening);
    assert.ok(plan.tasks.some((task) => task.type === "speaking_check" && task.minutes === 10 && task.date === "2026-10-05"));
    const checkIn = plan.tasks.find((task) => task.type === "weekly_checkin");
    assert.ok(checkIn, "the first week should include a weekly check-in");
    assert.equal(checkIn.minutes, 10);
    assert.equal(checkIn.date, plan.scheduleDates.at(-1));
    assert.ok(plan.dailyMinutes[checkIn.date ?? ""] <= plan.dailyLimits[checkIn.date ?? ""]);

    t.diagnostic(`shares listening=${(plan.allocationShare.listening * 100).toFixed(2)}%, speaking=${(plan.allocationShare.speaking * 100).toFixed(2)}%; speaking check=${plan.tasks.find((task) => task.type === "speaking_check")?.date}; weekly check-in=${checkIn.date}`);
  });

  it("plans the first citizenship week from next Monday when a Saturday join leaves no current-week availability", (t) => {
    const plan = buildWeeklyPlan({
      track: "citizenship",
      current: { listening: 1.5, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 3.5, reading: null, writing: null, speaking: 3.5 },
      availability: { monday: 20, tuesday: 20, wednesday: 20, thursday: 20, friday: 20 },
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: null,
      today: "2026-10-10",
      speakingAssessed: false,
      weekNumber: 1,
    });

    assert.equal(plan.weekNumber, 1);
    assert.equal(plan.weekStartDate, "2026-10-12");
    assert.equal(plan.planStartDate, "2026-10-12");
    assert.deepEqual(plan.scheduleDates, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    assert.equal(plan.weeklyMinutes, 100);
    assert.equal(plan.scheduledAvailabilityMinutes, 100);
    assert.ok(plan.tasks.length > 0, "upcoming first-week tasks should be visible");
    assert.ok(plan.tasks.every((task) => plan.scheduleDates.includes(task.date ?? "")));
    assert.ok(plan.tasks.some((task) => task.date === "2026-10-12"), "Monday should have visible first-week tasks");
    assert.equal(plan.tasks.some((task) => task.skill === "reading" || task.skill === "writing"), false);
    assert.ok(plan.tasks.some((task) => task.type === "speaking_check" && task.date === "2026-10-12"));
    assert.ok(plan.tasks.some((task) => task.type === "weekly_checkin" && task.date === "2026-10-16"));
    for (const [date, minutes] of Object.entries(plan.dailyMinutes)) assert.ok(minutes <= 20, `${date} exceeded the available 20 minutes`);
    assert.ok(plan.scheduledTaskMinutes > 0 && plan.scheduledTaskMinutes <= 100);
    assert.equal(plan.scheduledTaskMinutes, plan.tasks.reduce((total, task) => total + task.minutes, 0));

    t.diagnostic(`plan starts ${plan.planStartDate}; first week=${plan.scheduledTaskMinutes}/${plan.scheduledAvailabilityMinutes} scheduled minutes; speaking check Monday; check-in Friday`);
  });

  it("uses only Saturday and Sunday capacity for an immigration learner joining on Saturday", (t) => {
    const plan = buildWeeklyPlan({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: everyDay(30),
      tutorBudget: "20_35",
      tutorWindows: ["weekday_evening"],
      targetDate: null,
      today: "2026-10-10",
      speakingAssessed: false,
      weekNumber: 1,
    });

    assert.equal(plan.planStartDate, "2026-10-10");
    assert.equal(plan.weekStartDate, "2026-10-05");
    assert.deepEqual(plan.scheduleDates, ["2026-10-10", "2026-10-11"]);
    assert.equal(plan.weeklyMinutes, 210);
    assert.equal(plan.scheduledAvailabilityMinutes, 60);
    assert.equal(plan.learningBudgetMinutes, 40);
    assert.equal(plan.tutorSuggestion, null, "the remaining partial week is below the 90-minute tutor threshold");
    assert.equal(plan.tasks.some((task) => task.type === "tutor_lesson"), false);
    assert.ok(plan.tasks.some((task) => task.type === "speaking_check" && task.date === "2026-10-10"));
    assert.ok(plan.tasks.some((task) => task.type === "weekly_checkin" && task.date === "2026-10-11"));
    assert.ok(plan.tasks.some((task) => task.date === "2026-10-10" && task.type !== "speaking_check"));
    assert.ok(plan.tasks.some((task) => task.date === "2026-10-11" && task.type !== "weekly_checkin"));
    assert.equal(plan.dailyMinutes["2026-10-10"], 30);
    assert.equal(plan.dailyMinutes["2026-10-11"], 30);
    assert.equal(plan.scheduledTaskMinutes, 60);
    assert.equal(plan.scheduledTaskMinutes, plan.tasks.reduce((total, task) => total + task.minutes, 0));

    t.diagnostic(`recurring=${plan.weeklyMinutes} min; remaining availability=${plan.scheduledAvailabilityMinutes} min; actual tasks=${plan.scheduledTaskMinutes} min across Saturday and Sunday`);
  });

  it("keeps a Saturday-completed check-in when Sunday refreshes the same local week", () => {
    const initial = buildWeeklyPlan(immigrationWeekInput("2026-10-10"));
    const scheduledCheckIn = initial.tasks.find((task) => task.type === "weekly_checkin");
    assert.ok(scheduledCheckIn);
    assert.equal(scheduledCheckIn.date, "2026-10-11");

    const refreshed = buildWeeklyPlan(immigrationWeekInput("2026-10-11", {
      existingTasks: initial.tasks.map((task) => task.id === scheduledCheckIn.id ? { ...task, status: "done" } : task),
    }));
    const weeklyCheckIns = refreshed.tasks.filter((task) => task.type === "weekly_checkin" && task.status !== "dropped");

    assert.equal(weeklyCheckIns.length, 1, "a saved completed review prevents a second check-in this local week");
    assert.deepEqual(
      { id: weeklyCheckIns[0].id, date: weeklyCheckIns[0].date, status: weeklyCheckIns[0].status },
      { id: scheduledCheckIn.id, date: "2026-10-11", status: "done" },
    );
  });

  it("keeps an already-scheduled weekly check-in during a Sunday refresh", () => {
    const initial = buildWeeklyPlan(immigrationWeekInput("2026-10-10"));
    const scheduledCheckIn = initial.tasks.find((task) => task.type === "weekly_checkin");
    assert.ok(scheduledCheckIn);

    const refreshed = buildWeeklyPlan(immigrationWeekInput("2026-10-11", { existingTasks: initial.tasks }));
    const weeklyCheckIns = refreshed.tasks.filter((task) => task.type === "weekly_checkin" && task.status !== "dropped");

    assert.equal(weeklyCheckIns.length, 1);
    assert.deepEqual(
      { id: weeklyCheckIns[0].id, date: weeklyCheckIns[0].date, status: weeklyCheckIns[0].status },
      { id: scheduledCheckIn.id, date: "2026-10-11", status: "planned" },
    );
  });

  it("counts retained tasks before filling a 7 × 30-minute refresh and stays within 36 minutes per day", () => {
    const retainedTasks: PlannedTask[] = [
      {
        id: "saved-completed-writing",
        date: "2026-10-12",
        type: "writing",
        skill: "writing",
        minutes: 20,
        topic: "work",
        reason: "weekly_practice",
        reasonSkill: "writing",
        status: "done",
        rolloverCount: 0,
        optional: false,
      },
      {
        id: "saved-unfinished-lesson",
        date: "2026-10-12",
        type: "ai_lesson",
        skill: "listening",
        minutes: 20,
        topic: "work",
        reason: "weekly_practice",
        reasonSkill: "listening",
        status: "planned",
        rolloverCount: 0,
        optional: false,
      },
    ];
    const refreshed = buildWeeklyPlan(immigrationWeekInput("2026-10-12", { existingTasks: retainedTasks }));

    assert.equal(refreshed.dailyLimits["2026-10-12"], 36);
    assert.deepEqual(
      {
        id: refreshed.tasks.find((task) => task.id === "saved-completed-writing")?.id,
        date: refreshed.tasks.find((task) => task.id === "saved-completed-writing")?.date,
        status: refreshed.tasks.find((task) => task.id === "saved-completed-writing")?.status,
      },
      { id: "saved-completed-writing", date: "2026-10-12", status: "done" },
      "completed history stays on its original learner-local day",
    );
    assert.deepEqual(
      {
        date: refreshed.tasks.find((task) => task.id === "saved-unfinished-lesson")?.date,
        status: refreshed.tasks.find((task) => task.id === "saved-unfinished-lesson")?.status,
      },
      { date: "2026-10-13", status: "rolled" },
      "the unfinished task moves forward to make room under the daily cap",
    );

    for (const date of refreshed.scheduleDates) {
      const dayTasks = refreshed.tasks.filter((task) => task.date === date && task.status !== "dropped");
      const listedMinutes = dayTasks.reduce((total, task) => total + task.minutes, 0);
      assert.equal(refreshed.dailyLimits[date], 36, `${date} should have a 36-minute ceiling`);
      assert.equal(refreshed.dailyMinutes[date], listedMinutes, `${date} usage should match its listed task rows`);
      assert.ok(listedMinutes <= 36, `${date} reached ${listedMinutes} minutes on a 30-minute allowance`);
    }
    assert.equal(
      refreshed.scheduledTaskMinutes,
      refreshed.tasks.filter((task) => task.status !== "dropped").reduce((total, task) => total + task.minutes, 0),
      "the refreshed weekly total should match all active listed tasks",
    );
  });

  it("suggests a partial-week tutor only with 90 remaining minutes and a matching day that fits 45 minutes", () => {
    const matched = buildWeeklyPlan({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: { monday: 0, tuesday: 60, wednesday: 30, thursday: 30, friday: 30, saturday: 0, sunday: 0 },
      tutorBudget: "20_35",
      tutorWindows: ["weekday_evening"],
      targetDate: null,
      today: "2026-10-06",
      speakingAssessed: true,
      weekNumber: 1,
    });
    assert.equal(matched.scheduledAvailabilityMinutes, 150);
    assert.equal(matched.tutorSuggestion?.date, "2026-10-06");
    assert.equal(matched.tutorSuggestion?.minutes, 45);
    assert.ok((matched.dailyMinutes["2026-10-06"] ?? 0) <= 60);
    assert.ok(matched.tasks.some((task) => task.type === "tutor_lesson" && task.date === "2026-10-06"));

    const noWindowMatch = buildWeeklyPlan({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: { monday: 0, tuesday: 60, wednesday: 30, thursday: 30, friday: 30, saturday: 0, sunday: 0 },
      tutorBudget: "20_35",
      tutorWindows: ["weekend_evening"],
      targetDate: null,
      today: "2026-10-06",
      speakingAssessed: true,
      weekNumber: 1,
    });
    assert.equal(noWindowMatch.scheduledAvailabilityMinutes, 150);
    assert.equal(noWindowMatch.tutorSuggestion, null);

    const noDateFits = buildWeeklyPlan({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: { monday: 0, tuesday: 30, wednesday: 30, thursday: 30, friday: 30, saturday: 0, sunday: 0 },
      tutorBudget: "20_35",
      tutorWindows: ["weekday_evening"],
      targetDate: null,
      today: "2026-10-06",
      speakingAssessed: true,
      weekNumber: 1,
    });
    assert.equal(noDateFits.scheduledAvailabilityMinutes, 120);
    assert.equal(noDateFits.tutorSuggestion, null, "no weekday can fit a 45-minute lesson despite sufficient weekly minutes");
  });

  it("b) marks an eight-week immigration target unlikely and calculates both alternatives", (t) => {
    const plan = buildWeeklyPlan({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3.5, reading: 3.5, writing: 3.5, speaking: 3.5 },
      availability: everyDay(30),
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: "2026-11-30",
      today: "2026-10-05",
      speakingAssessed: true,
    });

    assert.equal(guidedHoursBetween(2, 3.5), 280);
    assert.equal(plan.feasibility.status, "unlikely");
    assert.equal(plan.feasibility.requiredHours, 280);
    assert.equal(plan.feasibility.availableHours, 28);
    assert.equal(plan.feasibility.weeksUntilTarget, 8);
    assert.equal(plan.feasibility.minutesPerDayNeeded, 300);
    assert.equal(plan.feasibility.realisticDate, "2028-04-17");
    assert.equal(plan.feasibility.targetDate, "2026-11-30");

    t.diagnostic(`status=${plan.feasibility.status}; required=${plan.feasibility.requiredHours}h; available=${plan.feasibility.availableHours}h; date option=${plan.feasibility.minutesPerDayNeeded} min/day; realistic-date option=${plan.feasibility.realisticDate}`);
  });

  it("c) never suggests a tutor when the learner selected no paid lessons", (t) => {
    const plan = buildWeeklyPlan({
      track: "general",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: everyDay(60),
      tutorBudget: "none",
      tutorWindows: ["weekday_evening"],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: true,
    });

    assert.equal(plan.tutorSuggestion, null);
    assert.equal(plan.tasks.some((task) => task.type === "tutor_lesson"), false);
    t.diagnostic(`budget=none; tutor suggestions=${plan.tasks.filter((task) => task.type === "tutor_lesson").length}`);
  });

  it("d) creates one 45-minute suggested tutor lesson inside the selected weekday evening window", (t) => {
    const plan = buildWeeklyPlan({
      track: "general",
      current: { listening: 1, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: { monday: 60, tuesday: 30, wednesday: 30, thursday: 30, friday: 0 },
      tutorBudget: "20_35",
      tutorWindows: ["weekday_evening"],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: true,
    });

    const suggestions = plan.tasks.filter((task) => task.type === "tutor_lesson");
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].minutes, 45);
    assert.equal(suggestions[0].status, "suggested");
    assert.equal(suggestions[0].tutorWindow, "weekday_evening");
    assert.ok(suggestions[0].date, "a tutor suggestion should be assigned to an available weekday");
    const selectedWeekday = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" })
      .format(new Date(`${suggestions[0].date}T12:00:00.000Z`))
      .toLowerCase();
    assert.ok(["monday", "tuesday", "wednesday", "thursday", "friday"].includes(selectedWeekday));
    assert.equal(plan.learningBudgetMinutes, 95);

    t.diagnostic(`suggestions=${suggestions.length}; length=${suggestions[0].minutes} min; window=${suggestions[0].tutorWindow}; scheduled=${suggestions[0].date} (${selectedWeekday}); learning budget=${plan.learningBudgetMinutes} min`);
  });

  it("e) rolls a missed task once, drops it after the next missed day, and restores its available time", (t) => {
    const task: PlannedTask = {
      id: "missed-listening",
      date: "2026-10-05",
      type: "listening_exercise",
      skill: "listening",
      minutes: 15,
      topic: "work",
      reason: "weekly_practice",
      reasonSkill: null,
      status: "planned",
      rolloverCount: 0,
      optional: false,
    };
    const availableDates = ["2026-10-05", "2026-10-06", "2026-10-07"];
    const capacity = { "2026-10-05": 20, "2026-10-06": 20, "2026-10-07": 20 };
    const firstMiss = reconcileMissedTasks([task], "2026-10-05", availableDates, capacity);

    assert.deepEqual(firstMiss.rolledTaskIds, [task.id]);
    assert.deepEqual(firstMiss.droppedTaskIds, []);
    assert.deepEqual(
      { date: firstMiss.tasks[0].date, status: firstMiss.tasks[0].status, rolloverCount: firstMiss.tasks[0].rolloverCount },
      { date: "2026-10-06", status: "rolled", rolloverCount: 1 },
    );
    assert.equal(firstMiss.dailyMinutes["2026-10-06"], 15);
    assert.equal(firstMiss.dailyLimits["2026-10-06"] - firstMiss.dailyMinutes["2026-10-06"], 9);

    const secondMiss = reconcileMissedTasks(firstMiss.tasks, "2026-10-06", availableDates, capacity);
    assert.deepEqual(secondMiss.droppedTaskIds, [task.id]);
    assert.deepEqual(secondMiss.rolledTaskIds, []);
    assert.deepEqual(
      { date: secondMiss.tasks[0].date, status: secondMiss.tasks[0].status, rolloverCount: secondMiss.tasks[0].rolloverCount },
      { date: "2026-10-06", status: "dropped", rolloverCount: 1 },
    );
    assert.equal(secondMiss.dailyMinutes["2026-10-06"], 0);
    assert.equal(secondMiss.dailyLimits["2026-10-06"] - secondMiss.dailyMinutes["2026-10-06"], 24);
    for (const [date, minutes] of Object.entries(secondMiss.dailyMinutes)) {
      assert.ok(minutes <= secondMiss.dailyLimits[date], `${date} exceeds its 120% limit`);
    }

    t.diagnostic(`first miss: rolled once to 2026-10-06; second miss: dropped; Tuesday usage=0/24 min ceiling, restoring all 24 min of capacity`);
  });

  it("keeps at least a 10% share for every weighted skill and normalizes the allocation", () => {
    const allocation = calculateAllocationShares({
      track: "immigration",
      current: { listening: 4.75, reading: 4.75, writing: 0, speaking: 4.75 },
      targets: { listening: 5, reading: 5, writing: 5, speaking: 5 },
      premiumFeaturesEnabled: false,
    });

    assertClose(sum(allocation.shares), 1);
    for (const skill of ["listening", "reading", "writing", "speaking"] as const) {
      assert.ok(allocation.shares[skill] >= 0.1, `${skill} fell below its 10% floor`);
    }
  });

  it("allocates by weight times the skill gap when neither skill reaches the 10% floor", () => {
    const allocation = calculateAllocationShares({
      track: "immigration",
      current: { listening: 2, reading: 0, writing: 0, speaking: 2.5 },
      targets: { listening: 3, reading: null, writing: null, speaking: 3 },
      premiumFeaturesEnabled: false,
    });

    assertClose(allocation.shares.listening, 2 / 3);
    assertClose(allocation.shares.speaking, 1 / 3);
    assertClose(sum(allocation.shares), 1);
  });

  it("keeps the 10-point weakness boost disabled by default and gates it behind Premium", () => {
    const input = {
      track: "general" as const,
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 4, reading: 4, writing: 4, speaking: 4 },
      weaknessSkill: "speaking" as const,
    };
    const free = calculateAllocationShares({ ...input, premiumFeaturesEnabled: false });
    const defaulted = calculateAllocationShares(input);
    const premium = calculateAllocationShares({ ...input, premiumFeaturesEnabled: true });

    assert.deepEqual(defaulted.shares, free.shares);
    assertClose(free.shares.speaking, 0.35);
    assertClose(premium.shares.speaking - free.shares.speaking, 0.1);
    assertClose(sum(premium.shares), 1);
  });
  it("gives a tutor's struggling skill more of the week, at most 10 % in all, for every learner (Plan 7A)", () => {
    const input = {
      track: "general" as const,
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      premiumFeaturesEnabled: false,
    };
    const plain = calculateAllocationShares(input);
    const focused = calculateAllocationShares({ ...input, tutorFocusSkills: ["writing"] });
    assert.ok(focused.shares.writing > plain.shares.writing);
    assert.ok(focused.shares.writing - plain.shares.writing <= 0.1 + 1e-9);
    assertClose(sum(focused.shares), 1);
    assert.deepEqual(calculateAllocationShares({ ...input, tutorFocusSkills: [] }).shares, plain.shares);
  });

  it("maps CEFR and NCLC targets onto the planning scale", () => {
    assert.equal(cefrToScore("A0"), 0);
    assert.equal(cefrToScore("Below A1"), 0);
    assert.equal(nclcToScore(7), 3.5);
    assert.equal(parseTargetScore("NCLC 8"), 4);
    assert.equal(normalizeLevelScore(2.38), 2.5);
  });

  it("does not invent practice assignments when no skill targets are active", () => {
    const current = { listening: 1, reading: 1, writing: 1, speaking: 1 };
    const targets = { listening: null, reading: null, writing: null, speaking: null };
    const allocation = calculateAllocationShares({ track: "general", current, targets });
    const plan = buildWeeklyPlan({
      track: "general",
      current,
      targets,
      availability: everyDay(20),
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: false,
    });

    assert.equal(sum(allocation.shares), 0);
    assert.equal(allocation.biggestGapSkill, null);
    assert.equal(plan.tasks.filter((task) => task.skill !== null).length, 0);
  });

  it("keeps daily plans within their ceiling, skill cap, and unique task types", () => {
    const plan = buildWeeklyPlan({
      track: "general",
      current: { listening: 1, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      availability: everyDay(35),
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: true,
    });
    const dates = [...new Set(plan.tasks.map((task) => task.date).filter((date): date is string => Boolean(date)))];

    for (const date of dates) {
      const dayTasks = plan.tasks.filter((task) => task.date === date && !task.optional);
      assert.ok(plan.dailyMinutes[date] <= plan.dailyLimits[date], `${date} exceeds its 120% limit`);
      assert.equal(new Set(dayTasks.map((task) => task.type)).size, dayTasks.length, `${date} repeats a task type`);
      assert.ok(new Set(dayTasks.map((task) => task.skill).filter(Boolean)).size <= 3, `${date} has more than three skills`);
    }
  });

  const scheduleFillCases = [
    {
      name: "5 × 20 minute weekdays",
      availability: { monday: 20, tuesday: 20, wednesday: 20, thursday: 20, friday: 20, saturday: 0, sunday: 0 },
      days: 5,
    },
    { name: "7 × 30 minute days", availability: everyDay(30), days: 7 },
    {
      name: "3 × 45 minute days",
      availability: { monday: 45, tuesday: 0, wednesday: 45, thursday: 0, friday: 45, saturday: 0, sunday: 0 },
      days: 3,
    },
    { name: "7 × 60 minute days", availability: everyDay(60), days: 7 },
  ];

  for (const scheduleCase of scheduleFillCases) {
    it(`fills every available day for ${scheduleCase.name} within approved task ranges`, () => {
      const plan = buildWeeklyPlan({
        track: "general",
        current: { listening: 1, reading: 1, writing: 1, speaking: 1 },
        targets: { listening: 4, reading: 4, writing: 4, speaking: 4 },
        availability: scheduleCase.availability,
        tutorBudget: "none",
        tutorWindows: [],
        targetDate: null,
        today: "2026-10-05",
        weekNumber: 1,
        speakingAssessed: false,
      });
      assert.equal(plan.scheduleDates.length, scheduleCase.days);

      const allowedRanges: Record<string, [number, number]> = {
        vocabulary_drill: [10, 10],
        listening_exercise: [10, 15],
        speaking_practice: [10, 15],
        ai_lesson: [15, 20],
        writing: [15, 20],
        speaking_check: [10, 10],
        weekly_checkin: [10, 10],
        tutor_lesson: [30, 60],
      };
      for (const date of plan.scheduleDates) {
        const dayTasks = plan.tasks.filter((task) => task.date === date);
        const total = dayTasks.reduce((minutes, task) => minutes + task.minutes, 0);
        const available = scheduleCase.availability[weekdays[(new Date(`${date}T12:00:00.000Z`).getUTCDay() + 6) % 7]];
        assert.equal(plan.dailyMinutes[date], total, `${date} summary should match its saved task lengths`);
        assert.ok(total >= (available ?? 0) * 0.8, `${date} is under 80%: ${total}/${available}`);
        assert.ok(total <= (available ?? 0) * 1.2, `${date} is over 120%: ${total}/${available}`);
        assert.ok(total <= plan.dailyLimits[date], `${date} exceeded the planner ceiling`);
        assert.equal(new Set(dayTasks.map((task) => task.type)).size, dayTasks.length, `${date} repeats a task type`);
        assert.ok(new Set(dayTasks.map((task) => task.skill).filter(Boolean)).size <= 3, `${date} has more than three skills`);
        for (const task of dayTasks) {
          const [minimum, maximum] = allowedRanges[task.type];
          assert.ok(task.minutes >= minimum && task.minutes <= maximum, `${task.type} uses ${task.minutes} minutes`);
        }
      }
    });
  }

  it("maps exactly three objective answers into the approved comparison bands", () => {
    assert.equal(comparisonFromThreeItemScore(0), "below");
    assert.equal(comparisonFromThreeItemScore(1), "below");
    assert.equal(comparisonFromThreeItemScore(2), "at");
    assert.equal(comparisonFromThreeItemScore(3), "above");
    assert.throws(() => comparisonFromThreeItemScore(4), RangeError);
    assert.throws(() => comparisonFromThreeItemScore(1.5), RangeError);
  });

  it("keeps grammar as sub-area evidence for citizenship and never moves reading or speaking estimates", () => {
    const result = applyCheckInEvidence({
      track: "citizenship",
      current: { listening: 1.5, reading: 2, writing: 2.5, speaking: 1 },
      targets: { listening: 3, reading: null, writing: null, speaking: 3 },
      listeningCorrectCount: 1,
      grammarCorrectCount: 3,
      speakingSelfRating: "above",
    });

    assert.deepEqual(result.values, { listening: 1.25, reading: 2, writing: 2.5, speaking: 1 });
    assert.deepEqual(result.deltas, { listening: -0.25, reading: 0, writing: 0, speaking: 0 });
    assert.equal(result.grammarComparison, "above");
    assert.equal(result.comparisons.listening, "below");
    assert.equal(result.comparisons.reading, undefined);
    assert.equal(result.comparisons.speaking, undefined);
    assert.equal(result.speakingSelfRating, "above");
  });

  it("uses reading evidence only when reading is weighted", () => {
    const result = applyCheckInEvidence({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      readingCorrectCount: 0,
      grammarCorrectCount: 3,
    });

    assert.equal(result.values.reading, 1.75);
    assert.equal(result.deltas.reading, -0.25);
    assert.equal(result.grammarComparison, null);
  });

  it("compares the writing scorer level and handles scorer failure as a no-op at the adapter boundary", () => {
    assert.equal(scoredWritingLevelToScore("A1"), 1);
    assert.equal(scoredWritingLevelToScore("B2"), 4);
    assert.equal(scoredWritingLevelToScore("C1"), null);
    assert.equal(scoredWritingLevelToScore({ level: "B1" }), null);
    assert.equal(compareWritingLevel(2, 3), "above");
    assert.equal(compareWritingLevel(2, 2), "at");
    assert.equal(compareWritingLevel(2, 1), "below");
    assert.equal(compareWritingLevel(2, null), null);

    const failed = applyCheckInEvidence({
      track: "immigration",
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      writingScoredLevel: null,
    });
    assert.equal(failed.values.writing, 2);
    assert.equal(failed.deltas.writing, 0);
    assert.equal(failed.writingScored, false);
  });

  it("caps every check-in movement at 0.25 and never uses speaking self-ratings as evidence", () => {
    const result = applyCheckInEvidence({
      track: "general",
      current: { listening: 4.875, reading: 2, writing: 4.875, speaking: 0.125 },
      targets: { listening: 5, reading: 3, writing: 5, speaking: 3 },
      listeningCorrectCount: 3,
      readingCorrectCount: 0,
      writingScoredLevel: 1,
      speakingSelfRating: "below",
    });

    assert.deepEqual(result.values, { listening: 5, reading: 1.75, writing: 4.75, speaking: 0.25 });
    for (const delta of Object.values(result.deltas)) assert.ok(Math.abs(delta) <= 0.25);
    assert.equal(result.deltas.speaking, 0);
    assert.equal(result.speakingSelfRating, "below");
  });

  it("builds What changed only from estimates that numerically moved", () => {
    assert.deepEqual(buildCheckInChangeNote({ listening: 0, reading: -0.25, writing: 0, speaking: 0 }), { kind: "changed", skills: ["reading"] });
    assert.deepEqual(buildCheckInChangeNote({ listening: 0, reading: 0, writing: 0, speaking: 0 }), { kind: "steady", skills: [] });
    assert.deepEqual(buildCheckInChangeNote({}), { kind: "steady", skills: [] });
  });

  it("caps per-skill progress at 0–100% and calculates track-weighted readiness", () => {
    assert.equal(calculateSkillProgressPercentage(3.5, 1, 3), 100);
    assert.equal(calculateSkillProgressPercentage(0.5, 1, 3), 0);
    assert.equal(calculateSkillProgressPercentage(2, 1, 3), 50);
    assert.equal(calculateSkillProgressPercentage(2, 2, 2), 100);

    const readiness = calculateOverallReadiness({
      track: "general",
      current: { listening: 2, reading: 1, writing: 3, speaking: 2 },
      starts: { listening: 1, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
    });
    assert.equal(readiness, 48);
    assert.equal(calculateOverallReadiness({
      track: "citizenship",
      current: { listening: 2, reading: 3, writing: 4, speaking: 1.5 },
      starts: { listening: 1, reading: 1, writing: 1, speaking: 1 },
      targets: { listening: 3, reading: null, writing: null, speaking: 3 },
    }), 38);
  });

  it("counts completed study minutes by local week and computes consecutive-day streaks", () => {
    assert.deepEqual(aggregateCompletedMinutesByWeek([
      { dateLocal: "2026-10-05", minutes: 20, status: "done" },
      { dateLocal: "2026-10-06", minutes: 15, status: "planned" },
      { dateLocal: "2026-10-11", minutes: 10, status: "done" },
      { dateLocal: "2026-10-12", minutes: 30, status: "done" },
      { dateLocal: "not-a-date", minutes: 45, status: "done" },
    ]), { "2026-10-05": 30, "2026-10-12": 30 });
    assert.equal(calculateStudyStreak(["2026-10-08", "2026-10-09", "2026-10-10"], "2026-10-10"), 3);
    assert.equal(calculateStudyStreak(["2026-10-08", "2026-10-09"], "2026-10-10"), 2);
    assert.equal(calculateStudyStreak(["2026-10-08"], "2026-10-10"), 0);
  });

  it("grades saved practice answers by option ID, not their displayed position", () => {
    const options = [
      { id: "term-bleu", text: "blue" },
      { id: "term-rouge", text: "red" },
      { id: "term-vert", text: "green" },
    ];
    assert.equal(validatePracticeAnswerKey(options, "term-rouge"), true);
    assert.deepEqual(gradePracticeAnswer(options, "term-rouge", "term-rouge"), {
      correct: true,
      selectedOptionId: "term-rouge",
      correctOptionId: "term-rouge",
    });
    assert.deepEqual(gradePracticeAnswer(options, "term-rouge", "term-bleu"), {
      correct: false,
      selectedOptionId: "term-bleu",
      correctOptionId: "term-rouge",
    });
    assert.equal(gradePracticeAnswer([...options].reverse(), "term-rouge", "term-rouge")?.correct, true);
    assert.equal(gradePracticeAnswer(options, "term-rouge", "A"), null);
    assert.equal(validatePracticeAnswerKey(options, "missing-id"), false);
    assert.equal(validatePracticeAnswerKey([{ id: "same" }, { id: "same" }], "same"), false);
  });

  it("derives completed minutes and one streak day per completed local date", () => {
    const progress = calculateCompletedStudyProgress([
      { dateLocal: "2026-10-05", minutes: 20, status: "done" },
      { dateLocal: "2026-10-06", minutes: 15, status: "done" },
      { dateLocal: "2026-10-06", minutes: 10, status: "done" },
      { dateLocal: "2026-10-07", minutes: 30, status: "skipped" },
      { dateLocal: "2026-10-04", minutes: 45, status: "dropped" },
      { dateLocal: "2026-10-07", minutes: 12, status: "planned" },
      { dateLocal: "not-a-date", minutes: 60, status: "done" },
    ], "2026-10-07");
    assert.deepEqual(progress.completedMinutesByWeek, { "2026-10-05": 45 });
    assert.equal(progress.streak, 2, "two completed dates count, even with multiple tasks on one date");
  });

  it("allows only idempotent done or skip transitions from active task states", () => {
    assert.equal(transitionLearnerTaskStatus("planned", "done", "ai_lesson"), "done");
    assert.equal(transitionLearnerTaskStatus("suggested", "done", "tutor_lesson"), "done");
    assert.equal(transitionLearnerTaskStatus("rolled", "skipped", "listening_exercise"), "skipped");
    assert.equal(transitionLearnerTaskStatus("done", "done", "ai_lesson"), "done");
    assert.equal(transitionLearnerTaskStatus("skipped", "skipped", "weekly_checkin"), "skipped");
    assert.equal(transitionLearnerTaskStatus("planned", "done", "weekly_checkin"), null, "a check-in can be completed only by submission");
    assert.equal(transitionLearnerTaskStatus("done", "skipped", "writing"), null);
    assert.equal(transitionLearnerTaskStatus("skipped", "done", "writing"), null);
    assert.equal(transitionLearnerTaskStatus("dropped", "done", "writing"), null);
  });

  it("uses saved weak mastery and repeated mistake topics for focus without changing schedule allocation", () => {
    const base = {
      track: "immigration" as const,
      current: { listening: 1.5, reading: 1.5, writing: 1.5, speaking: 1.5 },
      targets: { listening: 3, reading: 3, writing: 3, speaking: 3 },
      availability: { monday: 30, tuesday: 30, wednesday: 30, thursday: 30, friday: 30 },
      tutorBudget: "none",
      tutorWindows: [],
      targetDate: null,
      today: "2026-10-05",
      speakingAssessed: true,
      weekNumber: 2,
    };
    const ordinary = buildWeeklyPlan(base);
    const focused = buildWeeklyPlan({
      ...base,
      topicMastery: [
        { topic: "appointments", rollingScore: 40 },
        { topic: "housing", rollingScore: 55 },
        { topic: "work", rollingScore: 92 },
      ],
      mistakeTopics: ["services", "services", "work"],
    });

    assert.deepEqual(
      focused.tasks.map(({ topic: _topic, ...task }) => task),
      ordinary.tasks.map(({ topic: _topic, ...task }) => task),
      "topic evidence changes the practice focus only, not the saved schedule",
    );
    assert.equal(focused.tasks.find((task) => task.skill)?.topic, "appointments");
    assert.ok(focused.tasks.some((task) => task.topic === "housing"));
    assert.ok(focused.tasks.some((task) => task.topic === "services"));
  });

  it("keeps the 10-point weakness boost disabled unless the Premium flag is enabled", () => {
    const input = {
      track: "general" as const,
      current: { listening: 2, reading: 2, writing: 2, speaking: 2 },
      targets: { listening: 4, reading: 4, writing: 4, speaking: 4 },
      weaknessSkill: "speaking" as const,
    };
    const free = calculateAllocationShares({ ...input, premiumFeaturesEnabled: false });
    const defaulted = calculateAllocationShares(input);
    const premium = calculateAllocationShares({ ...input, premiumFeaturesEnabled: true });

    assert.deepEqual(defaulted.shares, free.shares);
    assertClose(free.shares.speaking, 0.35);
    assertClose(premium.shares.speaking - free.shares.speaking, 0.1);
    assertClose(sum(premium.shares), 1);
  });

  it("does not create a Premium practice task for a Free learner", () => {
    const result = planPremiumLanguagePointPractice(premiumLanguagePointInput({ premiumEligible: false }));
    assert.deepEqual(result, { task: null });
  });

  it("does not create a Premium practice task while the saved trigger flag is off", () => {
    const result = planPremiumLanguagePointPractice(premiumLanguagePointInput({ triggerEnabled: false }));
    assert.deepEqual(result, { task: null });
  });

  it("adds one targeted ten-minute task on the earliest day that stays within the saved daily cap", () => {
    const result = planPremiumLanguagePointPractice(premiumLanguagePointInput());
    assert.ok(result.task);
    assert.equal(result.task.type, "ai_lesson");
    assert.equal(result.task.skill, "writing");
    assert.equal(result.task.topic, "passé composé with être");
    assert.equal(result.task.reason, "weekly_practice");
    assert.equal(result.task.minutes, 10);
    assert.equal(result.task.date, "2026-10-12");
    assert.equal(result.task.id, "premium-point-practice-2026-10-12-passe-compose-with-etre");
    assert.equal(result.dailyMinutes[result.task.date], 36);
    assert.equal(result.dailyMinutes[result.task.date], (premiumLanguagePointInput().dailyLimits as Record<string, number>)[result.task.date]);
    assert.equal(result.scheduledTaskMinutes, 216);
    assert.equal(result.plannedLearningMinutes, 190);
    assert.ok(result.whatChangedNote.startsWith("A plan built around this week's available study time."));
    assert.match(result.whatChangedNote, /learner\.today\.change\.extraPractice:/);
  });

  it("returns no task when every remaining learner-local day has no room under its cap", () => {
    const fullDays = Object.fromEntries(premiumTriggerDates.map((date) => [date, 36]));
    const result = planPremiumLanguagePointPractice(premiumLanguagePointInput({ dailyMinutes: fullDays }));
    assert.deepEqual(result, { task: null });
  });

  it("does not schedule a second practice task for the same point in the same week", () => {
    const first = planPremiumLanguagePointPractice(premiumLanguagePointInput());
    assert.ok(first.task);
    const second = planPremiumLanguagePointPractice(premiumLanguagePointInput({
      priorScore: 60,
      nextScore: 50,
      existingTasks: [first.task],
      existingWhatChangedNote: first.whatChangedNote,
    }));
    assert.deepEqual(second, { task: null });
  });

  it("allows the same point to trigger again in a later local week", () => {
    const first = planPremiumLanguagePointPractice(premiumLanguagePointInput());
    assert.ok(first.task);
    const nextWeekDates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
    const nextWeek = planPremiumLanguagePointPractice(premiumLanguagePointInput({
      todayLocal: "2026-10-19",
      weekStartLocal: "2026-10-19",
      weekEndLocal: "2026-10-25",
      weekPlanId: "week-plan-next",
      dailyLimits: Object.fromEntries(nextWeekDates.map((date) => [date, 36])),
      dailyMinutes: Object.fromEntries(nextWeekDates.map((date, index) => [date, index === 0 ? 20 : 30])),
      existingTasks: [first.task],
      existingWhatChangedNote: "",
    }));
    assert.ok(nextWeek.task);
    assert.equal(nextWeek.task.topic, first.task.topic);
    assert.notEqual(nextWeek.task.id, first.task.id);
    assert.equal(nextWeek.task.date, "2026-10-19");
  });

  it("requires an actual downward crossing from 60 percent or higher to below 60", () => {
    const crossing = planPremiumLanguagePointPractice(premiumLanguagePointInput({ priorScore: 60, nextScore: 59 }));
    const continuedWeakness = planPremiumLanguagePointPractice(premiumLanguagePointInput({ priorScore: 59, nextScore: 49 }));
    const unchanged = planPremiumLanguagePointPractice(premiumLanguagePointInput({ priorScore: 60, nextScore: 60 }));
    assert.ok(crossing.task);
    assert.deepEqual(continuedWeakness, { task: null });
    assert.deepEqual(unchanged, { task: null });
  });
});
