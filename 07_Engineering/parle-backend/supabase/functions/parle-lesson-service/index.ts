import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/caller.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { serveWith } from "../_shared/serve.ts";
import { lessonPayments } from "../_shared/lessons/payments.ts";
import { LessonError } from "../_shared/lessons/errors.ts";
import { runLessonAction } from "../_shared/lessons/actions.ts";

/** Lesson booking for learners, tutors and administrators (Plan 7A). Money always comes from the stored booking. */
serveWith(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const caller = await getCaller(req, db);
  if (!caller) return fail("AUTH_REQUIRED", 401, "Authentication required");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  try {
    const result = await runLessonAction({ db, payments: lessonPayments(db), caller, body, origin: req.headers.get("Origin") ?? "", now: new Date() });
    return json({ status: "complete", ...result });
  } catch (e) {
    if (e instanceof LessonError) return fail(e.code, e.status, e.message);
    console.error("parle-lesson-service", body.action, (e as Error).message);
    return fail("REQUEST_FAILED", 500, "Something went wrong. Please try again.");
  }
});
