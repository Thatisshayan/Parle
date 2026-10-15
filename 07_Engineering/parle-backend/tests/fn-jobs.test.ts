import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction, functionsEnv } from "./helpers/functions-env";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const db = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();

describe("scheduled jobs", () => {
  it("job functions refuse calls without the cron secret", async () => {
    for (const fn of ["parle-marketplace-refresh", "parle-billing-recheck"]) expect((await callFunction(fn, null, {})).status).toBe(401);
  });
  it("the marketplace refresh runs with the cron secret", async () => {
    const r = await callFunction("parle-marketplace-refresh", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("refreshed");
  }, 20000);
  it("the billing re-check reports when Stripe is not configured, or checks subscribers", async () => {
    const r = await callFunction("parle-billing-recheck", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
    expect(r.status).toBe(200);
    if (functionsEnv().STRIPE_SECRET_KEY) expect(typeof r.body.checked).toBe("number");
    else expect(r.body.status).toBe("not_configured");
  });
  it("the job settings are stored", async () => {
    const { data, error } = await service().rpc("job_config_names");
    expect(error).toBeNull();
    expect(data).toEqual(["cron_secret", "functions_url"]);
  });
  it("the three jobs are scheduled", () => {
    const names = db("select jobname from cron.job order by jobname").split("\n");
    expect(names).toEqual(expect.arrayContaining(["parle-billing-recheck", "parle-daily-cleanup", "parle-marketplace-refresh"]));
  });
  it("the database reaches the refresh function through pg_net", async () => {
    const id = db("select private.call_function('parle-marketplace-refresh')");
    expect(id).toMatch(/^\d+$/);
    let status = "";
    for (let i = 0; i < 30 && !status; i++) {
      await Bun.sleep(1000);
      status = db(`select status_code from net._http_response where id = ${id}`);
    }
    expect(status).toBe("200");
  });
});
