import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonSettings } from "../lessons/settings.ts";
import type { JobStep } from "../lessons/jobs.ts";

/** Creates the lesson's payout once (spec section 7); "not_eligible" for lessons that pay the tutor nothing. */
export async function schedulePayout(db: SupabaseClient, bookingId: string, settings: LessonSettings): Promise<string> {
  const { data, error } = await db.rpc("payout_schedule", { p_booking: bookingId, p_delay_hours: settings.payout_delay_hours });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Safety net every 10 minutes: every lesson with a paying outcome but no payout row, oldest first (Plan 7B review). */
export const scheduleMissingPayouts: JobStep = async (db, _payments, settings) => {
  const { data, error } = await db.rpc("payout_missing", { p_limit: 50 });
  if (error) throw new Error(error.message);
  let scheduled = 0;
  for (const r of (data ?? []) as Array<{ booking_id: string }>) {
    try {
      if ((await schedulePayout(db, r.booking_id, settings)) === "scheduled") scheduled++;
    } catch (e) {
      console.warn("payout could not be scheduled; the next run retries", e instanceof Error ? e.name : "unknown");
    }
  }
  return scheduled;
};
