import * as engine from "../_app/src/lib/learner-plan.ts";
import { appContext } from "../_shared/app-shims/context.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { serviceClient } from "../_shared/db.ts";
import { tutorFocusSkills } from "../_shared/lessons/focus.ts";
import { aiActionLimit } from "../_shared/guards.ts";
import { json, fail, preflight } from "../_shared/http.ts";
import { checkInForBrowser } from "./checkin-view.ts";
import { safePreparedAudioUrls } from "../_shared/voice/listening.ts";
import { PlacementError, placementAnswer, placementFinish, placementOpen, placementQuestion, placementScoreSpeaking, placementScoreWriting, placementSkip, placementSkipQuestion } from "./placement.ts";
import { VoiceError } from "../_shared/voice/context.ts";

type Body = Record<string, any>;

/** The check-in is an assessment: its questions reach the browser without answers; scoring happens here on submit (S9, S12). */
/** Plan 13: the listening transcripts stay on the server; prepared audio is looked up by the items' own scripts. */
async function checkInAudio(ids: string[]): Promise<Map<string, string>> {
  const db = serviceClient();
  const { data, error } = await db.from("question_item").select("id, transcript").in("id", ids);
  if (error) throw new Error(error.message);
  return safePreparedAudioUrls(db, "question_item", (data ?? []).map((r: any) => ({ id: String(r.id), script: r.transcript })));
}
const ACTIONS: Record<string, (b: Body, userId: string) => Promise<unknown>> = {
  // The planning date, week number and "what changed" note are the engine's own decisions (R21); the browser may only
  // ask for the task history.
  get_or_create_plan: async (b, userId) => engine.getOrCreateMyLearnerPlan({
    includeTaskHistory: b.options?.includeTaskHistory === true,
    // "struggling" skills from recent lesson notes, read on the server: a focus, never an estimate (Plan 7A)
    tutorFocusSkills: await tutorFocusSkills(serviceClient(), userId).catch(() => []),
  }),
  mark_task_done: (b) => engine.markMyLearnerTaskDone(String(b.task_id ?? "")),
  skip_task: (b) => engine.skipMyLearnerTask(String(b.task_id ?? "")),
  prepare_checkin: async () => checkInForBrowser(await engine.prepareMyWeeklyCheckIn(), checkInAudio),
  submit_checkin: (b) => engine.submitMyWeeklyCheckIn(b.input),
  load_roadmap: () => engine.loadMyLearnerRoadmap(),
  load_progress: () => engine.loadMyLearnerProgress(),
  submit_practice_report: (b) => engine.submitMyTaskPracticeReport(b.input),
  // one task's practice content, written after Today has shown the plan (A28); the AI calls inside keep their limits
  prepare_task_content: (b) => engine.prepareMyTaskContent(String(b.task_id ?? "")),
  placement_open: () => placementOpen(),
  placement_question: (b) => placementQuestion(b),
  placement_skip_question: (b) => placementSkipQuestion(b),
  placement_answer: (b) => placementAnswer(b),
  placement_skip: (b) => placementSkip(b),
  placement_score_writing: (b) => placementScoreWriting(b),
  placement_score_speaking: (b) => placementScoreSpeaking(b),
  placement_finish: (b) => placementFinish(b),
};

/** The study-plan engine, run for the signed-in learner on the server (decision #48). */
serveWith(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const client = createSuperdevClient({});
  client.auth.setToken(token);
  let userId = "";
  try {
    userId = String(((await client.auth.me()) as { id?: unknown }).id ?? "");
  } catch {
    return fail("AUTH_REQUIRED", 401, "Authentication required");
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_INPUT", 400);
  }
  const run = ACTIONS[String(body.action)];
  if (!run) return fail("UNKNOWN_ACTION", 400);
  try {
    // Up to 90 s of background AI per request, well inside the function time limit (decision #49).
    const result = await appContext.run({ client, token, aiDeadline: Date.now() + 90_000 }, () => run(body, userId));
    return json({ status: "complete", result: result ?? null });
  } catch (e) {
    if (e instanceof PlacementError) return fail(e.message, 400);
    if (e instanceof VoiceError) return json({ error: e.code, error_code: e.code, message: e.message, ...e.extra }, e.status);
    // the plan engine's "no learner profile yet" refusal, by its code: the app sends the learner to onboarding (R34)
    if ((e as { code?: unknown })?.code === "ONBOARDING_REQUIRED") return fail("ONBOARDING_REQUIRED", 409, (e as Error).message);
    console.error("parle-plan-service", body.action, e instanceof Error ? e.name : "unknown");
    return fail("PLAN_ACTION_FAILED", 400, "The plan could not be updated. Please try again.");
  }
}, aiActionLimit);
