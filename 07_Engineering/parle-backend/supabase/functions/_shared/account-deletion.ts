import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import RULES from "./entity-rules.json" with { type: "json" };

const ANON = "deleted-account";
/** Tables whose rows name a person by user id (column) besides owner_id. */
const BY_USER_ID: Record<string, string> = {
  ParleCoachNote: "user_id", ParleCompStatus: "user_id", Subscriber: "user_id", ai_message: "user_id", ai_session: "user_id",
  availability_exception: "user_id", availability_rule: "user_id", checkin: "user_id", learner_profile: "user_id", learner_task: "user_id",
  milestone: "user_id", mistake_log: "user_id", placement_result: "user_id", roadmap: "user_id", skill_estimate: "user_id",
  topic_mastery: "user_id", tutor_booking_settings: "tutor_user_id", tutor_document: "user_id", tutor_profile: "user_id",
  tutor_profile_public_edits: "user_id", tutor_public_profile: "tutor_user_id", usage_counter: "user_id", week_plan: "user_id",
  placement_run: "user_id",
};
/** Records other people rely on, or content that is not personal: handled explicitly or left alone. */
const KEEP = new Set(["booking", "tutor_review", "admin_audit_log", "app_setting", "question_item", "prompt_item", "tutor_payout_country", "ParlePublicLevelCheckRun"]);

const must = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

/** Removes a person's data (spec section 5, S2); records other people rely on stay, without personal data. */
export async function deleteAccountData(db: SupabaseClient, caller: { id: string; email: string }): Promise<{ blocked?: string; deleted: Record<string, number> }> {
  const { data: subs } = await db.from("Subscriber").select("stripe_status, cancel_at_period_end").eq("user_id", caller.id);
  if ((subs ?? []).some((s: any) => ["active", "trialing", "past_due"].includes(String(s.stripe_status)) && s.cancel_at_period_end !== true)) {
    return { blocked: "ACTIVE_SUBSCRIPTION", deleted: {} };
  }
  // Bookings: the other person keeps the record.
  must(await db.from("booking").update({ learner_user_id: "", learner_first_name: "Deleted learner", learner_message: "", owner_id: null, created_by: ANON }).eq("learner_user_id", caller.id));
  must(await db.from("booking").update({ tutor_user_id: "", tutor_display_name: "Deleted tutor" }).eq("tutor_user_id", caller.id));
  // Reviews written by this person keep their stars, not their words.
  must(await db.from("tutor_review").update({ comment: "", owner_id: null, created_by: ANON }).eq("created_by", caller.email));
  // Reviews about a deleted tutor, and their replies, go with the tutor's profile.
  must(await db.from("tutor_review_reply").delete().eq("tutor_email", caller.email));
  must(await db.from("tutor_review").delete().eq("tutor_email", caller.email));
  must(await db.from("tutor_application_review").delete().eq("tutor_email", caller.email));
  const deleted: Record<string, number> = {};
  for (const table of [...Object.keys(RULES), "placement_run"]) {
    if (KEEP.has(table)) continue;
    const a = await db.from(table).delete({ count: "exact" }).eq("owner_id", caller.id);
    must(a);
    const col = BY_USER_ID[table];
    let extra = 0;
    if (col) {
      const b = await db.from(table).delete({ count: "exact" }).eq(col, caller.id);
      must(b);
      extra = b.count ?? 0;
    }
    deleted[table] = (a.count ?? 0) + extra;
  }
  const { data: files } = await db.storage.from("profile-photos").list(caller.id);
  if (files?.length) await db.storage.from("profile-photos").remove(files.map((f) => `${caller.id}/${f.name}`));
  const gone = await db.auth.admin.deleteUser(caller.id);
  if (gone.error) throw new Error(gone.error.message);
  return { deleted };
}
