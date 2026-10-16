import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { loadMetrics, type Band, type Metrics, type MetricsDays } from "@/lib/parle-admin";
import { formatCadCents } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";

const BAND_KEYS: Record<Band, TranslationKey> = {
  weekday_morning: "onboarding.window.weekdayMorning", weekday_afternoon: "onboarding.window.weekdayAfternoon", weekday_evening: "onboarding.window.weekdayEvening",
  weekend_morning: "onboarding.window.weekendMorning", weekend_afternoon: "onboarding.window.weekendAfternoon", weekend_evening: "onboarding.window.weekendEvening",
};
const TRACK_KEYS: Record<"immigration" | "citizenship", TranslationKey> = { immigration: "adminMetrics.track.immigration", citizenship: "adminMetrics.track.citizenship" };
const RANGES: MetricsDays[] = [7, 30, 90];
const sum = (rows: Array<Record<string, number | string>>, k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-[1.25rem] border border-[#E2E6EE] bg-white p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{label}</p>
      <p className="mt-2 break-words font-display text-2xl font-extrabold text-[#1E3156]">{value}</p>
      {sub && <p className="mt-1 break-words text-xs text-[#65718A]">{sub}</p>}
    </div>
  );
}

/** D24: every number computed on the server for 7, 30 or 90 days (spec 3.5). */
export default function AdminMetrics() {
  const [days, setDays] = useState<MetricsDays>(30);
  const [m, setM] = useState<Metrics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  async function load(d: MetricsDays) {
    setState("loading");
    try { const r = await loadMetrics(d); setM(r); setState(r ? "ready" : "error"); } catch { setState("error"); }
  }
  useEffect(() => { void load(days); }, [days]);

  return (
    <div className="min-w-0 space-y-6">
      <div role="group" aria-label={t("adminStats.rangeLabel")} className="flex flex-wrap gap-2">
        {RANGES.map((d) => <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={d === days ? "parle-button-primary" : "parle-button-secondary"}>{t("adminStats.range", { days: d })}</button>)}
      </div>
      {state === "loading" && <p role="status" className="flex items-center gap-2 text-sm text-[#65718A]"><LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />{t("adminStats.loading")}</p>}
      {state === "error" && <div role="alert" className="text-sm text-[#8D342D]">{t("adminStats.error")} <button type="button" onClick={() => void load(days)} className="ml-2 inline-flex items-center gap-1 underline"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminStats.retry")}</button></div>}
      {state === "ready" && m && (
        <>
          <section aria-labelledby="stats-people" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <h2 id="stats-people" className="sr-only">{t("adminStats.peopleHeading")}</h2>
            <Tile label={t("adminStats.signups")} value={String(sum(m.signups_by_week, "learners") + sum(m.signups_by_week, "tutors"))} sub={t("adminStats.signupsValue", { learners: sum(m.signups_by_week, "learners"), tutors: sum(m.signups_by_week, "tutors") })} />
            <Tile label={t("adminStats.premium")} value={String(m.premium.paid + m.premium.complimentary)} sub={t("adminStats.premiumValue", { paid: m.premium.paid, comp: m.premium.complimentary, started: m.premium.started, ended: m.premium.ended })} />
            <Tile label={t("adminStats.practice")} value={String(m.practice_completed)} sub={t("adminStats.checkins", { count: m.checkins_submitted })} />
            <Tile label={t("adminStats.ai")} value={String(m.ai_messages)} />
          </section>

          <section aria-labelledby="stats-weeks" className="min-w-0 overflow-x-auto rounded-[1.25rem] border border-[#E2E6EE] bg-white p-4">
            <h2 id="stats-weeks" className="font-display text-lg font-extrabold text-primary">{t("adminStats.weeksHeading")}</h2>
            {m.signups_by_week.length === 0 && m.active_learners_by_week.length === 0 ? <p className="mt-2 text-sm text-[#65718A]">{t("adminStats.noData")}</p> : (
              <table className="mt-3 w-full min-w-[320px] text-left text-sm">
                <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-[#78839A]"><th className="py-1">{t("adminStats.week")}</th><th>{t("adminStats.newLearners")}</th><th>{t("adminStats.newTutors")}</th><th>{t("adminStats.activeLearners")}</th></tr></thead>
                <tbody>{[...new Set([...m.signups_by_week.map((w) => w.week), ...m.active_learners_by_week.map((w) => w.week)])].sort().map((week) => (
                  <tr key={week} className="border-t border-[#EEF0F4]"><td className="py-1.5">{week}</td><td>{m.signups_by_week.find((w) => w.week === week)?.learners ?? 0}</td><td>{m.signups_by_week.find((w) => w.week === week)?.tutors ?? 0}</td><td>{m.active_learners_by_week.find((w) => w.week === week)?.learners ?? 0}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="stats-lessons" className="min-w-0">
            <h2 id="stats-lessons" className="mb-3 font-display text-lg font-extrabold text-primary">{t("adminStats.lessonsHeading")}</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label={t("adminStats.booked")} value={String(m.lessons.booked)} sub={t("adminStats.completed", { count: m.lessons.completed })} />
              <Tile label={t("adminStats.cancelled")} value={String(m.lessons.cancelled_by_learner + m.lessons.cancelled_by_tutor + m.lessons.cancelled_by_parle)} sub={t("adminStats.cancelledValue", { learner: m.lessons.cancelled_by_learner, tutor: m.lessons.cancelled_by_tutor, parle: m.lessons.cancelled_by_parle })} />
              <Tile label={t("adminStats.revenue")} value={formatCadCents(m.lessons.revenue_cents)} sub={t("adminStats.moneyValue", { commission: formatCadCents(m.lessons.commission_cents), refunded: formatCadCents(m.lessons.refunded_cents) })} />
              <Tile label={t("adminStats.hours")} value={t("adminStats.hoursValue", { booked: m.tutor_hours.booked, offered: m.tutor_hours.offered })} />
            </div>
          </section>

          <section aria-labelledby="stats-bands" className="min-w-0 overflow-x-auto rounded-[1.25rem] border border-[#E2E6EE] bg-white p-4">
            <h2 id="stats-bands" className="font-display text-lg font-extrabold text-primary">{t("adminStats.bandsHeading")}</h2>
            <p className="mt-1 text-xs text-[#65718A]">{t("adminStats.bandsIntro")}</p>
            <table className="mt-3 w-full min-w-[320px] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-[#78839A]"><th className="py-1">{t("adminStats.band")}</th><th>{t("adminStats.bandLearners")}</th><th>{t("adminStats.bandHours")}</th></tr></thead>
              <tbody>{m.demand_supply.map((b) => (
                <tr key={b.band} className={`border-t border-[#EEF0F4] ${b.learners > 0 && b.tutor_hours_per_week === 0 ? "bg-[#FFF5F2]" : ""}`}><td className="py-1.5">{t(BAND_KEYS[b.band])}</td><td>{b.learners}</td><td>{b.tutor_hours_per_week}</td></tr>
              ))}</tbody>
            </table>
          </section>

          <section aria-labelledby="stats-tracks" className="grid min-w-0 gap-3 sm:grid-cols-2">
            <h2 id="stats-tracks" className="font-display text-lg font-extrabold text-primary sm:col-span-2">{t("adminStats.tracksHeading")}</h2>
            {m.tracks.map((tr) => (
              <div key={tr.track} className="min-w-0 rounded-[1.25rem] border border-[#E2E6EE] bg-white p-4">
                <p className="text-sm font-extrabold text-primary">{t(TRACK_KEYS[tr.track])}{tr.short_of_tutors ? ` · ${t("adminStats.short")}` : ""}</p>
                <p className="mt-1 text-xs text-[#53617A]">{t("adminStats.trackLearners", { count: tr.learners, hours: tr.learner_weekly_hours })}</p>
                <p className="mt-1 text-xs text-[#53617A]">{t("adminStats.trackTutors", { count: tr.tutors, hours: tr.tutor_weekly_hours })}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
