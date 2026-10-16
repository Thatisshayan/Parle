import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { strugglingSkills, type Skill } from "./rules.ts";

/** Struggling skills from notes on the learner's lessons completed in the last 21 days (most recent first, two at most). */
export async function tutorFocusSkills(db: SupabaseClient, learnerId: string, now = new Date()): Promise<Skill[]> {
  const { data: lessons, error } = await db.from("booking").select("id").eq("learner_id", learnerId).eq("status", "completed")
    .gte("end_at", new Date(now.getTime() - 21 * 86_400_000).toISOString()).limit(50);
  if (error || !lessons?.length) return [];
  const { data: notes } = await db.from("lesson_notes").select("skills, updated_at").in("booking_id", lessons.map((l: { id: string }) => l.id));
  return strugglingSkills((notes ?? []).map((n: { skills: unknown; updated_at: string }) => ({ skills: n.skills, at: n.updated_at })));
}
