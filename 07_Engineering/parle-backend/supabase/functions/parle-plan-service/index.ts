import * as engine from "../_app/src/lib/learner-plan.ts";
import { appContext } from "../_shared/app-shims/context.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";
import { json, fail, preflight } from "../_shared/http.ts";

type Body = Record<string, any>;
const ACTIONS: Record<string, (b: Body) => Promise<unknown>> = {
  get_or_create_plan: (b) => engine.getOrCreateMyLearnerPlan(typeof b.options === "object" && b.options ? b.options : {}),
  mark_task_done: (b) => engine.markMyLearnerTaskDone(String(b.task_id ?? "")),
  skip_task: (b) => engine.skipMyLearnerTask(String(b.task_id ?? "")),
  prepare_checkin: () => engine.prepareMyWeeklyCheckIn(),
  submit_checkin: (b) => engine.submitMyWeeklyCheckIn(b.input),
  load_roadmap: () => engine.loadMyLearnerRoadmap(),
  load_progress: () => engine.loadMyLearnerProgress(),
  submit_practice_report: (b) => engine.submitMyTaskPracticeReport(b.input),
};

/** The study-plan engine, run for the signed-in learner on the server (decision #48). */
serveWith(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const client = createSuperdevClient({});
  client.auth.setToken(token);
  try {
    await client.auth.me();
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
    const result = await appContext.run({ client, token }, () => run(body));
    return json({ status: "complete", result: result ?? null });
  } catch (e) {
    console.error("parle-plan-service", body.action, (e as Error).message);
    return fail("PLAN_ACTION_FAILED", 400, "The plan could not be updated. Please try again.");
  }
}, aiActionLimit);
