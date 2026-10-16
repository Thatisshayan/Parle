import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { functionsEnv } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("local setup", () => {
  it("seeds the demo bank and settings once (idempotent)", async () => {
    await seedLocalContent();
    const count = async (t: string) => (await service().from(t).select("id", { count: "exact", head: true })).count ?? 0;
    const before = { q: await count("question_item"), p: await count("prompt_item"), s: await count("app_setting") };
    expect(before.q).toBeGreaterThan(100);
    expect(before.p).toBeGreaterThan(5);
    expect(before.s).toBeGreaterThan(5);
    await seedLocalContent();
    expect({ q: await count("question_item"), p: await count("prompt_item"), s: await count("app_setting") }).toEqual(before);
  });
  it("writes the function settings file with every required name", () => {
    const env = functionsEnv();
    for (const k of ["SUPERDEV_APP_ID", "SUPERDEV_SERVICE_ROLE_KEY", "CRON_SECRET", "EMAIL_TRANSPORT", "MAILPIT_URL", "AI_PROVIDER", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "ADMIN_ALERT_EMAIL", "WAITLIST_UNSUBSCRIBE_SECRET", "WAITLIST_SITE_URL", "PUBLIC_SUPABASE_URL"]) {
      expect(env[k]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(env.SUPERDEV_SERVICE_ROLE_KEY.length).toBeGreaterThanOrEqual(48);
    expect(env.WAITLIST_UNSUBSCRIBE_SECRET.length).toBe(64);
    expect(env.AI_PROVIDER).toBe("fake");
    expect(env.STRIPE_PROVIDER).toBe("fake");
    expect(env.PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });
  it("stores the job settings where only the database owner can read them", async () => {
    const { data, error } = await service().rpc("job_config_names");
    expect(error).toBeNull();
    expect((data as string[]).sort()).toEqual(["cron_secret", "functions_url"]);
  });
});
