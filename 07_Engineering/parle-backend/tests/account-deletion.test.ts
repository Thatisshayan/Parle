import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";

const FN = "parle-account-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

async function learnerWithData() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction(FN, t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction(FN, t, { action: "save_profile", time_zone: "UTC" });
  await callFunction(FN, t, { action: "save_learner_profile", track: "general", goals: ["general"], main_goal: "general" });
  const tutor = await makeUser("tutor");
  const db = service();
  const day = new Date(Date.now() - 5 * 86_400_000); day.setUTCHours(10, 0, 0, 0);
  const { data: booking, error: bErr } = await db.from("booking").insert({ learner_id: u.id, tutor_id: tutor.id, tutor_profile_id: "p", start_at: day.toISOString(), end_at: new Date(day.getTime() + 30 * 60_000).toISOString(), minutes: 30, price_cents: 1000, commission_pct: 20, status: "completed", learner_message: "Hi" }).select("id").single();
  if (bErr) throw bErr;
  const { data: review, error: rErr } = await db.from("tutor_review").insert({ owner_id: u.id, created_by: u.email, tutor_email: tutor.email, stars: 5, comment: "Great, I'm Ana from Laval" }).select("id").single();
  if (rErr) throw rErr;
  return { u, t, bookingId: booking!.id, reviewId: review!.id };
}

import RULES from "../supabase/functions/_shared/entity-rules.json";

/** Every row in any app table that still names this person by owner, id or email. */
async function rowsNaming(id: string, email: string): Promise<string[]> {
  const db = service();
  const hits: string[] = [];
  const columns = ["owner_id", "user_id", "tutor_user_id", "learner_user_id", "created_by", "tutor_email", "email", "actor_user_id"];
  for (const table of [...Object.keys(RULES), "placement_run"]) {
    for (const col of columns) {
      const value = col.endsWith("_id") ? id : email;
      const { data, error } = await db.from(table).select("id").eq(col, value).limit(1);
      if (!error && data && data.length) hits.push(`${table}.${col}`);
    }
  }
  const { data: files } = await db.storage.from("profile-photos").list(id);
  if (files?.length) hits.push("storage:profile-photos");
  return hits;
}

