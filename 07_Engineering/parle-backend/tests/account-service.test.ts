import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const FN = `${LOCAL_URL}/functions/v1/parle-account-service`;
async function call(token: string | null, body: unknown) {
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: localKeys().anon, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("parle-account-service", () => {
  it("rejects calls without a valid token", async () => {
    expect((await call(null, { action: "save_profile" })).status).toBe(401);
    expect((await call("not-a-token", { action: "save_profile" })).status).toBe(401);
  });
  it("rejects unknown actions", async () => {
    const u = await makeUser("learner");
    expect((await call(await tokenOf(u), { action: "drop_tables" })).body.error_code).toBe("UNKNOWN_ACTION");
  });
  it("creates one identity and refuses a second role", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const first = await call(t, { action: "ensure_identity", role: "learner", age_confirmed: true });
    expect(first.body.identity.role).toBe("learner");
    expect((await call(t, { action: "ensure_identity", role: "learner", age_confirmed: true })).body.identity.id).toBe(first.body.identity.id);
    expect((await call(t, { action: "ensure_identity", role: "tutor", age_confirmed: true })).body.error_code).toBe("ROLE_EXISTS");
  });
  it("ignores owner fields in the payload (Review Focus 1)", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const bRow = (await call(await tokenOf(b), { action: "save_profile", time_zone: "UTC" })).body.profile;
    const res = await call(await tokenOf(a), { action: "save_profile", id: bRow.id, owner_id: b.id, created_by: b.email, time_zone: "Europe/Paris" });
    expect(res.body.profile.owner_id).toBe(a.id);
    const bNow = (await service().from("ParleProfile").select("time_zone").eq("id", bRow.id).single()).data!;
    expect(bNow.time_zone).toBe("UTC");
  });
  it("rejects an invalid time zone", async () => {
    const u = await makeUser("learner");
    expect((await call(await tokenOf(u), { action: "save_profile", time_zone: "Mars/Olympus" })).body.error_code).toBe("INVALID_INPUT");
  });
  it("saves the learner profile and the unverified placement with the caller's ids", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const lp = (await call(t, { action: "save_learner_profile", user_id: "someone-else", track: "immigration", goals: ["immigration"], main_goal: "immigration", time_zone: "America/Toronto" })).body.learner_profile;
    expect({ user: lp.user_id, owner: lp.owner_id, by: lp.created_by }).toEqual({ user: u.id, owner: u.id, by: u.email });
    const pr = (await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" })).body.placement_result;
    expect({ status: pr.status, source: pr.source, user: pr.user_id }).toEqual({ status: "unverified", source: "self_assessment", user: u.id });
    expect((await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" })).body.placement_result.id).toBe(pr.id);
  });
});
