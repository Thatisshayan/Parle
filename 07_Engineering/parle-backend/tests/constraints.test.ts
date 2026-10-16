import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";

const db = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("unique rules", () => {
  it("allows one learner_profile per user_id", async () => {
    const u = crypto.randomUUID();
    expect((await db().from("learner_profile").insert({ user_id: u })).error).toBeNull();
    expect((await db().from("learner_profile").insert({ user_id: u })).error?.code).toBe("23505");
  });
  it("keeps app_setting keys unique", async () => {
    const k = "test_" + crypto.randomUUID();
    expect((await db().from("app_setting").insert({ key: k, value: "1" })).error).toBeNull();
    expect((await db().from("app_setting").insert({ key: k, value: "2" })).error?.code).toBe("23505");
  });
});

describe("increment_usage", () => {
  it("never lets 20 simultaneous requests exceed the limit", async () => {
    const u = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      db().rpc("increment_usage", { p_user_id: u, p_period: "day", p_period_key: "2026-10-14", p_owner: null, p_amount: 1, p_limit: 10 })));
    const ok = results.filter((r) => r.data?.ok).length;
    expect(ok).toBe(10);
    const { data } = await db().from("usage_counter").select("ai_messages").eq("user_id", u).single();
    expect(data!.ai_messages).toBe(10);
  });
});
