import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { onboardedLearner } from "./helpers/learners";
import { OWNER_EMAIL, setOwnerFlag } from "../scripts/prod/owner";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const appMeta = async (id: string) => (await service().auth.admin.getUserById(id)).data.user!.app_metadata as Record<string, unknown>;

describe("owner flag (spec 3.1) and paused people (spec 3.2)", () => {
  it("is set only on an administrator, once, and the role is kept", async () => {
    const admin = await makeUser("admin");
    const learner = await makeUser("learner");
    expect(await setOwnerFlag(service(), admin.email.toUpperCase())).toBe("set");
    expect(await setOwnerFlag(service(), admin.email)).toBe("already");
    expect(await appMeta(admin.id)).toMatchObject({ role: "admin", owner: true });
    expect(await setOwnerFlag(service(), learner.email)).toBe("not_admin");
    expect((await appMeta(learner.id)).owner).toBeUndefined();
    expect(await setOwnerFlag(service(), `nobody-${crypto.randomUUID()}@example.test`)).toBe("not_found");
    expect(OWNER_EMAIL).toBe("obsidianmedia.yt@gmail.com");
  });

  it("a paused person is refused by the backend functions and by the Buildy-era ones at once", async () => {
    const { u, t } = await onboardedLearner();
    expect((await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "UTC" })).status).toBe(200);
    const { error } = await service().auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    expect(error).toBeNull();
    expect((await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "UTC" })).status).toBe(401);
    expect((await callFunction("parle-lesson-service", t, { action: "learner_list_lessons" })).status).toBe(401);
    expect((await callFunction("parle-marketplace-service", t, { action: "learner_list_tutors" })).status).toBe(401);
    await service().auth.admin.updateUserById(u.id, { ban_duration: "none" });
  }, 30000);
});
