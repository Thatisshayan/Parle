import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  Circle,
  Clock3,
  Headphones,
  LoaderCircle,
  MessageCircle,
  PenLine,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import { formatCalendarDate, formatCurrentEstimate, formatLearnerLevel } from "@/lib/learner-display";
import { loadMyLearnerRoadmap, type LearnerRoadmapData } from "@/lib/learner-plan-remote";
import { calculateSkillProgressPercentage, getTrackWeights, SKILL_KEYS, type FeasibilityStatus, type SkillKey } from "@/lib/roadmap-engine";

const skillNameKeys: Record<SkillKey, TranslationKey> = {
  listening: "learner.skill.listening",
  reading: "learner.skill.reading",
  writing: "learner.skill.writing",
  speaking: "learner.skill.speaking",
};
const skillIcons: Record<SkillKey, typeof Headphones> = {
  listening: Headphones,
  reading: BookOpenText,
  writing: PenLine,
  speaking: MessageCircle,
};
const skillColors: Record<SkillKey, { ink: string; soft: string; line: string }> = {
  listening: { ink: "text-[#1E3A8A]", soft: "bg-[#EEF2FA]", line: "bg-[#1E3A8A]" },
  reading: { ink: "text-[#287252]", soft: "bg-[#E7F4ED]", line: "bg-[#287252]" },
  writing: { ink: "text-[#A13F36]", soft: "bg-[#FFF0EC]", line: "bg-[#C64D43]" },
  speaking: { ink: "text-[#825A11]", soft: "bg-[#FFF5D9]", line: "bg-[#D6A433]" },
};
const goalKeys: Record<string, TranslationKey> = {
  immigration: "onboarding.goal.immigration",
  citizenship: "onboarding.goal.citizenship",
  general: "onboarding.goal.general",
};
const feasibilityKeys: Record<FeasibilityStatus, TranslationKey> = {
  on_track: "learner.feasibility.onTrack",
  tight: "learner.feasibility.tight",
  unlikely: "learner.feasibility.unlikely",
  projected: "learner.feasibility.projected",
};

function formatHours(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string): string {
  return formatCalendarDate(value, { month: "long", day: "numeric" });
}

function EstimateLabel({ score, track }: { score: number; track: LearnerRoadmapData["plan"]["track"] }) {
  return <span>{formatCurrentEstimate(score, track)}</span>;
}