describe("delete my account", () => {
  it("needs the typed confirmation and the right password", async () => {
    const { t, u } = await learnerWithData();
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password })).body.error_code).toBe("CONFIRMATION_REQUIRED");
    expect((await callFunction(FN, t, { action: "delete_account", password: "wrong", confirm: "DELETE" })).body.error_code).toBe("PASSWORD_INCORRECT");
    expect((await service().auth.admin.getUserById(u.id)).data.user).not.toBeNull();
  });
  it("removes personal rows and the login, keeps other people's records anonymised", async () => {
    const other = await learnerWithData();
    const { u, t, bookingId, reviewId } = await learnerWithData();
    const r = await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" });
    expect(r.body).toEqual({ status: "deleted" });
    const db = service();
    expect((await db.auth.admin.getUserById(u.id)).data.user).toBeNull();
    for (const table of ["ParleIdentity", "ParleProfile", "learner_profile"]) {
      expect({ table, rows: (await db.from(table).select("id").eq("created_by", u.email)).data }).toEqual({ table, rows: [] });
    }
    const { data: booking } = await db.from("booking").select("learner_id, status").eq("id", bookingId).single();
    expect(booking).toEqual({ learner_id: null, status: "completed" });
    const { data: review } = await db.from("tutor_review").select("stars, comment, created_by").eq("id", reviewId).single();
    expect(review).toEqual({ stars: 5, comment: "", created_by: "deleted-account" });
    expect((await db.from("ParleIdentity").select("id").eq("owner_id", other.u.id)).data!.length).toBe(1);
  });
  it("is refused while a paid subscription is active", async () => {
    const { u, t } = await learnerWithData();
    await service().from("Subscriber").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, email: u.email, stripe_status: "active", cancel_at_period_end: false });
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" })).body.error_code).toBe("ACTIVE_SUBSCRIPTION");
  });
  it("password guesses are limited to 5 an hour (final review 5)", async () => {
    const { t, u } = await learnerWithData();
    for (let i = 0; i < 5; i++) {
      expect((await callFunction(FN, t, { action: "delete_account", password: `wrong-${i}`, confirm: "DELETE" })).body.error_code).toBe("PASSWORD_INCORRECT");
    }
    const sixth = await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" });
    expect(sixth.status).toBe(429);
    expect((await service().auth.admin.getUserById(u.id)).data.user).not.toBeNull();
  }, 30000);
  it("no row anywhere still names a deleted learner (final review 6)", async () => {
    const { u, t } = await learnerWithData();
    await service().from("mistake_log").insert({ owner_id: null, created_by: u.email, skill: "writing" }); // linked by email only (as Plan 4 imports may be)
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" })).body).toEqual({ status: "deleted" });
    expect(await rowsNaming(u.id, u.email)).toEqual([]);
  }, 30000);
  it("deleting a tutor removes their profile, reviews about them and replies, and anonymises their bookings (final review 6)", async () => {
    const tutor = await makeUser("tutor"), tt = await tokenOf(tutor);
    await callFunction(FN, tt, { action: "ensure_identity", role: "tutor", age_confirmed: true });
    const learner = await makeUser("learner");
    const db = service();
    await db.from("tutor_profile").insert({ owner_id: tutor.id, created_by: tutor.email, user_id: tutor.id, display_name: "T" });
    await db.from("tutor_public_profile").insert({ owner_id: tutor.id, created_by: tutor.email, tutor_user_id: tutor.id, display_name: "T", is_published: true });
    const { data: review } = await db.from("tutor_review").insert({ owner_id: learner.id, created_by: learner.email, tutor_email: tutor.email, stars: 4, comment: "ok" }).select("id").single();
    await db.from("tutor_review_reply").insert({ owner_id: tutor.id, created_by: tutor.email, tutor_email: tutor.email, review_id: review!.id, reply_text: "merci" });
    const past = new Date(Date.now() - 4 * 86_400_000); past.setUTCHours(11, 0, 0, 0);
    const { data: booking } = await db.from("booking").insert({ learner_id: learner.id, tutor_id: tutor.id, tutor_profile_id: "p", start_at: past.toISOString(), end_at: new Date(past.getTime() + 30 * 60_000).toISOString(), minutes: 30, price_cents: 1000, commission_pct: 20, status: "completed" }).select("id").single();
    expect((await callFunction(FN, tt, { action: "delete_account", password: tutor.password, confirm: "DELETE" })).body).toEqual({ status: "deleted" });
    expect(await rowsNaming(tutor.id, tutor.email)).toEqual([]);
    const { data: b } = await db.from("booking").select("tutor_id, learner_id").eq("id", booking!.id).single();
    expect(b).toEqual({ tutor_id: null, learner_id: learner.id });
  }, 30000);
  it("administrators cannot delete themselves", async () => {
    const admin = await makeUser("admin");
    expect((await callFunction(FN, await tokenOf(admin), { action: "delete_account", password: admin.password, confirm: "DELETE" })).body.error_code).toBe("ADMIN_CANNOT_SELF_DELETE");
  });
  it("refuses to delete when the subscription cannot be read (A13, R17)", async () => {
    const { deleteAccountData } = await import("../supabase/functions/_shared/account-deletion");
    const untouched = () => { throw new Error("nothing may be removed"); };
    const fake: any = {
      from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "read failed" } }) }), update: untouched, delete: untouched }),
      storage: { from: untouched },
      auth: { admin: { deleteUser: untouched } },
    };
    expect(await deleteAccountData(fake, { id: "u", email: "e@x.test" })).toEqual({ blocked: "SUBSCRIPTION_UNREADABLE", deleted: {} });
  });
  it("a failed photo listing stops the deletion before anything else is removed (A13, R17)", async () => {
    const { deleteAccountData } = await import("../supabase/functions/_shared/account-deletion");
    const untouched = () => { throw new Error("nothing may be removed"); };
    const fake: any = {
      from: (table: string) => table === "Subscriber"
        ? { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
        : { update: untouched, delete: untouched, select: untouched },
      storage: { from: () => ({ list: async () => ({ data: null, error: { message: "storage list failed" } }), remove: untouched }) },
      auth: { admin: { deleteUser: untouched } },
    };
    await expect(deleteAccountData(fake, { id: "u", email: "e@x.test" })).rejects.toThrow("storage list failed");
  });
  it("removes every profile photo, past the first 100 (A13, R17)", async () => {
    const { u, t } = await learnerWithData();
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
    for (let i = 0; i < 105; i++) {
      const { error } = await service().storage.from("profile-photos").upload(`${u.id}/${String(i).padStart(3, "0")}.png`, png);
      if (error) throw error;
    }
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" })).body).toEqual({ status: "deleted" });
    expect((await service().storage.from("profile-photos").list(u.id, { limit: 1000 })).data).toEqual([]);
  }, 120000);
});
