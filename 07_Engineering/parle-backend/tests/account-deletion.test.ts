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
  const { data: booking, error: bErr } = await db.from("booking").insert({ owner_id: u.id, created_by: u.email, learner_user_id: u.id, learner_first_name: "Ana", learner_message: "Hi", tutor_user_id: tutor.id, tutor_display_name: "T", status: "requested" }).select("id").single();
  if (bErr) throw bErr;
  const { data: review, error: rErr } = await db.from("tutor_review").insert({ owner_id: u.id, created_by: u.email, tutor_email: tutor.email, stars: 5, comment: "Great, I'm Ana from Laval" }).select("id").single();
  if (rErr) throw rErr;
  return { u, t, bookingId: booking!.id, reviewId: review!.id };
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
    const { data: booking } = await db.from("booking").select("learner_user_id, learner_first_name, learner_message, created_by, status").eq("id", bookingId).single();
    expect(booking).toEqual({ learner_user_id: "", learner_first_name: "Deleted learner", learner_message: "", created_by: "deleted-account", status: "requested" });
    const { data: review } = await db.from("tutor_review").select("stars, comment, created_by").eq("id", reviewId).single();
    expect(review).toEqual({ stars: 5, comment: "", created_by: "deleted-account" });
    expect((await db.from("ParleIdentity").select("id").eq("owner_id", other.u.id)).data!.length).toBe(1);
  });
  it("is refused while a paid subscription is active", async () => {
    const { u, t } = await learnerWithData();
    await service().from("Subscriber").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, email: u.email, stripe_status: "active", cancel_at_period_end: false });
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" })).body.error_code).toBe("ACTIVE_SUBSCRIPTION");
  });
  it("administrators cannot delete themselves", async () => {
    const admin = await makeUser("admin");
    expect((await callFunction(FN, await tokenOf(admin), { action: "delete_account", password: admin.password, confirm: "DELETE" })).body.error_code).toBe("ADMIN_CANNOT_SELF_DELETE");
  });
});
