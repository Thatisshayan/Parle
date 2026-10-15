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
  it("repairs a missing app_metadata role on the next ensure_identity (final review Important 2)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    await call(t, { action: "ensure_identity", role: "tutor", age_confirmed: true });
    await service().auth.admin.updateUserById(u.id, { app_metadata: { role: null } });
    expect((await call(t, { action: "ensure_identity", role: "tutor", age_confirmed: true })).body.identity.role).toBe("tutor");
    expect((await service().auth.admin.getUserById(u.id)).data.user!.app_metadata.role).toBe("tutor");
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
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  async function upload(u: Awaited<ReturnType<typeof makeUser>>, bytes: Uint8Array) {
    const path = `${u.id}/${crypto.randomUUID()}.png`;
    const { error } = await u.client.storage.from("profile-photos").upload(path, new Blob([bytes], { type: "image/png" }));
    if (error) throw error;
    return { path, url: u.client.storage.from("profile-photos").getPublicUrl(path).data.publicUrl };
  }
  it("accepts a photo from the caller's own folder and refuses any other address (A1, R10)", async () => {
    const u = await makeUser("learner"), other = await makeUser("learner"), t = await tokenOf(u);
    const own = await upload(u, PNG);
    expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url: own.url })).status).toBe(200);
    const theirs = `${LOCAL_URL}/storage/v1/object/public/profile-photos/${other.id}/${crypto.randomUUID()}.png`;
    for (const photo_url of ["https://evil.example/x.png", theirs, "javascript:alert(1)", `${own.url}?x=1`]) {
      expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url })).body.error_code).toBe("PHOTO_INVALID");
    }
    expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url: "" })).status).toBe(200);
  });
  it("an unchanged saved photo address is accepted (Review Focus 1)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const saved = (await call(t, { action: "save_profile", time_zone: "UTC" })).body.profile;
    const old = "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/old/photo.png";
    await service().from("ParleProfile").update({ photo_url: old }).eq("id", saved.id);
    const r = await call(t, { action: "save_profile", time_zone: "Europe/Paris", photo_url: old, native_language: "Persian" });
    expect(r.status).toBe(200);
    expect(r.body.profile.time_zone).toBe("Europe/Paris");
  });
  it("refuses a language or track that is not on the lists (A1, R10)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    expect((await call(t, { action: "save_profile", time_zone: "UTC", native_language: "Klingon" })).body.error_code).toBe("INVALID_INPUT");
    expect((await call(t, { action: "save_learner_profile", track: "space" })).body.error_code).toBe("INVALID_INPUT");
    expect((await call(t, { action: "save_learner_profile", track: "general", native_language: "Klingon" })).body.error_code).toBe("INVALID_INPUT");
    expect((await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "space" })).body.error_code).toBe("INVALID_INPUT");
    expect((await call(t, { action: "save_learner_profile", track: "citizenship", native_language: "Arabic" })).status).toBe(200);
  });
  it("refuses learner actions to a tutor (A1, R10)", async () => {
    const tutor = await makeUser("tutor"), t = await tokenOf(tutor);
    expect((await call(t, { action: "save_learner_profile", track: "general" })).body.error_code).toBe("LEARNER_ONLY");
    expect((await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "general" })).body.error_code).toBe("LEARNER_ONLY");
    expect((await service().from("learner_profile").select("id").eq("owner_id", tutor.id)).data).toEqual([]);
  });
  it("the server's language list is the app's list", async () => {
    const { NATIVE_LANGUAGES } = await import("../supabase/functions/_shared/account-rules");
    const app = await Bun.file(`${import.meta.dir}/../../parle-app/src/lib/parle-profile.ts`).text();
    const block = /NATIVE_LANGUAGE_VALUES = \[([\s\S]*?)\] as const/.exec(app)![1];
    expect([...NATIVE_LANGUAGES]).toEqual([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  });
  it("saving a new photo removes the previous one and any upload that was never saved (A7, R13)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const left = async () => (await service().storage.from("profile-photos").list(u.id)).data!.map((f) => `${u.id}/${f.name}`);
    const first = await upload(u, PNG);
    await upload(u, PNG); // chosen, then never saved
    expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url: first.url })).status).toBe(200);
    expect(await left()).toEqual([first.path]);
    const second = await upload(u, PNG);
    expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url: second.url })).status).toBe(200);
    expect(await left()).toEqual([second.path]);
  });
  it("refuses a file that is not really an image, and removes it (A7, R13)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const fake = await upload(u, new TextEncoder().encode("<html>not a photo</html>"));
    expect((await call(t, { action: "save_profile", time_zone: "UTC", photo_url: fake.url })).body.error_code).toBe("PHOTO_INVALID");
    expect((await service().storage.from("profile-photos").list(u.id)).data).toEqual([]);
  });
  it("refuses a caller whose email is not confirmed (A26, R15)", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-c", `update auth.users set email_confirmed_at = null where id = '${u.id}'`]);
    const r = await call(t, { action: "save_profile", time_zone: "UTC" });
    expect(r.status).toBe(401);
    expect(r.body.error_code).toBe("AUTH_REQUIRED");
  });
  it("a refreshed session carries the role ensure_identity set (A25, R9)", async () => {
    const email = `t-${crypto.randomUUID()}@example.test`, password = `pw-${crypto.randomUUID()}`;
    await service().auth.admin.createUser({ email, password, email_confirm: true });
    const c = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    const roleIn = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).app_metadata?.role;
    const before = (await c.auth.getSession()).data.session!.access_token;
    expect(roleIn(before)).toBeUndefined();
    expect((await call(before, { action: "ensure_identity", role: "tutor", age_confirmed: true })).status).toBe(200);
    const { refreshRole } = await import("../../parle-app/src/lib/backend/auth");
    await refreshRole(c);
    expect(roleIn((await c.auth.getSession()).data.session!.access_token)).toBe("tutor");
  });
});
