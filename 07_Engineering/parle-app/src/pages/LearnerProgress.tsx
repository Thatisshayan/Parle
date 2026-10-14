import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Flame,
  Headphones,
  LoaderCircle,
  Lock,
  MessageCircle,
  PenLine,
  Printer,
  RefreshCw,
  SkipForward,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { t, type TranslationKey } from "@/lib/i18n";
import { formatCalendarDate, formatLearnerLevel } from "@/lib/learner-display";
import { loadMyLearnerProgress, type LearnerCheckInRecord, type LearnerProgressData } from "@/lib/learner-plan";
import { buildLearnerProgressSummary } from "@/lib/learner-progress-summary";
import { loadMyLearnerAnalytics, type LearnerDetailedAnalytics } from "@/lib/learner-analytics";
import { getTrackWeights, scoredWritingLevelToScore, SKILL_KEYS, type CheckInComparison, type SkillKey, type SkillValues, type TaskType } from "@/lib/roadmap-engine";

const skillNameKeys: Record<SkillKey, TranslationKey> = {
  listening: "learner.skill.listening",
  reading: "learner.skill.reading",
  writing: "learner.skill.writing",
  speaking: "learner.skill.speaking",
};
const comparisonKeys: Record<CheckInComparison, TranslationKey> = {
  below: "learner.checkin.comparison.below",
  at: "learner.checkin.comparison.at",
  above: "learner.checkin.comparison.above",
};
const skillColors: Record<SkillKey, string> = {
  listening: "#1E3A8A",
  reading: "#287252",
  writing: "#C64D43",
  speaking: "#D6A433",
};
const skillIcons: Record<SkillKey, typeof Headphones> = {
  listening: Headphones,
  reading: BookOpenText,
  writing: PenLine,
  speaking: MessageCircle,
};
const taskTypeKeys: Record<TaskType, TranslationKey> = {
  ai_lesson: "learner.task.type.aiLesson",
  vocabulary_drill: "learner.task.type.vocabulary",
  listening_exercise: "learner.task.type.listening",
  speaking_practice: "learner.task.type.speaking",
  speaking_check: "learner.task.type.speakingCheck",
  writing: "learner.task.type.writing",
  tutor_lesson: "learner.task.type.tutor",
  weekly_checkin: "learner.task.type.checkin",
};

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

function comparisonLabel(value: unknown): string {
  return typeof value === "string" && value in comparisonKeys
    ? t(comparisonKeys[value as CheckInComparison])
    : t("learner.progress.noComparison");
}

function parseValues(value: unknown, fallback: SkillValues<number>): SkillValues<number> {
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(SKILL_KEYS.map((skill) => [
      skill,
      typeof parsed[skill] === "number" && Number.isFinite(parsed[skill]) ? parsed[skill] as number : fallback[skill],
    ])) as SkillValues<number>;
  } catch {
    return fallback;
  }
}

function parseDeltas(value: unknown): SkillValues<number> {
  const fallback: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  return parseValues(value, fallback);
}

function shortWeek(value: string): string {
  return formatDate(value, { month: "short", day: "numeric" });
}

