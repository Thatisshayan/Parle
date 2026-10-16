import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonSettings } from "../lessons/settings.ts";
import type { JobStep } from "../lessons/jobs.ts";
import { schedulePayout } from "./schedule.ts";

const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

/**
 * Before a tutor's login is deleted (decision #53): lessons that started but were never marked are completed now (the
 * 48 h rule, early) and every payout is scheduled while the tutor's id is still on the lessons. The payout account
 * keeps only what the last payouts need (country cleared) and goes once nothing is left to send (spec section 3).
 */
export async function settlePayoutsForDeletion(db: SupabaseClient, tutorId: string, settings: LessonSettings, now: Date): Promise<void> {
  const at = now.toISOString();
  must(await db.from("booking").update({ status: "completed", completed_at: at, attendance_marked_by: "auto", status_changed_at: at })
    .eq("tutor_id", tutorId).eq("status", "confirmed").lte("start_at", at));
  const { data, error } = await db.from("booking").select("id, status, late_cancel").eq("tutor_id", tutorId)
    .in("status", ["completed", "learner_no_show", "disputed", "cancelled_learner"]).limit(2000);
  if (error) throw new Error(error.message);
  for (const b of (data ?? []) as Array<{ id: string; status: string; late_cancel: boolean }>) {
    if (b.status !== "cancelled_learner" || b.late_cancel) await schedulePayout(db, b.id, settings);
  }
  must(await db.from("tutor_payout_account").update({ tutor_deleted_at: at, country: null, waitlisted_at: null, updated_at: at }).eq("tutor_id", tutorId));
  await purgeIfSettled(db, tutorId);
}

/** A deleted tutor's account record goes once no payout of theirs is scheduled or held. */
export async function purgeIfSettled(db: SupabaseClient, tutorId: string): Promise<boolean> {
  const { count, error } = await db.from("payout").select("id", { count: "exact", head: true }).eq("tutor_id", tutorId).in("status", ["scheduled", "held"]);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;
  must(await db.from("tutor_payout_account").delete().eq("tutor_id", tutorId).not("tutor_deleted_at", "is", null));
  return true;
}

/** Every 10 minutes: forget deleted tutors' payout accounts whose last payout was sent or cancelled. */
export const purgeDeletedAccounts: JobStep = async (db) => {
  const { data, error } = await db.from("tutor_payout_account").select("tutor_id").not("tutor_deleted_at", "is", null).limit(50);
  if (error) throw new Error(error.message);
  let purged = 0;
  for (const r of data ?? []) if (await purgeIfSettled(db, r.tutor_id)) purged++;
  return purged;
};
