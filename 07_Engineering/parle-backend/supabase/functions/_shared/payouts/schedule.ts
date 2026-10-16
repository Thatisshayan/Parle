import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonSettings } from "../lessons/settings.ts";
import type { JobStep } from "../lessons/jobs.ts";

/** Creates the lesson's payout once (spec section 7); "not_eligible" for lessons that pay the tutor nothing. */
export async function schedulePayout(db: SupabaseClient, bookingId: string, settings: LessonSettings): Promise<string> {
  const { data, error } = await db.rpc("payout_schedule", { p_booking: bookingId, p_delay_hours: settings.payout_delay_hours });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Safety net every 10 minutes: lessons that reached a paying outcome in the last 30 days but have no payout row. */
export const scheduleMissingPayouts: JobStep = async (db, _payments, settings, now) => {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data, error } = await db.from("booking").select("id, status, late_cancel")
    .in("status", ["completed", "learner_no_show", "disputed", "cancelled_learner"]).not("tutor_id", "is", null)
    .gte("status_changed_at", since).order("status_changed_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const candidates = ((data ?? []) as Array<{ id: string; status: string; late_cancel: boolean }>)
    .filter((b) => b.status !== "cancelled_learner" || b.late_cancel).map((b) => b.id);
  if (!candidates.length) return 0;
  const { data: have, error: haveError } = await db.from("payout").select("booking_id").in("booking_id", candidates);
  if (haveError) throw new Error(haveError.message);
  const done = new Set((have ?? []).map((p: { booking_id: string }) => p.booking_id));
  let scheduled = 0;
  for (const id of candidates.filter((c) => !done.has(c)).slice(0, 50)) {
    try {
      if ((await schedulePayout(db, id, settings)) === "scheduled") scheduled++;
    } catch (e) {
      console.warn("payout could not be scheduled; the next run retries", (e as Error).message);
    }
  }
  return scheduled;
};