function RecentStats({ data }: { data: LearnerProgressData }) {
  const thisWeek = data.completedMinutesByWeek[data.plan.weekStart] ?? 0;
  const readiness = data.readiness;
  const stats = [
    {
      icon: Target,
      label: t("learner.progress.readiness"),
      value: readiness === null ? "—" : `${readiness}%`,
      detail: readiness === null ? t("learner.progress.unavailableReadiness") : t("learner.progress.skillProgress"),
      color: "bg-[#EEF2FA] text-primary",
    },
    {
      icon: Flame,
      label: t("learner.progress.streak"),
      value: String(data.streak),
      detail: data.streak ? t("learner.progress.streakDays").replace("{count}", String(data.streak)) : t("learner.progress.streakNone"),
      color: "bg-[#FFF0EC] text-[#A13F36]",
    },
    {
      icon: Timer,
      label: t("learner.progress.completedMinutes"),
      value: t("learner.progress.weekMinutes").replace("{minutes}", String(thisWeek)),
      detail: t("learner.progress.weekBeginning").replace("{date}", shortWeek(data.plan.weekStart)),
      color: "bg-[#E7F4ED] text-[#287252]",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <article key={stat.label} className="min-w-0 rounded-[1.3rem] border border-primary/10 bg-white p-4 shadow-[0_14px_32px_-28px_rgba(30,58,138,0.45)] sm:p-5">
            <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${stat.color}`}><Icon aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</p><p className="mt-1 break-words font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{stat.value}</p></div></div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{stat.detail}</p>
          </article>
        );
      })}
    </div>
  );
}

function DetailedAnalyticsCard({
  status,
  analytics,
  onRetry,
}: {
  status: DetailedAnalyticsStatus;
  analytics: LearnerDetailedAnalytics | null;
  onRetry: () => void;
}) {
  const minutesBySkill = analytics?.minutesBySkill ?? null;
  const weeklyCheckInMinutes = analytics?.weeklyCheckInMinutes ?? null;
  const practiceMinuteRows: Array<{ key: string; label: string; minutes: number }> = [
    ...(minutesBySkill
      ? SKILL_KEYS.map((skill) => ({
        key: skill,
        label: t(skillNameKeys[skill]),
        minutes: minutesBySkill[skill],
      }))
      : []),
    ...(weeklyCheckInMinutes !== null && (minutesBySkill !== null || weeklyCheckInMinutes > 0)
      ? [{
        key: "weekly-check-ins",
        label: t("learner.progress.weeklyCheckIns"),
        minutes: weeklyCheckInMinutes,
      }]
      : []),
  ];
  const maximumMinutes = Math.max(1, ...practiceMinuteRows.map((row) => row.minutes));
  const formatMinutes = (minutes: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(minutes);

  return (
    <section className="min-w-0 rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.35)] sm:p-5" aria-labelledby="progress-analytics-title">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Activity aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 id="progress-analytics-title" className="font-display text-lg font-extrabold leading-6 text-primary">{t("learner.progress.analytics.title")}</h2>
          {status === "premium" && <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.progress.analytics.intro")}</p>}
        </div>
      </div>

      {status === "loading" && (
        <div className="mt-4 flex min-w-0 items-center gap-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-xs font-semibold leading-5 text-muted-foreground" role="status" aria-live="polite">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span>{t("learner.progress.analytics.loading")}</span>
        </div>
      )}

      {status === "free" && (
        <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-[#E7B8AE] bg-[#FFF8F6] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex min-w-0 items-start gap-2.5 text-sm font-semibold leading-6 text-[#75413D]">
            <Lock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#A13F36]" />
            <span className="min-w-0 break-words">{t("learner.progress.analytics.freeNotice")}</span>
          </p>
          <Link to="/learner/plan" className="inline-flex min-h-10 w-fit max-w-full shrink-0 items-center gap-2 rounded-full border border-[#8D342D]/20 bg-white px-4 py-2 text-xs font-extrabold text-[#8D342D] transition hover:bg-[#FFF0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="whitespace-nowrap">{t("learner.plan.seeYourPlan")}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-2xl border border-[#F0C5C0] bg-[#FFF8F6] p-4" role="alert">
          <p className="text-sm leading-6 text-[#75413D]">{t("learner.progress.analytics.error")}</p>
          <button type="button" onClick={onRetry} className="parle-button-primary mt-3 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learner.progress.retry")}</button>
        </div>
      )}

      {status === "premium" && analytics && (
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4" aria-labelledby="progress-analytics-minutes-title">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E7F4ED] text-[#287252]"><Timer aria-hidden="true" className="h-4 w-4" /></span>
                <h3 id="progress-analytics-minutes-title" className="min-w-0 break-words font-display text-sm font-extrabold leading-5 text-primary">{t("learner.progress.analytics.practiceTitle")}</h3>
              </div>
              <span className="w-fit shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-[#287252]">{t("learner.progress.analytics.last28Days")}</span>
            </div>
            {practiceMinuteRows.length ? (
              <ul className="mt-4 space-y-3">
                {practiceMinuteRows.map(({ key, label, minutes }) => {
                  const minuteValue = formatMinutes(minutes);
                  const minuteLabel = t("learner.progress.weekMinutes", { minutes: minuteValue });
                  const completedLabel = t("learner.progress.totalMinutes", { minutes: minuteValue });
                  return (
                    <li key={key} className="min-w-0">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 break-words text-xs font-bold leading-5 text-foreground">{label}</span>
                        <span className="shrink-0 text-xs font-extrabold text-primary">{minuteLabel}</span>
                      </div>
                      <div role="progressbar" aria-label={`${label}: ${completedLabel}`} aria-valuemin={0} aria-valuemax={maximumMinutes} aria-valuenow={minutes} aria-valuetext={completedLabel} className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF5]">
                        <div className="h-full rounded-full bg-[#287252] transition-[width] duration-500" style={{ width: minutes > 0 ? `${Math.max(4, minutes / maximumMinutes * 100)}%` : "0%" }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-white px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.analytics.noData")}</p>
            )}
          </section>

          <section className="min-w-0 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4" aria-labelledby="progress-analytics-mastery-title">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF5D9] text-[#765515]"><Target aria-hidden="true" className="h-4 w-4" /></span>
              <h3 id="progress-analytics-mastery-title" className="min-w-0 break-words font-display text-sm font-extrabold leading-5 text-primary">{t("learner.progress.analytics.masteryTitle")}</h3>
            </div>
            {analytics.lowestLanguagePoints.length ? (
              <ol className="mt-4 space-y-2.5">
                {analytics.lowestLanguagePoints.map((point, index) => {
                  const masteryLabel = t("learner.tutor.masteryScore", { score: formatMinutes(point.score) });
                  return (
                    <li key={`${point.key}-${index}`} className="min-w-0 rounded-xl border border-primary/5 bg-white p-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-xs font-bold leading-5 text-primary">{point.languagePoint}</p>
                        <span className="shrink-0 rounded-full bg-[#FFF5D9] px-2.5 py-1 text-[10px] font-extrabold text-[#765515]">{masteryLabel}</span>
                      </div>
                      <div role="progressbar" aria-label={`${point.languagePoint}: ${masteryLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={point.score} aria-valuetext={masteryLabel} className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F5EBCB]">
                        <div className="h-full rounded-full bg-[#D6A433] transition-[width] duration-500" style={{ width: `${point.score}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-4 rounded-xl bg-white px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.analytics.noData")}</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function GoalPaceSummary({ data }: { data: LearnerProgressData }) {
  const feasibility = data.plan.feasibility;
  const date = feasibility.targetDate ?? feasibility.projectedDate;
  const statusKey: Record<string, TranslationKey> = {
    on_track: "learner.feasibility.onTrack",
    tight: "learner.feasibility.tight",
    unlikely: "learner.feasibility.unlikely",
    projected: "learner.feasibility.projected",
  };
  const badgeClass = feasibility.status === "on_track"
    ? "bg-[#E7F4ED] text-[#287252]"
    : feasibility.status === "unlikely"
      ? "bg-[#FFF0EC] text-[#8D342D]"
      : "bg-[#EEF2FA] text-primary";
  const dateKey = feasibility.targetDate ? "learner.feasibility.targetDate" : "learner.feasibility.projectedDate";

  return (
    <section className="rounded-[1.35rem] border border-primary/10 bg-white p-4 shadow-[0_15px_36px_-30px_rgba(30,58,138,0.38)] sm:p-5" aria-labelledby="progress-goal-pace-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CalendarDays aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("learner.feasibility.eyebrow")}</p>
            <h2 id="progress-goal-pace-title" className="mt-1 font-display text-base font-extrabold text-primary">{t("learner.feasibility.title")}</h2>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] ${badgeClass}`}>{t(statusKey[feasibility.status] ?? "learner.feasibility.projected")}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <p className="min-w-0 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-foreground">
          {date ? t(dateKey).replace("{date}", formatCalendarDate(date)) : t("learner.feasibility.noProjection")}
        </p>
        {feasibility.status === "unlikely" && typeof feasibility.minutesPerDayNeeded === "number" && (
          <p className="min-w-0 rounded-xl bg-[#FFF5F2] px-3.5 py-3 text-sm leading-6 text-[#75413D]">
            {t("learner.feasibility.minutesOption").replace("{minutes}", String(feasibility.minutesPerDayNeeded))}
          </p>
        )}
        {feasibility.realisticDate ? (
          <p className="min-w-0 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-foreground">
            {t("learner.feasibility.realisticOption").replace("{date}", formatCalendarDate(feasibility.realisticDate))}
          </p>
        ) : feasibility.status === "unlikely" ? (
          <p className="min-w-0 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.feasibility.realisticUnavailable")}</p>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t("learner.feasibility.guidedHoursNote")}</p>
    </section>
  );
}

function SkillProgressCard({ data, skill }: { data: LearnerProgressData; skill: SkillKey }) {
  const Icon = skillIcons[skill];
  const isUnassessedSpeaking = skill === "speaking" && data.states.speaking === "not_assessed";
  const currentLabel = isUnassessedSpeaking
    ? `${t("learner.progress.levelNotYetAssessed")} · ${t("learner.checkin.estimateLabel")}`
    : t("learner.progress.currentEstimate").replace("{level}", formatLearnerLevel(data.plan.current[skill], data.plan.track));
  const startLabel = isUnassessedSpeaking
    ? `${t("learner.progress.levelNotYetAssessed")} · ${t("learner.checkin.estimateLabel")}`
    : t("learner.progress.startEstimate").replace("{level}", formatLearnerLevel(data.starts[skill], data.plan.track));
  const target = data.plan.targets[skill];
  const percent = data.skillProgress[skill];
  const colors = {
    listening: "bg-[#1E3A8A]",
    reading: "bg-[#287252]",
    writing: "bg-[#C64D43]",
    speaking: "bg-[#D6A433]",
  };

  return (
    <article className="min-w-0 rounded-[1.35rem] border border-primary/10 bg-white p-4 shadow-[0_15px_36px_-30px_rgba(30,58,138,0.38)] sm:p-5">
      <div className="flex items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${skill === "listening" ? "bg-[#EEF2FA]" : skill === "reading" ? "bg-[#E7F4ED]" : skill === "writing" ? "bg-[#FFF0EC]" : "bg-[#FFF5D9]"}`} style={{ color: skillColors[skill] }}><Icon aria-hidden="true" className="h-5 w-5" /></span><h3 className="min-w-0 font-display text-base font-extrabold text-primary">{t(skillNameKeys[skill])}</h3></div>
      <p className="mt-4 break-words text-sm font-extrabold leading-6 text-foreground">{currentLabel}</p>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{startLabel}</p>
      {target !== null && <p className="mt-2 break-words text-xs font-semibold leading-5 text-muted-foreground">{t("learner.progress.targetLevel").replace("{level}", formatLearnerLevel(target, data.plan.track))}</p>}
      {percent !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground"><span>{t("learner.progress.skillProgress")}</span><span>{percent}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF5]"><div className={`h-full rounded-full transition-all ${colors[skill]}`} style={{ width: `${percent}%` }} /></div>
        </div>
      )}
      {isUnassessedSpeaking && <p className="mt-3 rounded-lg bg-[#FFF5D9] px-3 py-2 text-[11px] leading-5 text-[#765515]">{t("learner.progress.currentNotAssessed")}</p>}
    </article>
  );
}

function TrendChart({ data, skills }: { data: LearnerProgressData; skills: SkillKey[] }) {
  const chartData = data.trend.map((point) => ({ date: point.date, ...point.values }));
  const hasTrend = chartData.length > 0 && skills.length > 0;

  return (
    <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.35)] sm:p-5" aria-labelledby="progress-trend-title">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Activity aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h2 id="progress-trend-title" className="font-display text-lg font-extrabold text-primary">{t("learner.progress.skillLevels")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.progress.skillLevelsNote")}</p></div></div>
      {hasTrend ? (
        <>
          <div className="mt-4 h-[250px] min-w-0" role="img" aria-label={t("learner.progress.trendChartLabel")}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -18, bottom: 2 }}>
                <CartesianGrid stroke="#E9EDF5" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => shortWeek(value)} tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#D8DEEA" }} minTickGap={22} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={32} tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={(label) => t("learner.progress.weekBeginning").replace("{date}", formatDate(String(label), { month: "short", day: "numeric" }))}
                  formatter={(value, name) => [
                    `${formatLearnerLevel(Number(value), data.plan.track)} · ${t("learner.checkin.estimateLabel")}`,
                    t(`learner.skill.${String(name)}` as TranslationKey),
                  ]}
                  contentStyle={{ borderRadius: 14, borderColor: "#E1E6F0", boxShadow: "0 12px 28px -18px rgba(30,58,138,0.35)", fontSize: 11 }}
                />
                {skills.map((skill) => <Line key={skill} type="monotone" dataKey={skill} name={skill} stroke={skillColors[skill]} strokeWidth={2.5} dot={{ r: 3, fill: skillColors[skill], strokeWidth: 0 }} activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {skills.map((skill) => (
              <span key={skill} className="inline-flex max-w-full items-center gap-2 text-[10px] font-bold leading-4 text-muted-foreground"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: skillColors[skill] }} /><span className="break-words">{t("learner.progress.estimateLegend").replace("{skill}", t(skillNameKeys[skill]))}</span></span>
            ))}
          </div>
          {data.trend.length === 1 && <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("learner.progress.trendEmpty")}</p>}
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.trendEmpty")}</p>
      )}
    </section>
  );
}

