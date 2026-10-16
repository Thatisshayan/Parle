import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonSettings } from "./settings.ts";
import { isUuid, validMeetingLink, validZone, type Viewer } from "./rules.ts";
import { lessonView, type BookingRow, type LessonView, type NotesRow } from "./view.ts";

export type { BookingRow };
export const LIVE_STATUSES = ["pending_payment", "confirmed"];

export async function loadBooking(db: SupabaseClient, id: string): Promise<BookingRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("booking").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BookingRow | null) ?? null;
}

/** A tutor's booked ranges, each already extended by its frozen buffer (the database rule). Lapsed holds are free. */
export async function blockedRanges(db: SupabaseClient, tutorId: string, now: Date, exceptId = ""): Promise<Array<{ start_utc: string; end_utc: string }>> {
  const { data, error } = await db.from("booking").select("id, start_at, blocked_until, status, hold_expires_at")
    .eq("tutor_id", tutorId).in("status", LIVE_STATUSES).gte("blocked_until", now.toISOString()).order("start_at").limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r: any) => r.id !== exceptId && !(r.status === "pending_payment" && (!r.hold_expires_at || Date.parse(r.hold_expires_at) <= now.getTime())))
    .map((r: any) => ({ start_utc: new Date(r.start_at).toISOString(), end_utc: new Date(r.blocked_until).toISOString() }));
}

export type Listing = { profileId: string; tutorId: string; displayName: string; hourlyRateCents: number; schedule: Record<string, unknown> };

/** The approved, published listing the learner books from; its price and schedule are what the learner was shown. */
export async function publishedListing(db: SupabaseClient, profileId: string): Promise<Listing | null> {
  if (!profileId || profileId.length > 128) return null;
  const { data, error } = await db.from("tutor_public_profile").select("profile_id, tutor_user_id, display_name, hourly_rate_cents, booking_schedule_json")
    .eq("profile_id", profileId).eq("is_published", true).order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row || !isUuid(row.tutor_user_id)) return null;
  let schedule: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.booking_schedule_json || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) schedule = parsed;
  } catch { /* an unreadable schedule offers nothing */ }
  return { profileId: row.profile_id, tutorId: row.tutor_user_id, displayName: String(row.display_name ?? "").trim() || "Your tutor", hourlyRateCents: Number(row.hourly_rate_cents) || 0, schedule };
}

export type Person = { id: string; email: string; firstName: string; timeZone: string };

export async function person(db: SupabaseClient, id: string): Promise<Person | null> {
  const { data } = await db.auth.admin.getUserById(id);
  const user = data?.user;
  if (!user?.email) return null;
  const fullName = String((user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "").trim();
  const { data: profiles } = await db.from("ParleProfile").select("time_zone").eq("owner_id", id).order("created_at", { ascending: false }).limit(1);
  let zone: unknown = profiles?.[0]?.time_zone;
  if (!validZone(zone)) {
    const { data: learnerProfiles } = await db.from("learner_profile").select("time_zone").eq("user_id", id).limit(1);
    zone = learnerProfiles?.[0]?.time_zone;
  }
  return { id, email: user.email, firstName: fullName.split(/\s+/)[0] ?? "", timeZone: validZone(zone) ? zone : "UTC" };
}

export type TutorInfo = Person & { displayName: string; meetingLink: string; foundingUntil: string | null };

export async function tutorInfo(db: SupabaseClient, id: string): Promise<TutorInfo | null> {
  const base = await person(db, id);
  if (!base) return null;
  const [{ data: profiles }, { data: edits }] = await Promise.all([
    db.from("tutor_profile").select("display_name, time_zone, meeting_link, founding_until").eq("user_id", id).order("created_at").limit(1),
    db.from("tutor_profile_public_edits").select("meeting_link").eq("user_id", id).order("updated_at", { ascending: false }).limit(1),
  ]);
  const profile = profiles?.[0];
  // an approved tutor changes the link on Profile & Pricing (saved as an approved edit); the newest valid one wins
  const meetingLink = [edits?.[0]?.meeting_link, profile?.meeting_link].map((v) => String(v ?? "").trim()).find((v) => validMeetingLink(v)) ?? "";
  return {
    ...base,
    displayName: String(profile?.display_name ?? "").trim() || "Your tutor",
    timeZone: validZone(profile?.time_zone) ? profile!.time_zone : base.timeZone,
    meetingLink,
    foundingUntil: typeof profile?.founding_until === "string" ? profile.founding_until : null,
  };
}

/** Lessons as the learner or the tutor sees them, with names, links, notes, review stars and brief flags. */
export async function viewsFor(db: SupabaseClient, rows: BookingRow[], viewer: Viewer, now: Date, settings: LessonSettings): Promise<LessonView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [notes, reviews, briefs] = await Promise.all([
    db.from("lesson_notes").select("booking_id, skills, notes, homework").in("booking_id", ids),
    db.from("tutor_review").select("booking_id, stars").in("booking_id", ids),
    viewer === "tutor" ? db.from("lesson_brief").select("booking_id").in("booking_id", ids) : Promise.resolve({ data: [] as Array<{ booking_id: string }> }),
  ]);
  const tutors = new Map<string, TutorInfo | null>();
  for (const id of new Set(rows.map((r) => r.tutor_id).filter((v): v is string => Boolean(v)))) tutors.set(id, await tutorInfo(db, id));
  const learners = new Map<string, Person | null>();
  if (viewer === "tutor") for (const id of new Set(rows.map((r) => r.learner_id).filter((v): v is string => Boolean(v)))) learners.set(id, await person(db, id));
  const notesBy = new Map((notes.data ?? []).map((n: any) => [n.booking_id, { skills: n.skills, notes: n.notes, homework: n.homework } as NotesRow]));
  const starsBy = new Map((reviews.data ?? []).map((r: any) => [r.booking_id, Number(r.stars)]));
  const briefSet = new Set((briefs.data ?? []).map((b: any) => b.booking_id));
  return rows.map((row) => {
    const tutor = row.tutor_id ? tutors.get(row.tutor_id) : null;
    const learnerPerson = row.learner_id ? learners.get(row.learner_id) : null;
    return lessonView(row, {
      viewer, now, settings,
      tutorName: tutor?.displayName ?? "Former tutor",
      learnerName: viewer === "learner" ? "" : row.learner_id ? (learnerPerson?.firstName || "Learner") : "Former learner",
      meetingLink: tutor?.meetingLink ?? "",
      notes: notesBy.get(row.id) ?? null,
      reviewStars: starsBy.has(row.id) ? starsBy.get(row.id)! : null,
      hasBrief: briefSet.has(row.id),
    });
  });
}
