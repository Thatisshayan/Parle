import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";

const FN = "parle-marketplace-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const ADMIN_ACTIONS = [
  "admin_add_test_review", "admin_authorize", "admin_content_coverage", "admin_decide", "admin_get_content_item", "admin_get_demo_bank",
  "admin_get_settings", "admin_hide_test_review", "admin_initialize", "admin_list_applications", "admin_list_audit",
  "admin_list_reported_content", "admin_list_users", "admin_manage_reviews", "admin_open_application", "admin_refresh_public_profile",
  "admin_resolve_practice_report", "admin_retry_email", "admin_save_content_item", "admin_save_country", "admin_save_settings",
  "admin_set_premium_comp", "admin_update_demo_bank_content", "admin_verify_document",
];

describe("parle-marketplace-service", () => {
  it("rejects oversized JSON while streaming before caller authentication", async () => {
    const response = await fetch(`${LOCAL_URL}/functions/v1/${FN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"action":"learner_list_tutors","padding":"${"x".repeat(2 * 1024 * 1024)}"}`,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "REQUEST_TOO_LARGE" });
  }, 30000);

  it("refuses callers without a valid token", async () => {
    expect((await callFunction(FN, null, { action: "learner_list_tutors" })).status).toBe(401);
  });
  it("refuses every administrator action to learners and tutors", async () => {
    const learner = await makeUser("learner"), tutor = await makeUser("tutor");
    for (const t of [await tokenOf(learner), await tokenOf(tutor)]) {
      for (const action of ADMIN_ACTIONS) {
        const r = await callFunction(FN, t, { action });
        expect({ action, status: r.status }).toEqual({ action, status: 403 });
      }
    }
  });
  it("lists published tutors to a learner", async () => {
    const t = await tokenOf(await makeUser("learner"));
    await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
    await callFunction("parle-account-service", t, { action: "save_learner_profile", track: "general", goals: ["general"], main_goal: "general" });
    const r = await callFunction(FN, t, { action: "learner_list_tutors" });
    expect(r.status).toBe(200);
  });
  it("an administrator saves a setting and its audit row together", async () => {
    const admin = await makeUser("admin"), t = await tokenOf(admin);
    await callFunction(FN, t, { action: "admin_initialize" });
    const got = await callFunction(FN, t, { action: "admin_get_settings" });
    expect(got.status).toBe(200);
    const before = got.body.settings;
    const next = before.free_ai_messages_per_day === 10 ? 11 : 10;
    const r = await callFunction(FN, t, { action: "admin_save_settings", settings: { ...before, free_ai_messages_per_day: next } });
    expect(r.status).toBe(200);
    const { data: audit } = await service().from("admin_audit_log").select("action, target_id").eq("actor_user_id", admin.id).eq("target_id", "free_ai_messages_per_day");
    expect(audit!.length).toBeGreaterThan(0);
    await callFunction(FN, t, { action: "admin_save_settings", settings: { ...before } });
  });
  it("an administrator lists users (full-rights read)", async () => {
    const admin = await makeUser("admin");
    const r = await callFunction(FN, await tokenOf(admin), { action: "admin_list_users" });
    expect(r.status).toBe(200);
    // The list is capped and oldest first; seeing accounts other than the admin's own proves the full-rights read.
    const emails = (r.body.users as any[]).map((u) => u.email);
    expect(emails.length).toBeGreaterThan(1);
    expect(emails.some((e) => e !== admin.email)).toBe(true);
  });
});

describe("the Buildy-era metrics action is gone (Plan 11: A82, R90)", () => {
  it("answers as an unknown action", async () => {
    const admin = await makeUser("admin");
    const r = await callFunction(FN, await tokenOf(admin), { action: "admin_get_metrics" });
    expect([r.status, r.body.code]).toEqual([400, "ACTION_INVALID"]);
  }, 30000);
});
