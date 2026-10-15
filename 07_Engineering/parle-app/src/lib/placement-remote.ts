import { parlePlanService } from "@/functions";
import type {
  AdaptiveRun,
  AdaptiveUpdate,
  AutoSectionKey,
  PlacementResultRecord,
  PlacementResultSnapshot,
  PromptItem,
  QuestionItem,
  RetakeGate,
  WritingAssessment,
} from "./placement-test";

/** The placement test is scored on the server (backend Plan 3); answer keys reach the page only after answering. */
async function run<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = (await parlePlanService({ action, ...payload })) as { result: T };
  return response.result;
}

export type PlacementProfile = { id: string; track: string; self_assessed_level: string; target_per_skill: unknown };
export type PlacementOpen =
  | { screen: "access" }
  | { screen: "result"; record: PlacementResultRecord; gate: RetakeGate }
  | { screen: "ready"; runId: string; gate: RetakeGate; profile: PlacementProfile; prompts: PromptItem[] };
export type ServedQuestion = { done: true } | { done?: false; question: QuestionItem; run: AdaptiveRun };

export const openPlacement = () => run<PlacementOpen>("placement_open");
export const nextQuestion = (runId: string, section: AutoSectionKey) => run<ServedQuestion>("placement_question", { runId, section });
export const answerQuestion = (runId: string, optionId: string) => run<{ update: AdaptiveUpdate; item: QuestionItem }>("placement_answer", { runId, optionId });
export const skipSection = (runId: string, section: string) => run<{ ok: true }>("placement_skip", { runId, section });
export const scoreWriting = (runId: string, promptId: string, text: string) => run<{ assessment: WritingAssessment }>("placement_score_writing", { runId, promptId, text });
export const finishPlacement = (runId: string) => run<{ record: PlacementResultRecord; snapshot: PlacementResultSnapshot }>("placement_finish", { runId });