function FeasibilityCard({ data }: { data: LearnerRoadmapData }) {
  const { plan } = data;
  const feasibility = plan.feasibility;
  const ratio = feasibility.ratio === null ? null : Math.max(0, Math.min(100, feasibility.ratio * 100));
  const badgeStyle = feasibility.status === "on_track"
    ? "bg-[#E7F4ED] text-[#287252]"
    : feasibility.status === "unlikely"
      ? "bg-[#FFF0EC] text-[#8D342D]"
      : "bg-[#EEF2FA] text-primary";
  const projectedOrTarget = feasibility.targetDate ?? feasibility.projectedDate;

  return (
    <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.4)] sm:p-5" aria-labelledby="roadmap-feasibility-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Target aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("learner.feasibility.eyebrow")}</p><h2 id="roadmap-feasibility-title" className="mt-1 font-display text-base font-extrabold text-primary">{t("learner.feasibility.title")}</h2></div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.09em] ${badgeStyle}`}>{t(feasibilityKeys[feasibility.status])}</span>
      </div>
      {projectedOrTarget ? (
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-foreground"><CalendarDays aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#A13F36]" />{t(feasibility.targetDate ? "learner.roadmap.targetDate" : "learner.roadmap.projectedDate").replace("{date}", formatDate(projectedOrTarget))}</p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("learner.feasibility.noProjection")}</p>
      )}
      {ratio !== null && (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
            <span>{t("learner.feasibility.availableHours").replace("{hours}", formatHours(feasibility.availableHours))}</span>
            <span>{t("learner.feasibility.requiredHours").replace("{hours}", formatHours(feasibility.requiredHours))}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="img" aria-label={t("learner.feasibility.ratioLabel").replace("{percent}", String(Math.round(ratio)))}>
            <div className={`h-full rounded-full transition-all ${feasibility.status === "unlikely" ? "bg-[#F97362]" : "bg-primary"}`} style={{ width: `${ratio}%` }} />
          </div>
        </div>
      )}
      {feasibility.status === "unlikely" && (
        <div className="mt-4 space-y-2 rounded-xl border border-[#F2D7D0] bg-[#FFF8F6] p-3.5 text-xs leading-5 text-[#75413D]">
          <p className="flex items-start gap-2"><Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{typeof feasibility.minutesPerDayNeeded === "number" ? t("learner.feasibility.minutesOption").replace("{minutes}", String(feasibility.minutesPerDayNeeded)) : t("learner.feasibility.minutesUnavailable")}</p>
          <p className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{feasibility.realisticDate ? t("learner.feasibility.realisticOption").replace("{date}", formatDate(feasibility.realisticDate)) : t("learner.feasibility.realisticUnavailable")}</p>
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><TrendingUp aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("learner.feasibility.guidedHoursNote")}</p>
    </section>
  );
}

function SkillTimeline({ data, skill }: { data: LearnerRoadmapData; skill: SkillKey }) {
  const { plan } = data;
  const color = skillColors[skill];
  const Icon = skillIcons[skill];
  const target = plan.targets[skill];
  const milestones = data.milestones.filter((milestone) => milestone.skill === skill);
  const progress = typeof target === "number" ? calculateSkillProgressPercentage(plan.current[skill], plan.startValues[skill], target) : null;

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-primary/10 bg-white shadow-[0_18px_42px_-34px_rgba(30,58,138,0.34)]" aria-labelledby={`roadmap-${skill}-title`}>
      <div className="border-b border-primary/10 bg-[#FBFAF7] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${color.soft} ${color.ink}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={`roadmap-${skill}-title`} className="font-display text-lg font-extrabold tracking-[-0.03em] text-primary">{t(skillNameKeys[skill])}</h2>
            <p className="mt-1 break-words text-xs leading-5 text-foreground">{t("learner.roadmap.currentEstimate").replace("{level}", formatCurrentEstimate(plan.current[skill], plan.track))}</p>
            {typeof target === "number" && <p className="mt-1 break-words text-xs font-semibold text-muted-foreground">{t("learner.roadmap.target").replace("{level}", formatLearnerLevel(target, plan.track))}</p>}
          </div>
        </div>
        {progress !== null && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground"><span>{t("learner.roadmap.skillProgress").replace("{percent}", String(progress))}</span><span>{progress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF5]"><div className={`h-full rounded-full ${color.line} transition-all`} style={{ width: `${progress}%` }} /></div>
          </div>
        )}
      </div>

      {milestones.length > 0 ? (
        <ol className="space-y-0 px-4 py-4 sm:px-5 sm:py-5" aria-label={t("learner.roadmap.timelineLabel").replace("{skill}", t(skillNameKeys[skill]))}>
          {milestones.map((milestone, index) => (
            <li key={milestone.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < milestones.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-primary/15" />}
              <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${milestone.status === "reached" ? "border-[#B9D9CB] bg-[#E7F4ED] text-[#287252]" : `border-primary/15 bg-white ${color.ink}`}`}>
                {milestone.status === "reached" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Circle aria-hidden="true" className="h-3.5 w-3.5 fill-current" />}
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-primary/10 bg-white p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                  <p className="min-w-0 break-words text-xs font-extrabold leading-5 text-primary">{t("learner.roadmap.milestone").replace("{from}", formatLearnerLevel(milestone.fromValue, plan.track)).replace("{to}", formatLearnerLevel(milestone.toValue, plan.track))}</p>
                  {milestone.expectedDate ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold leading-4 text-muted-foreground"><CalendarDays aria-hidden="true" className="h-3 w-3 shrink-0" />{formatDate(milestone.expectedDate)}</span> : <span className="text-[10px] leading-4 text-muted-foreground">{t("learner.roadmap.noMilestoneDate")}</span>}
                </div>
                <p className="mt-2 text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.roadmap.canDo")}</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{milestone.canDoText}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-5 text-sm leading-6 text-muted-foreground sm:px-5">{t("learner.roadmap.noMilestonesBody")}</p>
      )}
    </section>
  );
}

