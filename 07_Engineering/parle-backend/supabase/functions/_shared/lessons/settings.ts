import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Lesson policy (spec section 3, "Settings"). Administrators edit the numbers in Admin settings. */
export const LESSON_SETTING_DEFAULTS = {
  commission_percent: 20,
  founding_commission_percent: 10,
  payout_delay_hours: 72,
  cancellation_window_hours: 24,
  min_notice_hours: 12,
  booking_horizon_days: 30,
  minimum_lesson_charge_usd: 8,
  slot_hold_minutes: 30,
  auto_complete_hours: 48,
  tutor_cancellation_flag_count: 3,
  /** Plan 7B turns this on once tutors can connect a payout account; until then booking stays open in test mode. */
  require_payout_account: false,
};

export type LessonSettings = {
  [K in keyof typeof LESSON_SETTING_DEFAULTS]: (typeof LESSON_SETTING_DEFAULTS)[K] extends boolean ? boolean : number;
};

const LIMITS: Record<string, [number, number]> = {
  commission_percent: [0, 50],
  founding_commission_percent: [0, 50],
  payout_delay_hours: [0, 720],
  cancellation_window_hours: [0, 168],
  min_notice_hours: [0, 48],
  booking_horizon_days: [1, 30],
  minimum_lesson_charge_usd: [8, 500],
  slot_hold_minutes: [30, 120], // Stripe's Checkout page lives at least 30 minutes
  auto_complete_hours: [24, 168],
  tutor_cancellation_flag_count: [1, 20],
};

/** Values are JSON-encoded scalars (as Buildy stored them); a missing or invalid value keeps the default. */
export function parseLessonSettings(rows: Array<{ key?: unknown; value?: unknown }>): LessonSettings {
  const out: Record<string, number | boolean> = { ...LESSON_SETTING_DEFAULTS };
  for (const row of rows) {
    const key = typeof row.key === "string" ? row.key : "";
    if (!Object.prototype.hasOwnProperty.call(LESSON_SETTING_DEFAULTS, key)) continue;
    let value: unknown = row.value;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { continue; }
    }
    if (key === "require_payout_account") {
      if (typeof value === "boolean") out[key] = value;
      continue;
    }
    const [min, max] = LIMITS[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) out[key] = value;
  }
  return out as LessonSettings;
}

export async function lessonSettings(db: SupabaseClient): Promise<LessonSettings> {
  const { data, error } = await db.from("app_setting").select("key, value, updated_at")
    .in("key", Object.keys(LESSON_SETTING_DEFAULTS)).order("updated_at", { ascending: true });
  if (error) throw new Error(`lesson settings: ${error.message}`);
  return parseLessonSettings(data ?? []);
}
