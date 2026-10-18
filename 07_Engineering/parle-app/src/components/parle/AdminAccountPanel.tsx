import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { adminErrorKey, cancelPausedLessons, enableAccount, loadUserDetail, pauseAccount, type LessonCounts, type UserDetail } from "@/lib/parle-admin";
import { formatCadCents } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";

type Note = { kind: "ok" | "error"; key: TranslationKey; values?: Record<string, string | number> };
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso)) : t("adminAccount.never"));
const PAYOUT_KEYS: Record<string, TranslationKey> = {
  ready: "adminAccount.payout.ready", pending: "adminAccount.payout.pending", incomplete: "adminAccount.payout.incomplete",
  country_waitlist: "adminAccount.payout.countryWaitlist", none: "adminAccount.payout.none", not_available: "adminAccount.payout.notAvailable",
};
const SKILL_KEYS: Record<string, TranslationKey> = { listening: "learner.skill.listening", reading: "learner.skill.reading", writing: "learner.skill.writing", speaking: "learner.skill.speaking" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{label}</dt>
      <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{value}</dd>
    </div>
  );
}

/** Spec 3.2 and 3.4: one account's status, pause and enable, and the full picture from the server. */
export default function AdminAccountPanel({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelLessons, setCancelLessons] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try { const d = await loadUserDetail(userId); setDetail(d); setState(d ? "ready" : "error"); } catch { setState("error"); }
  }, [userId]);
  useEffect(() => { setDialog(false); setReason(""); setCancelLessons(false); setNote(null); void load(); }, [load]);

  const lessonsNote = (c: LessonCounts, doneKey: TranslationKey): Note =>
    c.failed > 0 ? { kind: "error", key: "adminAccount.lessonsFailed", values: { failed: c.failed, cancelled: c.cancelled } } : { kind: "ok", key: doneKey, values: { cancelled: c.cancelled } };
  async function run(action: () => Promise<Note>) {
    setBusy(true); setNote(null);
    try { setNote(await action()); setDialog(false); await load(); onChanged(); }
    catch (error) { setNote({ kind: "error", key: adminErrorKey(error) }); } finally { setBusy(false); }
  }

  if (state === "loading") return <p role="status" className="mt-5 flex items-center gap-2 text-sm text-[#65718A]"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminAccount.loading")}</p>;
  if (state === "error" || !detail) return <p role="alert" className="mt-5 text-sm text-[#8D342D]">{t("adminAccount.error")}</p>;
  const a = detail.account, l = detail.learner, tu = detail.tutor;
  const paused = a.status === "disabled";

  return (
    <section aria-labelledby="admin-account-heading" className="mt-5 min-w-0 rounded-[1.35rem] border border-[#E2E6EE] bg-[#F6F8FC] p-4 sm:p-5">
      <h4 id="admin-account-heading" className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminAccount.heading")}</h4>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${paused ? "bg-[#FFF5F2] text-[#8D342D]" : "bg-[#E9F5EE] text-[#236646]"}`}>{t(paused ? "adminAccount.paused" : "adminAccount.active")}</p>
      {a.paused && <p className="mt-2 break-words text-xs leading-5 text-[#53617A]">{t("adminAccount.pausedLine", { by: a.paused.by, date: day(a.paused.at), reason: a.paused.reason })}</p>}

      {a.role === "admin" ? <p className="mt-3 text-xs text-[#65718A]">{t("adminAccount.adminNote")}</p> : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!paused && !dialog && <button type="button" onClick={() => setDialog(true)} className="parle-button-secondary"><PauseCircle aria-hidden="true" className="h-4 w-4" />{t("adminAccount.pause")}</button>}
          {paused && <button type="button" disabled={busy} onClick={() => void run(async () => ({ kind: "ok", key: (await enableAccount(a.id)) > 0 ? "adminAccount.enabledRepublished" : "adminAccount.enabledDone" }))} className="parle-button-primary"><PlayCircle aria-hidden="true" className="h-4 w-4" />{t("adminAccount.enable")}</button>}
          {paused && <button type="button" disabled={busy} onClick={() => void run(async () => lessonsNote(await cancelPausedLessons(a.id), "adminAccount.remainingDone"))} className="parle-button-secondary">{t("adminAccount.cancelRemaining")}</button>}
        </div>
      )}

      {dialog && (
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => lessonsNote(await pauseAccount(a.id, reason.trim(), cancelLessons), "adminAccount.pausedDone")); }} className="mt-3 space-y-3 rounded-xl border border-[#F0C5C0] bg-white p-3">
          <label htmlFor="admin-pause-reason" className="block text-xs font-bold text-[#53617A]">{t("adminAccount.reasonLabel")}
            <textarea id="admin-pause-reason" required minLength={3} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-[#D8DEEA] p-3 text-sm" />
          </label>
          <fieldset>
            <legend className="text-xs font-bold text-[#53617A]">{t("adminAccount.lessonsQuestion")}</legend>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="pause-lessons" checked={!cancelLessons} onChange={() => setCancelLessons(false)} />{t("adminAccount.lessonsNo")}</label>
            <label className="mt-1 flex items-center gap-2 text-sm"><input type="radio" name="pause-lessons" checked={cancelLessons} onChange={() => setCancelLessons(true)} />{t("adminAccount.lessonsYes")}</label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || reason.trim().length < 3} className="parle-button-primary">{t(busy ? "adminAccount.working" : "adminAccount.confirmPause")}</button>
            <button type="button" onClick={() => setDialog(false)} className="parle-button-secondary">{t("adminAccount.cancel")}</button>
          </div>
        </form>
      )}
      {note && <p role={note.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${note.kind === "error" ? "text-[#8D342D]" : "text-[#236646]"}`}>{t(note.key, note.values)}</p>}

      <h5 className="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{t("adminAccount.detailHeading")}</h5>
      <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        <Row label={t("adminAccount.role")} value={`${t(a.role === "admin" ? "role.admin" : a.role === "tutor" ? "role.tutor" : "role.learner")}${a.owner ? `, ${t("adminAccount.owner")}` : ""}`} />
        <Row label={t("adminAccount.signedUp")} value={day(a.signed_up_at)} />
        <Row label={t("adminAccount.lastSignIn")} value={day(a.last_sign_in_at)} />
        <Row label={t("adminAccount.emailVerified")} value={t(a.email_verified ? "adminAccount.yes" : "adminAccount.no")} />
      </dl>

      {l && (
        <>
          <h5 className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{t("adminAccount.learnerHeading")}</h5>
          <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
            <Row label={t("adminAccount.plan")} value={[t(l.plan.name === "Premium" ? "adminAccount.planPremium" : "adminAccount.planFree"), l.plan.source === "complimentary" ? t("adminAccount.complimentary") : "", l.plan.renews_at ? t("adminAccount.renews", { date: day(l.plan.renews_at) }) : "", l.plan.ends_at ? t("adminAccount.ends", { date: day(l.plan.ends_at) }) : ""].filter(Boolean).join(", ")} />
            <Row label={t("adminAccount.goalTrack")} value={[l.goal, l.track].filter(Boolean).join(" / ") || "-"} />
            <Row label={t("adminAccount.levels")} value={Object.entries(l.levels).map(([s, v]) => `${t(SKILL_KEYS[s])} ${v}`).join(", ") || "-"} />
            <Row label={t("adminAccount.thisWeek")} value={l.this_week ? t("adminAccount.thisWeekValue", { done: l.this_week.done, planned: l.this_week.planned }) : t("adminAccount.noPlan")} />
            <Row label={t("adminAccount.aiMessages")} value={t("adminAccount.aiValue", { today: l.ai_messages.today, month: l.ai_messages.this_month })} />
            <Row label={t("adminAccount.lessons")} value={`${t("adminAccount.lessonsValue", { upcoming: l.lessons.upcoming, past: l.lessons.past, cancelled: l.lessons.cancelled })}${l.lessons.refunded_cents ? `, ${t("adminAccount.refunded", { amount: formatCadCents(l.lessons.refunded_cents) })}` : ""}`} />
          </dl>
          {l.plan.stripe_customer_url && <a href={l.plan.stripe_customer_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#1E3A8A] underline"><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />{t("adminAccount.stripeLink")}</a>}
        </>
      )}

      {tu && (
        <>
          <h5 className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{t("adminAccount.tutorHeading")}</h5>
          <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
            <Row label={t("adminAccount.application")} value={tu.application_status || "-"} />
            <Row label={t("adminAccount.rate")} value={tu.hourly_rate_cents === null ? "-" : formatCadCents(tu.hourly_rate_cents)} />
            <Row label={t("adminAccount.availability")} value={`${t("adminAccount.availabilityValue", { hours: tu.availability.weekly_hours })}${tu.availability.windows.length ? `: ${tu.availability.windows.join(", ")}` : ""}`} />
            <Row label={t("adminAccount.foundingLabel")} value={tu.founding_until ? t("adminAccount.founding", { date: tu.founding_until }) : t("adminAccount.notFounding")} />
            <Row label={t("adminAccount.taught")} value={String(tu.lessons_taught)} />
            <Row label={t("adminAccount.rating")} value={tu.rating ? t("adminAccount.ratingValue", { average: tu.rating.average, count: tu.rating.count }) : t("adminAccount.noRating")} />
            <Row label={t("adminAccount.payout")} value={t(PAYOUT_KEYS[tu.payout_account] ?? "adminAccount.payout.notAvailable")} />
          </dl>
        </>
      )}

      <h5 className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{t("adminAccount.audit")}</h5>
      {detail.recent_audit.length === 0 ? <p className="mt-2 text-xs text-[#65718A]">{t("adminAccount.noAudit")}</p> : (
        <ul className="mt-2 space-y-1">{detail.recent_audit.map((e, i) => <li key={`${e.at}-${i}`} className="break-words text-xs text-[#53617A]"><span className="font-bold">{e.action}</span> · {e.by} · {e.at.slice(0, 16).replace("T", " ")}</li>)}</ul>
      )}
    </section>
  );
}