export default function LearnerRoadmap() {
  const [data, setData] = useState<LearnerRoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setData(await loadMyLearnerRoadmap());
    } catch (error) {
      console.error("Parle learner roadmap could not be loaded", error instanceof Error ? error.name : "unknown");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const weightedSkills = useMemo(() => data
    ? SKILL_KEYS.filter((skill) => getTrackWeights(data.plan.track, data.plan.targets)[skill] > 0)
    : [], [data]);

  if (loading) {
    return <div className="flex min-h-[340px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learner.roadmap.loading")}</p></div></div>;
  }
  if (loadError || !data) {
    return <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Target aria-hidden="true" className="h-6 w-6" /></span><h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.roadmap.errorTitle")}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("learner.roadmap.errorBody")}</p><button type="button" onClick={() => void load()} className="parle-button-primary mt-6 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learner.roadmap.retry")}</button></section>;
  }

  const goalLabel = t(goalKeys[data.plan.track] ?? "onboarding.goal.general");
  const deadline = data.plan.feasibility.targetDate;
  const targetOrProjectedDate = deadline ?? data.plan.feasibility.projectedDate;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }} className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.65rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.75)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-14 right-24 h-32 w-32 rounded-full bg-[#F97362]/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><Target aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.roadmap.eyebrow")}</p>
            <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("role.learnerRoadmapTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{t("learner.roadmap.intro")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">{goalLabel}</span>
              {data.plan.sourceLabel && <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">{data.plan.sourceLabel}</span>}
            </div>
          </div>
          <div className="max-w-full shrink-0 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 sm:max-w-[210px]">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/70"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{deadline ? t("learner.roadmap.targetDate").split(":")[0] : t("learner.roadmap.noTargetDate")}</p>
            {targetOrProjectedDate && <p className="mt-1 break-words font-display text-sm font-extrabold text-white">{formatDate(targetOrProjectedDate)}</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.35)] sm:p-5" aria-labelledby="roadmap-start-title">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A13F36]">{t("learner.plan.sourceLabel")}</p>
          <h2 id="roadmap-start-title" className="mt-2 font-display text-lg font-extrabold tracking-[-0.03em] text-primary">{t("learner.plan.startingPoint")}</h2>
          <div className="mt-4 space-y-2">
            {weightedSkills.map((skill) => (
              <p key={skill} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-primary/10 pt-2.5 text-xs first:border-0 first:pt-0"><span className="font-bold text-foreground">{t(skillNameKeys[skill])}</span><span className="break-words text-right text-muted-foreground"><EstimateLabel score={data.plan.current[skill]} track={data.plan.track} /></span></p>
            ))}
          </div>
        </section>
        <FeasibilityCard data={data} />
      </div>

      <section aria-labelledby="milestone-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A13F36]">{t("learner.roadmap.eyebrow")}</p><h2 id="milestone-heading" className="mt-1 font-display text-xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.roadmap.intro").split(".")[0]}</h2></div>
          <span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary">{weightedSkills.length} {t("learner.roadmap.milestonesFor").split(" ").slice(0, 1).join("")}</span>
        </div>
        {weightedSkills.length === 0 || data.milestones.length === 0 ? (
          <div className="rounded-[1.45rem] border border-primary/10 bg-white p-5 sm:p-6"><h3 className="font-display text-base font-extrabold text-primary">{t("learner.roadmap.noMilestonesTitle")}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("learner.roadmap.noMilestonesBody")}</p></div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">{weightedSkills.map((skill) => <SkillTimeline key={skill} data={data} skill={skill} />)}</div>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/learner" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.checkin.backToToday")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        <Link to="/learner/progress" className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary/15 bg-white px-5 py-3 text-sm font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("role.progress")}</Link>
      </div>
    </motion.div>
  );
}
