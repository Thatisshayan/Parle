import { serviceClient } from "../_shared/db.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";
import { runWaitlistJobs } from "../_shared/waitlist/send.ts";

/** Waitlist emails (spec 4.4): pg_cron calls this every minute while an email is queued. */
serveWith(async () => {
  const report = await runWaitlistJobs(serviceClient(), new Date());
  console.info("Parle waitlist jobs", report);
  return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
}, cronOnly);
