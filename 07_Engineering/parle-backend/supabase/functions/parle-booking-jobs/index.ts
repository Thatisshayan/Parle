import { serviceClient } from "../_shared/db.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";
import { lessonPayments } from "../_shared/lessons/payments.ts";
import { lessonSettings } from "../_shared/lessons/settings.ts";
import { runBookingJobs } from "../_shared/lessons/jobs.ts";

/** Lesson jobs every 10 minutes (pg_cron, spec section 8), in small batches far inside the function time limit. */
serveWith(async () => {
  const db = serviceClient();
  const report = await runBookingJobs(db, lessonPayments(db), await lessonSettings(db), new Date());
  console.info("Parle booking jobs", report);
  return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
}, cronOnly);