function MinutesByWeek({ data }: { data: LearnerProgressData }) {
  const weeks = Object.entries(data.completedMinutesByWeek).sort(([a], [b]) => b.localeCompare(a)).slice(0, 8).reverse();
  const maximum = Math.max(...weeks.map(([, minutes]) => minutes), 1);

  return (
    <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.35)] sm:p-5" aria-labelledby="progress-minutes-title">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E7F4ED] text-[#287252]"><Timer aria-hidden="true" className="h-5 w-5" /></span><h2 id="progress-minutes-title" className="font-display text-lg font-extrabold text-primary">{t("learner.progress.minutesByWeek")}</h2></div>
      {weeks.length ? (
        <ol className="mt-4 space-y-3">
          {weeks.map(([week, minutes]) => (
            <li key={week} className="grid grid-cols-[64px_minmax(0,1fr)_54px] items-center gap-2.5">
              <span className="text-[10px] font-bold leading-4 text-muted-foreground">{shortWeek(week)}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#E9EDF5]" role="img" aria-label={t("learner.progress.totalMinutes").replace("{minutes}", String(minutes))}><div className="h-full rounded-full bg-[#287252] transition-all" style={{ width: `${Math.max(4, minutes / maximum * 100)}%` }} /></div>
              <span className="text-right text-[10px] font-extrabold text-primary">{t("learner.progress.weekMinutes").replace("{minutes}", String(minutes))}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.noMinutes")}</p>
      )}
    </section>
  );
}

function RecentTaskActivity({ data }: { data: LearnerProgressData }) {
  const activities = data.taskActivity.slice(0, 8);

  return (
    <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.35)] sm:p-5" aria-labelledby="progress-recent-activity-title">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Activity aria-hidden="true" className="h-5 w-5" /></span>
        <h2 id="progress-recent-activity-title" className="font-display text-lg font-extrabold text-primary">{t("learner.progress.recentTaskActivity")}</h2>
      </div>
      {activities.length ? (
        <ol className="mt-4 space-y-2" aria-label={t("learner.progress.recentTaskActivity")}>
          {activities.map((activity) => {
            const isDone = activity.status === "done";
            const StatusIcon = isDone ? CheckCircle2 : SkipForward;
            return (
              <li key={activity.id} className="flex flex-col gap-3 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDone ? "bg-[#E7F4ED] text-[#287252]" : "bg-[#EEF2FA] text-muted-foreground"}`}><StatusIcon aria-hidden="true" className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold leading-5 text-foreground">{t(taskTypeKeys[activity.type])}</p>
                    {activity.dateLocal && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{formatDate(activity.dateLocal)}</p>}
                  </div>
                </div>
                <span className={`inline-flex min-h-7 w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] ${isDone ? "bg-[#E7F4ED] text-[#287252]" : "bg-[#EEF2FA] text-muted-foreground"}`}>
                  {t(isDone ? "learner.today.done" : "learner.today.skipped")}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.noTaskActivity")}</p>
      )}
    </section>
  );
}

function ObjectiveHistory({ record, kind, correct, total, comparison }: { record: LearnerCheckInRecord; kind: "listening" | "reading" | "grammar"; correct: number; total: number; comparison: string }) {
  if (total <= 0) return null;
  const label = kind === "grammar" ? t("learner.checkin.grammarTitle") : t(skillNameKeys[kind]);
  const comparisonValue = total === 3 && comparison
    ? comparisonLabel(comparison)
    : t("learner.progress.noComparison");
  const scoreCopy = kind === "grammar" ? t("learner.checkin.resultGrammar") : kind === "reading" ? t("learner.checkin.resultReading") : t("learner.checkin.resultListening");
  return (
    <div className="rounded-xl bg-[#F7F8FB] px-3 py-2.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-foreground">{scoreCopy.replace("{correct}", String(correct)).replace("{total}", String(total)).replace("{comparison}", comparisonValue)}</p>
      {kind === "grammar" && record.grammar_evidence_only && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{t("learner.progress.grammarOnly")}</p>}
    </div>
  );
}

function CheckInHistoryCard({ record }: { record: LearnerCheckInRecord }) {
  const before = parseValues(record.before_values_json, { listening: 0, reading: 0, writing: 0, speaking: 0 });
  const after = parseValues(record.after_values_json, before);
  const deltas = parseDeltas(record.deltas_json);
  const moved = SKILL_KEYS.filter((skill) => deltas[skill] !== 0);
  const date = record.week_start_local || record.date_local || "";
  const track = record.track === "immigration" || record.track === "citizenship" ? record.track : "general";
  const writingScore = scoredWritingLevelToScore(record.writing_scored_level);
  const writingLevel = writingScore === null
    ? record.writing_scored_level ?? ""
    : formatLearnerLevel(writingScore, track);

  return (
    <article className="rounded-[1.3rem] border border-primary/10 bg-white p-4 shadow-[0_14px_34px_-30px_rgba(30,58,138,0.35)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("learner.progress.checkInDate").replace("{date}", date ? formatDate(date) : t("learner.progress.noHistory"))}</p><p className="mt-1 text-sm font-bold leading-6 text-foreground">{record.what_changed_note || t("learner.checkin.change.steady")}</p></div>
        <span className="shrink-0 rounded-full bg-[#E7F4ED] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#287252]">{t("learner.today.done")}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ObjectiveHistory record={record} kind="listening" correct={record.listening_correct_count ?? 0} total={record.listening_total_count ?? 0} comparison={record.listening_comparison ?? ""} />
        {record.grammar_evidence_only ? (
          <ObjectiveHistory record={record} kind="grammar" correct={record.grammar_correct_count ?? 0} total={record.grammar_total_count ?? 0} comparison={record.grammar_comparison ?? ""} />
        ) : (
          <ObjectiveHistory record={record} kind="reading" correct={record.reading_correct_count ?? 0} total={record.reading_total_count ?? 0} comparison={record.reading_comparison ?? ""} />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {record.writing_status === "scored" && record.writing_scored_level && (
          <p className="rounded-xl bg-[#FAF9F5] px-3 py-2.5 text-xs font-semibold leading-5 text-foreground">{t("learner.progress.writingScored").replace("{level}", writingLevel)}</p>
        )}
        {record.writing_status === "not_scored" && <p className="rounded-xl bg-[#FFF8F6] px-3 py-2.5 text-xs font-bold leading-5 text-[#75413D]">{t("learner.progress.writingNotScored")}</p>}
        {record.speaking_self_rating && (
          <p className="rounded-xl bg-[#FFF5D9] px-3 py-2.5 text-xs font-semibold leading-5 text-[#765515]">{t("learner.progress.speakingRating").replace("{rating}", comparisonLabel(record.speaking_self_rating))}</p>
        )}
      </div>

      {moved.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-primary/10 pt-3">
          {moved.map((skill) => (
            <li key={skill} className="break-words text-xs leading-5 text-foreground">
              {t("learner.progress.estimateMoved")
                .replace("{skill}", t(skillNameKeys[skill]))
                .replace("{before}", formatLearnerLevel(before[skill], track))
                .replace("{after}", formatLearnerLevel(after[skill], track))}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

type DetailedAnalyticsStatus = "loading" | "free" | "premium" | "error";

function ProgressSummaryView({
  data,
  status,
  analytics,
  onBack,
  printOnly = false,
}: {
  data: LearnerProgressData;
  status: DetailedAnalyticsStatus;
  analytics: LearnerDetailedAnalytics | null;
  onBack: () => void;
  printOnly?: boolean;
}) {
  const report = buildLearnerProgressSummary(data, {
    producedAt: new Date(),
    access: status,
    minutesBySkill: analytics?.reportMinutesBySkill ?? null,
    weeklyCheckInMinutes: analytics?.reportWeeklyCheckInMinutes ?? null,
    viewerId: data.plan.userId,
  });
  const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const idPrefix = printOnly ? "print-" : "";
  const startDate = report.placementDate ? formatDate(report.placementDate) : t("learner.progressSummary.dateUnavailable");
  const endDate = report.rangeEndDate ? formatDate(report.rangeEndDate) : t("learner.progressSummary.dateUnavailable");
  const dateRange = t("learner.progressSummary.rangeValue")
    .replace("{start}", startDate)
    .replace("{end}", endDate);
  const hourLabel = t(report.totalHours === 1 ? "learner.progressSummary.hourValue" : "learner.progressSummary.hoursValue")
    .replace("{hours}", formatNumber(report.totalHours));
  const reportMinuteRows: Array<{ key: string; label: string; minutes: number }> = report.access === "premium"
    && report.placementDate
    && report.rangeEndDate
    && report.rangeEndDate >= report.placementDate
    ? [
      ...(report.minutesBySkill
        ? SKILL_KEYS.map((skill) => ({
          key: skill,
          label: t(skillNameKeys[skill]),
          minutes: report.minutesBySkill![skill],
        }))
        : []),
      ...(report.weeklyCheckInMinutes !== null
        && (report.minutesBySkill !== null || report.weeklyCheckInMinutes > 0)
        ? [{
          key: "weekly-check-ins",
          label: t("learner.progress.weeklyCheckIns"),
          minutes: report.weeklyCheckInMinutes,
        }]
        : []),
    ]
    : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="parle-progress-summary mx-auto max-w-5xl rounded-[1.6rem] border border-primary/10 bg-white p-4 shadow-[0_20px_55px_-42px_rgba(30,58,138,0.48)] sm:p-7"
      aria-labelledby={`${idPrefix}learner-printable-progress-title`}
    >
      <header className="flex flex-col gap-4 border-b border-primary/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("brand.name")}</p>
          <h2 id={`${idPrefix}learner-printable-progress-title`} className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] text-primary sm:text-3xl">{t("learner.progressSummary.title")}</h2>
        </div>
        {!printOnly && (
          <div className="parle-progress-summary-actions flex flex-col gap-2 sm:w-auto sm:flex-row">
            <button type="button" onClick={() => window.print()} className="parle-button-primary min-h-11 justify-center px-4 py-2.5 text-xs sm:px-5">
              <Printer aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{t("learner.progressSummary.print")}</span>
            </button>
            <button type="button" onClick={onBack} className="parle-button-secondary min-h-11 justify-center px-4 py-2.5 text-xs sm:px-5">
              <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{t("learner.progressSummary.back")}</span>
            </button>
          </div>
        )}
      </header>

      <dl className="parle-progress-summary-facts mt-5 grid gap-2.5 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-[#F7F8FB] p-3.5">
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.progressSummary.learner")}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{report.learnerName}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-[#F7F8FB] p-3.5">
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.progressSummary.goal")}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{report.goalLabel}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-[#F7F8FB] p-3.5">
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.progressSummary.track")}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{report.trackLabel}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-[#F7F8FB] p-3.5">
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.progressSummary.dateRange")}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{dateRange}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-[#F7F8FB] p-3.5 sm:col-span-2">
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.progressSummary.producedOn")}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{formatDate(report.producedOn)}</dd>
        </div>
      </dl>

      <div className="parle-progress-summary-totals mt-4 grid gap-2.5 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#D3E8DA] bg-[#F2FAF5] p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#287252]">{t("learner.progressSummary.totalMinutes")}</p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-[#1E5A3E]">{t("learner.progressSummary.minutesValue").replace("{minutes}", formatNumber(report.totalMinutes))}</p>
        </article>
        <article className="rounded-2xl border border-primary/10 bg-[#F7F8FB] p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.progressSummary.totalHours")}</p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{hourLabel}</p>
        </article>
      </div>

      <section className="parle-progress-summary-section mt-5" aria-labelledby={`${idPrefix}progress-summary-estimates-title`}>
        <h3 id={`${idPrefix}progress-summary-estimates-title`} className="font-display text-base font-extrabold text-primary">{t("learner.progressSummary.estimatesTitle")}</h3>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          {report.skills.map((skill) => (
            <article key={skill.skill} className="parle-progress-summary-skill min-w-0 rounded-xl border border-primary/10 bg-white p-3.5">
              <h4 className="text-sm font-extrabold text-primary">{skill.label}</h4>
              <dl className="mt-2 grid gap-2">
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("learner.progressSummary.startingEstimate")}</dt>
                  <dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-foreground">{skill.startingEstimate}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("learner.progressSummary.currentEstimate")}</dt>
                  <dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-foreground">{skill.currentEstimate}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="parle-progress-summary-section mt-5" aria-labelledby={`${idPrefix}progress-summary-minutes-title`}>
        <h3 id={`${idPrefix}progress-summary-minutes-title`} className="font-display text-base font-extrabold text-primary">{t("learner.progressSummary.minutesTitle")}</h3>
        {report.access === "free" ? (
          <p className="mt-2 rounded-xl border border-[#E7B8AE] bg-[#FFF8F6] px-3.5 py-3 text-sm font-semibold leading-6 text-[#75413D]">{t("learner.progressSummary.freeSkillNotice")}</p>
        ) : report.access === "premium" && !report.placementDate ? (
          <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progressSummary.placementDateRequired")}</p>
        ) : reportMinuteRows.length ? (
          <ul className="parle-progress-summary-minutes mt-2 grid gap-2 sm:grid-cols-2">
            {reportMinuteRows.map((row) => (
              <li key={row.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-primary/10 bg-[#FAF9F5] px-3.5 py-2.5 text-xs">
                <span className="min-w-0 break-words font-bold text-foreground">{row.label}</span>
                <span className="shrink-0 font-extrabold text-primary">{t("learner.progressSummary.minutesValue").replace("{minutes}", formatNumber(row.minutes))}</span>
              </li>
            ))}
          </ul>
        ) : report.access === "premium" ? (
          <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progressSummary.noSkillMinutes")}</p>
        ) : report.access === "loading" ? (
          <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progressSummary.accessChecking")}</p>
        ) : (
          <p className="mt-2 rounded-xl bg-[#FFF8F6] px-3.5 py-3 text-sm leading-6 text-[#75413D]">{t("learner.progressSummary.minutesUnavailable")}</p>
        )}
      </section>

      <section className="parle-progress-summary-section mt-5" aria-labelledby={`${idPrefix}progress-summary-checkins-title`}>
        <h3 id={`${idPrefix}progress-summary-checkins-title`} className="font-display text-base font-extrabold text-primary">{t("learner.progressSummary.checkInDates")}</h3>
        {report.checkInDates.length ? (
          <ol className="parle-progress-checkin-list mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {report.checkInDates.map((date, index) => (
              <li key={`${date ?? "missing"}-${index}`} className="parle-progress-checkin-item rounded-lg bg-[#F7F8FB] px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">
                {date ? formatDate(date) : t("learner.progressSummary.dateUnavailable")}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-sm leading-6 text-muted-foreground">{t("learner.progressSummary.noCheckIns")}</p>
        )}
      </section>

      <p className="parle-progress-summary-record-disclaimer mt-5 break-words text-xs font-semibold leading-6 text-muted-foreground">{report.practiceRecordDisclaimer}</p>
      <p className="parle-progress-summary-disclaimer mt-3 border-t border-primary/10 pt-3 text-xs font-semibold leading-5 text-muted-foreground">{report.estimateDisclaimer}</p>
    </motion.section>
  );
}

export default function LearnerProgress() {
  const [data, setData] = useState<LearnerProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState<DetailedAnalyticsStatus>("loading");
  const [analytics, setAnalytics] = useState<LearnerDetailedAnalytics | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setAnalyticsStatus("loading");
    setAnalytics(null);
    try {
      const progressData = await loadMyLearnerProgress();
      setData(progressData);

      try {
        const reportRange = progressData.earliestPlacementDate && progressData.plan.today
          ? {
            startLocalDate: progressData.earliestPlacementDate,
            endLocalDate: progressData.plan.today,
            timeZone: progressData.plan.timeZone,
          }
          : undefined;
        const analyticsResult = await loadMyLearnerAnalytics(new Date(), reportRange);
        if (analyticsResult.planTier === "free") {
          setAnalyticsStatus("free");
        } else {
          setAnalytics(analyticsResult.analytics);
          setAnalyticsStatus("premium");
        }
      } catch (error) {
        console.error("Parle detailed learner analytics could not be loaded", error);
        setAnalyticsStatus("error");
      }
    } catch (error) {
      console.error("Parle learner progress could not be loaded", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const printClass = "parle-printing-progress-summary";
    if (summaryOpen) document.body.classList.add(printClass);
    else document.body.classList.remove(printClass);
    return () => document.body.classList.remove(printClass);
  }, [summaryOpen]);

  const weightedSkills = useMemo(() => data
    ? SKILL_KEYS.filter((skill) => getTrackWeights(data.plan.track, data.plan.targets)[skill] > 0)
    : [], [data]);
  const chartSkills = useMemo(() => data
    ? weightedSkills.filter((skill) => !(skill === "speaking" && data.states.speaking === "not_assessed"))
    : [], [data, weightedSkills]);

  if (loading) {
    return <div className="flex min-h-[340px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learner.progress.loading")}</p></div></div>;
  }
  if (loadError || !data) {
    return <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><TrendingUp aria-hidden="true" className="h-6 w-6" /></span><h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.progress.errorTitle")}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("learner.progress.errorBody")}</p><button type="button" onClick={() => void load()} className="parle-button-primary mt-6 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learner.progress.retry")}</button></section>;
  }

  if (summaryOpen) {
    return (
      <>
        <ProgressSummaryView data={data} status={analyticsStatus} analytics={analytics} onBack={() => setSummaryOpen(false)} />
        {createPortal(
          <div className="parle-progress-summary-print-portal">
            <ProgressSummaryView data={data} status={analyticsStatus} analytics={analytics} onBack={() => undefined} printOnly />
          </div>,
          document.body,
        )}
      </>
    );
  }

  const weekHistory = data.history;
  const isUnverified = data.plan.sourceLabel.toLocaleLowerCase().includes("unverified");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }} className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.65rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.75)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-14 right-24 h-32 w-32 rounded-full bg-[#F97362]/15 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.progress.eyebrow")}</p><h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("role.progressTitle")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{t("learner.progress.intro")}</p></div>
          <span className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-bold text-white"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#FFC0B4]" />{isUnverified ? data.plan.sourceLabel : t("learner.checkin.estimateLabel")}</span>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={() => setSummaryOpen(true)} className="parle-button-secondary min-h-11 justify-center px-4 py-2.5 text-xs sm:px-5">
          <Printer aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t("learner.progressSummary.open")}</span>
        </button>
      </div>

      <RecentStats data={data} />
      <DetailedAnalyticsCard status={analyticsStatus} analytics={analytics} onRetry={() => void load()} />
      <GoalPaceSummary data={data} />

      <section aria-labelledby="progress-skills-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A13F36]">{t("learner.progress.eyebrow")}</p><h2 id="progress-skills-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.progress.skillProgress")}</h2></div><span className="text-[10px] font-bold leading-4 text-muted-foreground">{t("learner.checkin.estimateLabel")}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{weightedSkills.map((skill) => <SkillProgressCard key={skill} data={data} skill={skill} />)}</div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <TrendChart data={data} skills={chartSkills} />
        <MinutesByWeek data={data} />
      </div>

      <RecentTaskActivity data={data} />

      {data.states.speaking === "not_assessed" && (
        <p className="flex items-start gap-2 rounded-2xl border border-[#F2D7A3] bg-[#FFF9E8] px-4 py-3.5 text-xs leading-5 text-[#765515]"><MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("learner.progress.currentNotAssessed")}</p>
      )}

      <section className="space-y-3" aria-labelledby="checkin-history-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A13F36]">{t("learner.progress.eyebrow")}</p><h2 id="checkin-history-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.progress.checkInHistory")}</h2></div><span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-[10px] font-extrabold text-primary">{weekHistory.length}</span></div>
        {weekHistory.length ? <div className="space-y-3">{weekHistory.map((record) => <CheckInHistoryCard key={record.id ?? `${record.week_start_local}-${record.date_local}`} record={record} />)}</div> : <div className="rounded-[1.35rem] border border-primary/10 bg-white p-5 text-sm leading-6 text-muted-foreground">{t("learner.progress.noCheckIns")}</div>}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/learner" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.checkin.backToToday")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        <Link to="/learner/roadmap" className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary/15 bg-white px-5 py-3 text-sm font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("role.roadmap")}</Link>
      </div>
    </motion.div>
  );
}
