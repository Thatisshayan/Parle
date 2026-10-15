import { parlePlanService } from "@/functions";
import type {
  LearnerCheckInResult,
  LearnerCheckInSession,
  LearnerPlanView,
  LearnerProgressData,
  LearnerRoadmapData,
  PracticeReportCategory,
  SubmitMyWeeklyCheckInInput,
} from "./learner-plan";

export {
  earliestOwnedPlacementDate,
  filterLearnerRowsByOwner,
  hasScoredLearnerAssessment,
  latestSavedSkillEstimateValues,
  latestScoredLearnerCheckIn,
  selectApprovedCheckInQuestionItems,
  selectTodayWhatChangedNote,
  todayLevelHeadingKey,
} from "./learner-plan";
export type * from "./learner-plan";

/** The plan engine runs on the server (decision #48); these keep the names and shapes the pages already use. */
async function run<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = (await parlePlanService({ action, ...payload })) as { result: T };
  return response.result;
}

export const getOrCreateMyLearnerPlan = (options: { planningDate?: string; weekNumber?: number; whatChangedNote?: string; includeTaskHistory?: boolean } = {}) =>
  run<LearnerPlanView>("get_or_create_plan", { options });
export const markMyLearnerTaskDone = (taskId: string) => run<string | null>("mark_task_done", { task_id: taskId });
export const skipMyLearnerTask = (taskId: string) => run<void>("skip_task", { task_id: taskId });
export const prepareMyWeeklyCheckIn = () => run<LearnerCheckInSession>("prepare_checkin");
export const submitMyWeeklyCheckIn = (input: SubmitMyWeeklyCheckInInput) => run<LearnerCheckInResult>("submit_checkin", { input });
export const loadMyLearnerRoadmap = () => run<LearnerRoadmapData>("load_roadmap");
export const loadMyLearnerProgress = () => run<LearnerProgressData>("load_progress");
export const submitMyTaskPracticeReport = (input: { taskId: string; category: PracticeReportCategory; note?: string }) =>
  run<void>("submit_practice_report", { input });
