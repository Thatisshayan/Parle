import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SKILLS } from "./rules.ts";
import type { BookingRow } from "./store.ts";

export type LessonBrief = {
  learner_name: string; goal: string; track: string; levels: Record<string, number | null>;
  latest_checkin: { date: string; note: string } | null;
  recent_mistakes: Array<{ area: string; original: string; corrected: string }>;
  earlier_notes: Array<{ date: string; skills: unknown; notes: string; homework: string }>;
  learner_message: string;
};

/** Spec section 6: built 24 h before from saved data only, no AI call. Only the booking's tutor reads it. */
export async function buildBrief(db: SupabaseClient, row: BookingRow, learnerName: string): Promise<LessonBrief> {
  const learnerId = row.learner_id ?? "";
  const [profile, roadmap, checkin, mistakes, earlier] = await Promise.all([
    db.from("learner_profile").select("main_goal, track").eq("user_id", learnerId).limit(1),
    db.from("roadmap").select("id").eq("user_id", learnerId).order("created_at", { ascending: false }).limit(1),
    db.from("checkin").select("date_local, what_changed_note").eq("user_id", learnerId).eq("status", "submitted").order("created_at", { ascending: false }).limit(1),
    db.from("mistake_log").select("area, original_sentence, corrected_sentence").eq("user_id", learnerId).order("created_at", { ascending: false }).limit(5),
    db.from("booking").select("id, start_at").eq("learner_id", learnerId).eq("tutor_id", row.tutor_id ?? "").eq("status", "completed")
      .lt("start_at", row.start_at).order("start_at", { ascending: false }).limit(5),
  ]);
  const levels: Record<string, number | null> = Object.fromEntries(SKILLS.map((skill) => [skill, null]));
  const roadmapId = roadmap.data?.[0]?.id;
  if (roadmapId) {
    const { data: estimates } = await db.from("skill_estimate").select("skill, value").eq("user_id", learnerId).eq("roadmap_id", roadmapId).order("created_at", { ascending: false }).limit(40);
    for (const e of estimates ?? []) if (e.skill in levels && levels[e.skill] === null && typeof e.value === "number") levels[e.skill] = e.value;
  }
  const earlierRows = earlier.data ?? [];
  const dates = new Map(earlierRows.map((b: { id: string; start_at: string }) => [b.id, new Date(b.start_at).toISOString().slice(0, 10)]));
  const { data: notes } = earlierRows.length
    ? await db.from("lesson_notes").select("booking_id, skills, notes, homework").in("booking_id", earlierRows.map((b: { id: string }) => b.id))
    : { data: [] as Array<{ booking_id: string; skills: unknown; notes: string; homework: string }> };
  const first = checkin.data?.[0];
  return {
    learner_name: learnerName,
    goal: String(profile.data?.[0]?.main_goal ?? ""),
    track: String(profile.data?.[0]?.track ?? ""),
    levels,
    latest_checkin: first ? { date: String(first.date_local ?? ""), note: String(first.what_changed_note ?? "") } : null,
    recent_mistakes: (mistakes.data ?? []).map((m: Record<string, unknown>) => ({ area: String(m.area ?? ""), original: String(m.original_sentence ?? ""), corrected: String(m.corrected_sentence ?? "") })),
    earlier_notes: (notes ?? [])
      .map((n) => ({ date: dates.get(n.booking_id) ?? "", skills: n.skills, notes: n.notes, homework: n.homework }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    learner_message: row.learner_message,
  };
}
