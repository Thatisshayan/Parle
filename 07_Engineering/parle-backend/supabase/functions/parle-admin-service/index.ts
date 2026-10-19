import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/caller.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { serveWithLimitedBody } from "../_shared/serve.ts";
import { lessonPayments } from "../_shared/lessons/payments.ts";
import { AdminError } from "../_shared/admin/context.ts";
import { runAdminAction } from "../_shared/admin/actions.ts";

/** Plan 8: accounts, administrators, user detail, metrics and the waitlist. Administrators only; owner checks inside. */
serveWithLimitedBody(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const caller = await getCaller(req, db);
  if (!caller) return fail("AUTH_REQUIRED", 401, "Authentication required");
  if (caller.role !== "admin") return fail("ADMIN_REQUIRED", 403, "Administrators only.");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  try {
    const result = await runAdminAction({ db, payments: lessonPayments(db), caller, body, now: new Date() });
    return json({ status: "complete", ...result });
  } catch (e) {
    if (e instanceof AdminError) return fail(e.code, e.status, e.message);
    console.error("parle-admin-service", body.action, e instanceof Error ? e.name : "unknown");
    return fail("REQUEST_FAILED", 500, "Something went wrong. Please try again.");
  }
}, 1024 * 1024);
