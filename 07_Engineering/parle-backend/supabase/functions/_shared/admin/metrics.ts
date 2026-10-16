import { allPages } from "../paging.ts";
import { AdminError, type AdminContext } from "./context.ts";
import { BANDS, demandByBand, offeredHours, supplyByBand, trackComparison, type Rule } from "./metrics-rules.ts";

/** Every row, page by page: the API answers at most 1,000 rows per request (config max_rows). */
function every<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  return allPages<T>(async (offset, size) => {
    const r = await make(offset, offset + size - 1);
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as T[];
  });
}

/** Spec 3.5 (D24): every number from the server, for 7, 30 or 90 days. Supply counts published (bookable) tutors only. */
export async function adminMetrics(ctx: AdminContext): Promise<Record<string, unknown>> {
  const days = Number(ctx.body.days);
  if (![7, 30, 90].includes(days)) throw new AdminError("RANGE_INVALID", 400, "Choose 7, 30 or 90 days.");
  const to = ctx.now, from = new Date(to.getTime() - days * 86_400_000);
  const { data: counts, error } = await ctx.db.rpc("admin_metrics", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);

  const db = ctx.db;
  const listings = await every<{ tutor_user_id: string; specialties: unknown }>((a, b) => db.from("tutor_public_profile").select("tutor_user_id, specialties").eq("is_published", true).order("id").range(a, b));
  const tutorIds = [...new Set(listings.map((l) => l.tutor_user_id).filter(Boolean))];
  const rulesByTutor = new Map<string, Rule[]>();
  for (let i = 0; i < tutorIds.length; i += 200) {
    const part = tutorIds.slice(i, i + 200);
    for (const r of await every<Rule & { user_id: string }>((a, b) => db.from("availability_rule").select("user_id, day_of_week, start_local, end_local").in("user_id", part).order("id").range(a, b))) {
      rulesByTutor.set(r.user_id, [...(rulesByTutor.get(r.user_id) ?? []), r]);
    }
  }
  const allRules = [...rulesByTutor.values()].flat();
  const learnerIds = new Set((await every<{ owner_id: string }>((a, b) => db.from("ParleIdentity").select("owner_id").eq("role", "learner").order("id").range(a, b))).map((r) => r.owner_id));
  const profiles = (await every<{ user_id: string; track: unknown; availability: unknown; tutor_windows: unknown }>((a, b) => db.from("learner_profile").select("user_id, track, availability, tutor_windows").order("id").range(a, b)))
    .filter((p) => learnerIds.has(p.user_id));
  const supply = supplyByBand(allRules);
  const demand = demandByBand(profiles.map((p) => p.tutor_windows));
  const booked = Number((counts as { lessons?: { booked_hours?: number } })?.lessons?.booked_hours ?? 0);
  return {
    range: { days, from: from.toISOString(), to: to.toISOString() },
    ...(counts as Record<string, unknown>),
    tutor_hours: { offered: offeredHours(allRules, days), booked },
    demand_supply: BANDS.map((band) => ({ band, learners: demand[band], tutor_hours_per_week: supply[band] })),
    tracks: trackComparison(profiles, listings.map((l) => ({ specialties: l.specialties, rules: rulesByTutor.get(l.tutor_user_id) ?? [] }))),
  };
}
