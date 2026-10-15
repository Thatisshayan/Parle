import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";
import { refreshPublishedListings } from "./parle-marketplace-refresh.logic.helper.ts";

async function runTrustedRefresh(source: "startup" | "hourly"): Promise<void> {
  const appId = Deno.env.get("SUPERDEV_APP_ID");
  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
  if (!appId || !serviceRoleKey) {
    console.error(`Parle marketplace ${source} refresh could not start because server configuration is missing.`);
    return;
  }
  try {
    const client = createSuperdevClient({ appId });
    client.auth.setToken(serviceRoleKey);
    const result = await refreshPublishedListings(client);
    console.info(`Parle marketplace ${source} listing refresh completed`, result);
  } catch {
    console.error(`Parle marketplace ${source} listing refresh failed.`);
  }
}

Deno.cron("parle-marketplace-availability-refresh", "0 * * * *", async () => {
  await runTrustedRefresh("hourly");
});

Deno.serve(() => new Response("Not found", { status: 404 }));

// Repair safe approved tutor snapshots as soon as this function starts, then keep the hourly refresh.
void runTrustedRefresh("startup");
