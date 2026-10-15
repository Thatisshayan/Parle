import { serviceClient, ownedTable } from "../_shared/db.ts";
import { getCaller } from "../_shared/caller.ts";
import { json, fail, preflight } from "../_shared/http.ts";
import { serveWith } from "../_shared/serve.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deleteAccountData } from "../_shared/account-deletion.ts";
import { takeRateLimit } from "../_shared/rate-limit.ts";
import { validLanguage, validTrack } from "../_shared/account-rules.ts";
import { ownPhotoPath } from "../_shared/profile-photo.ts";

const validZone = (z: unknown) => { try { return typeof z === "string" && !!z && (new Intl.DateTimeFormat("en", { timeZone: z }), true); } catch { return false; } };
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const LEARNER_PROFILE_FIELDS = ["goals", "main_goal", "other_goal_text", "track", "target_per_skill", "target_date", "no_deadline", "test_booked", "test_booked_date", "availability", "tutor_windows", "tutor_budget_band", "self_assessed_level", "native_language", "time_zone"];
const PROFILE_FIELDS = ["photo_url", "time_zone", "native_language", "explain_in_native", "email_product_updates"];
/** Learner-only actions: tutors and administrators have no learner profile or placement (R10). */
const LEARNER_ONLY = new Set(["save_learner_profile", "save_unverified_placement"]);

/** Account and onboarding writes for the signed-in user (backend Plan 2; replaces direct browser writes). */
serveWith(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const admin = serviceClient();
  const caller = await getCaller(req, admin);
  if (!caller) return fail("AUTH_REQUIRED", 401, "Authentication required");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  if (LEARNER_ONLY.has(body.action) && caller.role !== "learner") return fail("LEARNER_ONLY", 403, "This action is for learner accounts.");
  try {
    switch (body.action) {
      case "ensure_identity": {
        if (caller.role === "admin") return fail("ADMIN_NOT_ALLOWED", 403);
        if (body.role !== "learner" && body.role !== "tutor") return fail("INVALID_INPUT", 400);
        if (body.age_confirmed !== true) return fail("AGE_CONFIRMATION_REQUIRED", 400);
        const t = ownedTable(admin, caller, "ParleIdentity");
        const [existing] = await t.findMine({}, "created_at", 1);
        if (existing && existing.role !== body.role) return fail("ROLE_EXISTS", 409);
        const identity = existing ?? await t.insertMine({ role: body.role, age_confirmed: true, age_confirmed_at: new Date().toISOString(), premium_comp_active: false });
        // The role in app_metadata is what server checks read; (re)assert it every time so a failed write is repaired on retry.
        const { error: roleError } = await admin.auth.admin.updateUserById(caller.id, { app_metadata: { role: identity.role } });
        if (roleError) throw new Error(roleError.message);
        return json({ identity });
      }
      case "save_profile": {
        const values = pick(body, PROFILE_FIELDS);
        if ("time_zone" in values && !validZone(values.time_zone)) return fail("INVALID_INPUT", 400, "A valid time zone is required.");
        if ("native_language" in values && !validLanguage(values.native_language)) return fail("INVALID_INPUT", 400, "Choose a language from the available list.");
        const t = ownedTable(admin, caller, "ParleProfile");
        const [existing] = await t.findMine({}, "-created_at", 1);
        // A new photo must be a file in the caller's own folder of our storage; an unchanged saved address is kept (R10).
        const photoChanged = "photo_url" in values && values.photo_url !== (existing?.photo_url ?? "");
        if (photoChanged && values.photo_url !== "" && !ownPhotoPath(values.photo_url, caller.id)) return fail("PHOTO_INVALID", 400, "Choose a photo uploaded from this page.");
        const profile = existing ? await t.updateMine(existing.id, values) : await t.insertMine({ photo_url: "", time_zone: "", native_language: "", explain_in_native: false, email_product_updates: false, ...values });
        return json({ profile });
      }
      case "save_learner_profile": {
        const values = { ...pick(body, LEARNER_PROFILE_FIELDS), user_id: caller.id };
        if ("time_zone" in values && values.time_zone !== "" && !validZone(values.time_zone)) return fail("INVALID_INPUT", 400);
        if ("track" in values && !validTrack(values.track)) return fail("INVALID_INPUT", 400, "Choose a track from the available list.");
        if ("native_language" in values && !validLanguage(values.native_language)) return fail("INVALID_INPUT", 400, "Choose a language from the available list.");
        const t = ownedTable(admin, caller, "learner_profile");
        const [existing] = await t.findMine({}, "-created_at", 1);
        return json({ learner_profile: existing ? await t.updateMine(existing.id, values) : await t.insertMine(values) });
      }
      case "save_unverified_placement": {
        const track = String(body.track ?? "");
        if (!validTrack(track)) return fail("INVALID_INPUT", 400, "Choose a track from the available list.");
        const values = { user_id: caller.id, taken_at: new Date().toISOString(), level_per_skill: JSON.stringify({ L: null, R: null, W: null, S: null }), nclc_estimate_per_skill: JSON.stringify({}), speaking_assessed: false, responses: "[]", status: "unverified", self_assessed_level: String(body.self_assessed_level ?? ""), source: "self_assessment", track };
        const t = ownedTable(admin, caller, "placement_result");
        const [existing] = await t.findMine({ status: "unverified" }, "-created_at", 1);
        return json({ placement_result: existing ? await t.updateMine(existing.id, values) : await t.insertMine(values) });
      }
      case "delete_account": {
        if (body.confirm !== "DELETE") return fail("CONFIRMATION_REQUIRED", 400, "Type DELETE to confirm.");
        if (caller.role === "admin") return fail("ADMIN_CANNOT_SELF_DELETE", 403);
        // At most 5 password checks per account per hour, so a stolen session cannot guess the password (final review 5).
        if (!(await takeRateLimit(admin, `delete:${caller.id}`, 3600, 5))) return fail("RATE_LIMITED", 429, "Too many attempts. Try again in an hour.");
        // The password is checked again with a throw-away client, so a stolen session alone cannot delete the account.
        const check = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
        const signIn = await check.auth.signInWithPassword({ email: caller.email, password: String(body.password ?? "") });
        if (signIn.error) return fail("PASSWORD_INCORRECT", 403, "That password is not right.");
        await check.auth.signOut({ scope: "local" }).catch(() => undefined); // close the check session at once
        const result = await deleteAccountData(admin, caller);
        if (result.blocked) return fail(result.blocked, 409, "Cancel your Premium subscription in Manage billing first.");
        console.info("account deleted", { tables: Object.keys(result.deleted).length });
        return json({ status: "deleted" });
      }
      default:
        return fail("UNKNOWN_ACTION", 400);
    }
  } catch (e) {
    console.error("parle-account-service", body.action, (e as Error).message);
    return fail("REQUEST_FAILED", 500);
  }
});
