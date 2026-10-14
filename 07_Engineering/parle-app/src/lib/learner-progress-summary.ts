import { t, type TranslationKey } from "@/lib/i18n";
import { formatLearnerLevel, learnerLocalDateFromUtcTimestamp } from "@/lib/learner-display";
import type { PracticeMinutesBySkill } from "@/lib/learner-analytics";
import type { LearnerProgressData } from "@/lib/learner-plan";
import { getTrackWeights, SKILL_KEYS, type PlannerTrack, type SkillKey } from "@/lib/roadmap-engine";

export type LearnerProgressSummaryAccess = "loading" | "free" | "premium" | "error";

export interface LearnerProgressSummarySkill {
  skill: SkillKey;
  label: string;
  startingEstimate: string;
  currentEstimate: string;
}

export interface LearnerProgressSummary {
  learnerName: string;
  goalLabel: string;
  track: PlannerTrack;
  trackLabel: string;
  placementDate: string | null;
  rangeEndDate: string | null;
  producedOn: string;
  totalMinutes: number;
  totalHours: number;
  skills: LearnerProgressSummarySkill[];
  checkInDates: Array<string | null>;
  practiceRecordDisclaimer: string;
  estimateDisclaimer: string;
  access: LearnerProgressSummaryAccess;
  minutesBySkill: PracticeMinutesBySkill | null;
  weeklyCheckInMinutes: number | null;
}

export interface LearnerProgressSummaryOptions {
  producedAt?: Date;
  access?: LearnerProgressSummaryAccess;
  minutesBySkill?: PracticeMinutesBySkill | null;
  weeklyCheckInMinutes?: number | null;
  viewerId?: string;
}

const skillLabelKeys: Record<SkillKey, TranslationKey> = {
  listening: "learner.skill.listening",
  reading: "learner.skill.reading",
  writing: "learner.skill.writing",
  speaking: "learner.skill.speaking",
};

const trackLabelKeys: Record<PlannerTrack, TranslationKey> = {
  immigration: "landing.trackOneTitle",
  citizenship: "landing.trackTwoTitle",
  general: "landing.trackThreeTitle",
};

const goalLabelKeys: Record<string, TranslationKey> = {
  immigration: "onboarding.goal.immigration",
  citizenship: "onboarding.goal.citizenship",
  general: "onboarding.goal.general",
  canada_immigration: "onboarding.goal.immigration",
  canadian_citizenship: "onboarding.goal.citizenship",
  conversation: "onboarding.goal.conversation",
  general_fluency: "onboarding.goal.general",
  general_conversation: "learner.topic.generalConversation",
  work: "onboarding.goal.work",
  work_goal: "onboarding.goal.work",
  job_interview: "onboarding.goal.interview",
  school: "onboarding.goal.school",
  travel: "onboarding.goal.travel",
  other: "onboarding.goal.other",
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function goalLabelFor(value: string): string {
  const label = value.trim();
  if (!label) return t("learner.progressSummary.goalUnavailable");
  const key = goalLabelKeys[label.toLocaleLowerCase()];
  return key ? t(key) : label;
}

function placementDateForRange(value: string | null): string | null {
  return isCalendarDate(value) ? value : null;
}

/** Builds a read-only presentation model from the same owner-scoped Progress result and calculations. */
export function buildLearnerProgressSummary(
  data: LearnerProgressData,
  options: LearnerProgressSummaryOptions = {},
): LearnerProgressSummary {
  if (options.viewerId !== undefined && options.viewerId !== data.plan.userId) {
    throw new Error("This progress summary does not belong to the signed-in learner.");
  }

  const producedAt = options.producedAt ?? new Date();
  if (!Number.isFinite(producedAt.getTime())) throw new Error("A valid summary date is required.");
  const producedOn = learnerLocalDateFromUtcTimestamp(producedAt.toISOString(), data.plan.timeZone);
  if (!producedOn) throw new Error("The summary date could not be formatted in the learner’s time zone.");

  const weights = getTrackWeights(data.plan.track, data.plan.targets);
  const skills = SKILL_KEYS.filter((skill) => weights[skill] > 0).map((skill) => {
    const notAssessed = skill === "speaking" && data.states.speaking === "not_assessed";
    const formatEstimate = (value: number) => notAssessed
      ? t("learner.progress.levelNotYetAssessed")
      : formatLearnerLevel(value, data.plan.track);
    return {
      skill,
      label: t(skillLabelKeys[skill]),
      startingEstimate: formatEstimate(data.starts[skill]),
      currentEstimate: formatEstimate(data.plan.current[skill]),
    };
  });

  const totalMinutes = Object.values(data.completedMinutesByWeek).reduce((total, minutes) => total + minutes, 0);
  const placementDate = placementDateForRange(data.earliestPlacementDate);
  const rangeEndDate = isCalendarDate(data.plan.today) ? data.plan.today : null;
  const hasValidReportRange = Boolean(placementDate && rangeEndDate && rangeEndDate >= placementDate);
  const checkInDates = data.history.map((record) =>
    isCalendarDate(record.date_local) ? record.date_local : null
  );
  const access = options.access ?? "loading";
  const minutesBySkill = access === "premium" && options.minutesBySkill
    ? Object.fromEntries(SKILL_KEYS.map((skill) => [skill, options.minutesBySkill![skill]])) as PracticeMinutesBySkill
    : null;
  const weeklyCheckInMinutes = access === "premium"
    && hasValidReportRange
    && typeof options.weeklyCheckInMinutes === "number"
    && Number.isFinite(options.weeklyCheckInMinutes)
    && options.weeklyCheckInMinutes >= 0
    ? options.weeklyCheckInMinutes
    : null;

  return {
    learnerName: data.learnerName?.trim() || t("learner.progressSummary.nameUnavailable"),
    goalLabel: goalLabelFor(data.plan.goalLabel),
    track: data.plan.track,
    trackLabel: t(trackLabelKeys[data.plan.track]),
    placementDate,
    rangeEndDate,
    producedOn,
    totalMinutes,
    totalHours: totalMinutes / 60,
    skills,
    checkInDates,
    practiceRecordDisclaimer: t("learner.progressSummary.practiceRecordDisclaimer"),
    estimateDisclaimer: t("learner.today.estimateCaveat"),
    access,
    minutesBySkill,
    weeklyCheckInMinutes,
  };
}
