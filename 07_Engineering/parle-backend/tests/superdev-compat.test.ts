import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { functionsEnv } from "./helpers/functions-env";
import { createSuperdevClient, createSuperdevClientAs } from "../supabase/functions/_shared/superdev-compat";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const asUser = async (u: Awaited<ReturnType<typeof makeUser>>) => { const c = createSuperdevClient({ appId: "x" }); c.auth.setToken(await tokenOf(u)); return c; };

beforeAll(() => {
  process.env.SUPABASE_URL = LOCAL_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = localKeys().service;
  process.env.SUPERDEV_SERVICE_ROLE_KEY = functionsEnv().SUPERDEV_SERVICE_ROLE_KEY;
});

describe("server createSuperdevClient", () => {
  it("me() returns Buildy's user shape and refuses a bad token", async () => {
    const u = await makeUser("learner"), c = await asUser(u);
    expect(await c.auth.me()).toEqual({ id: u.id, email: u.email, full_name: null, role: "user" });
    const bad = createSuperdevClient({}); bad.auth.setToken("nope");
    await expect(bad.auth.me()).rejects.toMatchObject({ status: 401 });
  });
  it("caller reads only rows its Buildy rule allows", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    await service().from("learner_task").insert([
      { owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" },
      { owner_id: b.id, created_by: b.email, user_id: b.id, status: "planned" },
    ]);
    const rows = await (await asUser(a)).entities.learner_task.filter({});
    expect(rows.length).toBe(1);
    expect(rows[0].created_by).toBe(a.email);
  });
  it("create stamps the caller as owner and checks the create rule", async () => {
    const a = await makeUser("learner"), c = await asUser(a);
    const row = await c.entities.mistake_log.create({ created_by: "someone@else", owner_id: crypto.randomUUID(), skill: "writing" });
    expect({ by: row.created_by, owner: row.owner_id }).toEqual({ by: a.email, owner: a.id });
    await expect(c.entities.app_setting.create({ key: "x", value: "1" })).rejects.toMatchObject({ status: 403 });
    await expect(c.entities.ParleIdentity.create({ role: "learner", premium_comp_active: true })).rejects.toMatchObject({ status: 403 });
  });
  it("update cannot touch or move another user's row", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const { data: bRow } = await service().from("learner_task").insert({ owner_id: b.id, created_by: b.email, user_id: b.id, status: "planned" }).select("id").single();
    await expect((await asUser(a)).entities.learner_task.update(bRow!.id, { status: "done" })).rejects.toMatchObject({ status: 403 });
    const tutor = await makeUser("tutor");
    const { data: booking } = await service().from("booking").insert({ owner_id: a.id, created_by: a.email, learner_user_id: a.id, tutor_user_id: tutor.id, status: "requested" }).select("id").single();
    await expect((await asUser(tutor)).entities.booking.update(booking!.id, { tutor_user_id: b.id })).rejects.toMatchObject({ status: 403 });
    expect((await (await asUser(tutor)).entities.booking.update(booking!.id, { status: "confirmed" })).status).toBe("confirmed");
  });
  it("an administrator reads everything but writes only where the rule allows", async () => {
    const a = await makeUser("learner"), admin = await makeUser("admin");
    await service().from("learner_task").insert({ owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" });
    const ac = await asUser(admin);
    expect((await ac.entities.learner_task.filter({ user_id: a.id })).length).toBe(1);
    expect((await ac.auth.list()).some((x: any) => x.email === a.email)).toBe(true);
    await expect((await asUser(a)).auth.list()).rejects.toMatchObject({ status: 403 });
  });
  it("server jobs can act as a given user, with that user's rules and ownership", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    await service().from("learner_task").insert({ owner_id: b.id, created_by: b.email, user_id: b.id, status: "planned" });
    const c = createSuperdevClientAs({ id: a.id, email: a.email, full_name: null, role: "user" });
    expect(await c.entities.learner_task.filter({ user_id: b.id })).toEqual([]);
    const row = await c.entities.mistake_log.create({ skill: "writing" });
    expect({ by: row.created_by, owner: row.owner_id }).toEqual({ by: a.email, owner: a.id });
  });
  it("the service token reads without rules", async () => {
    const a = await makeUser("learner");
    await service().from("learner_task").insert({ owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" });
    const c = createSuperdevClient({}); c.auth.setToken(functionsEnv().SUPERDEV_SERVICE_ROLE_KEY);
    expect((await c.entities.learner_task.filter({ user_id: a.id })).length).toBe(1);
    await expect(c.auth.me()).rejects.toMatchObject({ status: 401 });
  });
});
