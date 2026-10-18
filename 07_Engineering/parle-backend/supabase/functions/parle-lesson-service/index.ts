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
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("parle-lesson-service", body.action, error instanceof Error ? error.name : "unknown");
    // CI-only opt-in lets the R59 integration test inspect the underlying failure without changing production errors.
    if (Deno.env.get("PARLE_TEST_DIAGNOSTICS") === "1" && req.headers.get("x-parle-test-diagnostic") === "ci-r59") {
      return json({ error: "REQUEST_FAILED", error_code: "REQUEST_FAILED", diagnostic: { name: error.name, message: error.message } }, 500);
    }
    return fail("REQUEST_FAILED", 500, "Something went wrong. Please try again.");
  }
});
