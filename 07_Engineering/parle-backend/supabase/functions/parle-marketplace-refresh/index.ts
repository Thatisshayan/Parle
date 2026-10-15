import { refreshPublishedListings } from "../_app/functions/parle-marketplace-refresh.logic.helper.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";

/** Hourly refresh of the published tutor listings (pg_cron; replaces Buildy's Deno.cron). */
serveWith(async () => {
  const client = createSuperdevClient({});
  client.auth.setToken(Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "");
  const result = await refreshPublishedListings(client);
  console.info("Parle marketplace hourly refresh", result);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
}, cronOnly);
