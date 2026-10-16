/** Pure lesson rules (spec sections 2, 5 and 6). No database, no network: unit-tested in tests/lesson-rules.test.ts. */
export const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];
export type NoteLevel = "struggling" | "ok" | "strong";
export type Viewer = "learner" | "tutor";

const HOUR = 3_600_000;
const ms = (iso: string) => Date.parse(iso);

/** Founding tutors: the founding commission for bookings made before their founding date (decision #22). */
export function commissionPctFor(i: { foundingUntil: string | null; bookedAt: Date; commissionPercent: number; foundingCommissionPercent: number }): number {
  const founding = typeof i.foundingUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.foundingUntil) && i.bookedAt.toISOString().slice(0, 10) < i.foundingUntil;
  return founding ? i.foundingCommissionPercent : i.commissionPercent;
}

export type CancelOutcome = { refundCents: number; late: boolean; status: "cancelled_learner" | "cancelled_tutor"; reason: "learner_cancelled" | "tutor_cancelled" };

/** Spec section 5: learner 24 h or more ahead = full refund; later = no refund (tutor paid, 7B); tutor = full refund. */
export function cancelOutcome(i: { by: Viewer; startAt: string; now: Date; priceCents: number; windowHours: number }): CancelOutcome {
  if (i.by === "tutor") return { refundCents: i.priceCents, late: false, status: "cancelled_tutor", reason: "tutor_cancelled" };
  const early = ms(i.startAt) - i.now.getTime() >= i.windowHours * HOUR;
  return { refundCents: early ? i.priceCents : 0, late: !early, status: "cancelled_learner", reason: "learner_cancelled" };
}

export function canCancel(i: { status: string; startAt: string; now: Date }): boolean {
  return i.status === "confirmed" && ms(i.startAt) > i.now.getTime();
}

export function canReschedule(i: { status: string; startAt: string; now: Date; windowHours: number; rescheduleCount: number }): boolean {
  return i.status === "confirmed" && i.rescheduleCount === 0 && ms(i.startAt) - i.now.getTime() >= i.windowHours * HOUR;
}

export function canMarkAttendance(i: { status: string; endAt: string; now: Date }): boolean {
  return i.status === "confirmed" && ms(i.endAt) <= i.now.getTime();
}

/** Report a problem: until the lesson's payout would be sent (payout_delay_hours after the end). */
export function canReport(i: { status: string; endAt: string; now: Date; payoutDelayHours: number }): boolean {
  return (i.status === "completed" || i.status === "learner_no_show") && i.now.getTime() < ms(i.endAt) + i.payoutDelayHours * HOUR;
}

/**
 * 24 h reminder only for lessons booked (or moved) 24 h or more ahead, and never once the 1 h reminder is due
 * (a late job run must not say "tomorrow"); 1 h reminder for every lesson.
 */
export function reminderDue(kind: "24h" | "1h", i: { startAt: string; bookedAt: string; now: Date }): boolean {
  const start = ms(i.startAt), now = i.now.getTime();
  if (start <= now) return false;
  if (kind === "1h") return start - now <= HOUR;
  return start - now <= 24 * HOUR && start - now > HOUR && start - ms(i.bookedAt) >= 24 * HOUR;
}

export function autoCompleteDue(i: { status: string; endAt: string; now: Date; autoCompleteHours: number }): boolean {
  return i.status === "confirmed" && i.now.getTime() - ms(i.endAt) >= i.autoCompleteHours * HOUR;
}

export function validNoteSkills(value: unknown): Partial<Record<Skill, NoteLevel>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Partial<Record<Skill, NoteLevel>> = {};
  for (const [key, level] of Object.entries(value as Record<string, unknown>)) {
    if (!(SKILLS as readonly string[]).includes(key)) return null;
    if (level !== "struggling" && level !== "ok" && level !== "strong") return null;
    out[key as Skill] = level;
  }
  return Object.keys(out).length ? out : null;
}

/** Skills a tutor marked "struggling", most recent note first, at most two (a focus, never an estimate). */
export function strugglingSkills(notes: Array<{ skills: unknown; at: string }>): Skill[] {
  const out: Skill[] = [];
  for (const note of [...notes].sort((a, b) => ms(b.at) - ms(a.at))) {
    const skills = validNoteSkills(note.skills);
    if (!skills) continue;
    for (const skill of SKILLS) if (skills[skill] === "struggling" && !out.includes(skill)) out.push(skill);
  }
  return out.slice(0, 2);
}

export function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function validZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}

export function validMeetingLink(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us")) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
