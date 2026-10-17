import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenText,
  CalendarCheck2,
  Check,
  CircleHelp,
  Headphones,
  LoaderCircle,
  MessageCircle,
  PenLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import { ListeningPlayer } from "@/components/parle/ListeningPlayer";
import { SKIPPED_AUDIO } from "@/lib/listening-audio";
import { checkInResultCopyKey, formatCurrentEstimate, formatLearnerLevel, shuffleQuestionOptions, type CheckInEvidenceKind } from "@/lib/learner-display";
import {
  prepareMyWeeklyCheckIn,
  submitMyWeeklyCheckIn,
  type CheckInQuestionView,
  type LearnerCheckInRecord,
  type LearnerCheckInResult,
  type LearnerCheckInSession,
} from "@/lib/learner-plan-remote";
import { SKILL_KEYS, scoredWritingLevelToScore, type CheckInComparison, type SkillKey, type SkillValues } from "@/lib/roadmap-engine";

const comparisonKeys: Record<CheckInComparison, TranslationKey> = {
  below: "learner.checkin.comparison.below",
  at: "learner.checkin.comparison.at",
  above: "learner.checkin.comparison.above",
};
const skillNameKeys: Record<SkillKey, TranslationKey> = {
  listening: "learner.skill.listening",
  reading: "learner.skill.reading",
  writing: "learner.skill.writing",
  speaking: "learner.skill.speaking",
};

function comparisonLabel(value: unknown): string {
  return typeof value === "string" && value in comparisonKeys
    ? t(comparisonKeys[value as CheckInComparison])
    : t("learner.progress.noComparison");
}

function localDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function parseSavedValues(value: unknown, fallback: SkillValues<number>): SkillValues<number> {
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

function parseSavedDeltas(value: unknown): SkillValues<number> {
  const fallback: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(SKILL_KEYS.map((skill) => [
      skill,
      typeof parsed[skill] === "number" && Number.isFinite(parsed[skill]) ? parsed[skill] as number : 0,
    ])) as SkillValues<number>;
  } catch {
    return fallback;
  }
}

function resultFromSavedRecord(record: LearnerCheckInRecord, session: LearnerCheckInSession): LearnerCheckInResult {
  const before = parseSavedValues(record.before_values_json, session.plan.current);
  const values = parseSavedValues(record.after_values_json, before);
  const deltas = parseSavedDeltas(record.deltas_json);
  return {
    record,
    note: typeof record.what_changed_note === "string" && record.what_changed_note.trim()
      ? record.what_changed_note
      : t("learner.checkin.change.steady"),
    values,
    deltas,
    writingScored: record.writing_status === "scored",
    alreadySubmitted: true,
    nextPlan: session.plan,
  };
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function ObjectiveSet({
  titleKey,
  questions,
  answers,
  onAnswer,
  questionOffset,
  kind,
}: {
  titleKey: TranslationKey;
  questions: CheckInQuestionView[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, optionId: string) => void;
  questionOffset: number;
  kind: "listening" | "reading" | "grammar";
}) {
  const Icon = kind === "listening" ? Headphones : kind === "reading" ? BookOpenText : CircleHelp;

  return (
    <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.45)] sm:p-6" aria-labelledby={`${kind}-section-title`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Icon aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${kind}-section-title`} className="font-display text-lg font-extrabold tracking-[-0.03em] text-primary">{t(titleKey)}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {questions.length === 0
              ? t("learner.checkin.noQuestionsAvailable")
              : t("learner.checkin.questionCount").replace("{count}", String(questions.length))}
          </p>
        </div>
      </div>

      {kind === "listening" && questions.length > 0 && (
        <p className="mt-4 rounded-xl border border-[#F2D7D0] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D]">
          {t("placement.listening.audioNotice")}
        </p>
      )}
      {questions.length > 0 && questions.length < 3 && (
        <p className="mt-3 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          {t("learner.checkin.partialSet").replace("{count}", String(questions.length))}
        </p>
      )}
      {questions.length > 0 && (
        <div className="mt-4 space-y-4">
          {questions.map((question, index) => (
            <fieldset key={question.id} className="min-w-0 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-3.5 sm:p-4">
              {kind === "listening" && (
                <div className="mb-3 rounded-xl bg-white px-3.5 py-3">
                  {/* Plan 13: played, never read; the transcript stays on the server */}
                  <ListeningPlayer audioUrl={question.audioUrl} itemId={question.id} onGiveUp={() => onAnswer(question.id, SKIPPED_AUDIO)} />
                  {answers[question.id] === SKIPPED_AUDIO && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{t("voice.listening.skipped")}</p>}
                </div>
              )}
              {kind !== "listening" && question.text.trim() && (
                <div className="mb-3 rounded-xl bg-white px-3.5 py-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("placement.question.passageLabel")}
                  </p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-foreground">{question.text}</p>
                </div>
              )}
              <legend className="w-full text-sm font-bold leading-6 text-foreground">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">
                  {t("learner.checkin.questionLabel").replace("{number}", String(questionOffset + index + 1))}
                </span>
                {question.prompt}
              </legend>
              <div className="mt-3 space-y-2">
                {question.options.map((option, optionIndex) => {
                  const selected = answers[question.id] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm leading-5 transition focus-within:ring-2 focus-within:ring-accent ${selected ? "border-primary bg-[#EEF2FA]" : "border-primary/10 bg-white hover:border-primary/25"}`}
                    >
                      <input
                        type="radio"
                        name={`answer-${question.id}`}
                        value={option.id}
                        checked={selected}
                        onChange={() => onAnswer(question.id, option.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#1E3A8A]"
                      />
                      <span className="min-w-0 break-words text-foreground"><span className="mr-2 font-extrabold text-primary">{String.fromCharCode(65 + optionIndex)}.</span>{option.text}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultEvidence({ session, result }: { session: LearnerCheckInSession; result: LearnerCheckInResult }) {
  const record = result.record;
  const evidence: Array<{ kind: CheckInEvidenceKind; label: string; count: number; total: number; comparison: string }> = [
    {
      kind: "listening",
      label: t("learner.skill.listening"),
      count: record.listening_correct_count ?? 0,
      total: record.listening_total_count ?? 0,
      comparison: record.listening_comparison ?? "",
    },
    ...(session.readingWeighted
      ? [{ kind: "reading" as const, label: t("learner.skill.reading"), count: record.reading_correct_count ?? 0, total: record.reading_total_count ?? 0, comparison: record.reading_comparison ?? "" }]
      : [{ kind: "grammar" as const, label: t("learner.checkin.grammarTitle"), count: record.grammar_correct_count ?? 0, total: record.grammar_total_count ?? 0, comparison: record.grammar_comparison ?? "" }]),
  ].filter((row) => row.total > 0);
  const movedSkills = SKILL_KEYS.filter((skill) => result.deltas[skill] !== 0);
  const writingScore = scoredWritingLevelToScore(record.writing_scored_level);
  const writingLevel = writingScore === null
    ? record.writing_scored_level ?? ""
    : formatLearnerLevel(writingScore, session.plan.track);

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {evidence.map((row) => (
          <div key={row.label} className="rounded-xl border border-primary/10 bg-[#F7F8FB] p-3.5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-muted-foreground">{row.label}</p>
            <p className="mt-1 text-sm font-bold leading-5 text-foreground">
              {t(checkInResultCopyKey(row.kind)).replace("{correct}", String(row.count)).replace("{total}", String(row.total)).replace("{comparison}", comparisonLabel(row.comparison))}
            </p>
            {row.kind === "grammar" && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("learner.checkin.grammarEvidenceOnly")}</p>
            )}
          </div>
        ))}
      </div>

      {record.writing_status === "scored" && record.writing_scored_level && (
        <p className="rounded-xl border border-primary/10 bg-white px-3.5 py-3 text-sm leading-6 text-foreground">
          {t("learner.checkin.resultWriting").replace("{level}", writingLevel)}
        </p>
      )}
      {record.writing_status === "not_scored" && (
        <p role="status" className="rounded-xl border border-[#F2D7D0] bg-[#FFF8F6] px-3.5 py-3 text-sm font-bold text-[#75413D]">{t("learner.checkin.notScored")}</p>
      )}
      {record.speaking_self_rating && (
        <p className="rounded-xl border border-primary/10 bg-white px-3.5 py-3 text-sm leading-6 text-foreground">
          {t("learner.checkin.resultSpeaking").replace("{rating}", comparisonLabel(record.speaking_self_rating))}
        </p>
      )}
      {movedSkills.length > 0 ? (
        <ul className="space-y-2" aria-label={t("learner.checkin.whatChanged")}>
          {movedSkills.map((skill) => (
            <li key={skill} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-[#E7F4ED] px-3.5 py-3 text-xs leading-5 text-[#287252]">
              <span className="font-bold">{t(skillNameKeys[skill])}</span>
              <span>{formatCurrentEstimate(result.values[skill], session.plan.track)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t("learner.checkin.noEstimateMoved")}</p>
      )}
    </div>
  );
}

function WeeklyCheckInResult({ session, result }: { session: LearnerCheckInSession; result: LearnerCheckInResult }) {
  const weightedSkills = SKILL_KEYS.filter((skill) => session.plan.targets[skill] !== null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-[1.6rem] border border-[#B9D9CB] bg-white shadow-[0_20px_54px_-38px_rgba(40,114,82,0.35)]"
      aria-labelledby="checkin-result-title"
    >
      <div className="bg-[#E7F4ED] px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#287252]"><Check aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#287252]">{t("learner.checkin.eyebrow")}</p>
            <h2 id="checkin-result-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary sm:text-2xl">{t("learner.checkin.successTitle")}</h2>
            {result.alreadySubmitted && <p className="mt-2 text-xs font-bold leading-5 text-[#287252]">{t("learner.checkin.alreadySubmitted")}</p>}
            <p className="mt-2 text-sm leading-6 text-foreground">{t("learner.checkin.resultIntro")}</p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-7">
        <section className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4" aria-labelledby="what-changed-title">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A13F36]">{t("learner.checkin.whatChanged")}</p>
          <p id="what-changed-title" className="mt-2 text-sm font-bold leading-6 text-primary">{result.note}</p>
        </section>
        <ResultEvidence session={session} result={result} />

        {!result.alreadySubmitted && (
          <section className="mt-5" aria-labelledby="next-week-title">
            <h3 id="next-week-title" className="font-display text-base font-extrabold text-primary">{t("learner.checkin.nextWeekTitle")}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weightedSkills.map((skill) => (
                <div key={skill} className="min-w-0 rounded-xl border border-primary/10 bg-white px-3 py-3">
                  <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t(skillNameKeys[skill])}</p>
                  <p className="mt-1 font-display text-lg font-extrabold text-primary">
                    {t("learner.checkin.nextWeekMinutes").replace("{minutes}", String(result.nextPlan.allocationMinutes[skill] ?? 0))}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link to="/learner/roadmap" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {t("learner.checkin.nextWeekLink")}<ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link to="/learner/progress" className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary/15 bg-white px-5 py-3 text-sm font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.checkin.returnToProgress")}</Link>
          <Link to="/learner" className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.checkin.backToToday")}</Link>
        </div>
      </div>
    </motion.section>
  );
}

export default function LearnerWeeklyCheckin() {
  const [session, setSession] = useState<LearnerCheckInSession | null>(null);
  const [result, setResult] = useState<LearnerCheckInResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [speakingAnswer, setSpeakingAnswer] = useState("");
  const [speakingSelfRating, setSpeakingSelfRating] = useState<CheckInComparison | null>(null);
  const [writingAnswer, setWritingAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const loaded = await prepareMyWeeklyCheckIn();
      const displaySession = loaded.existing
        ? loaded
        : { ...loaded, questions: shuffleQuestionOptions(loaded.questions) };
      setSession(displaySession);
      if (displaySession.existing) setResult(resultFromSavedRecord(displaySession.existing, displaySession));
      else setResult(null);
    } catch (error) {
      console.error("Parle weekly check-in could not be prepared", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const questionGroups = useMemo(() => {
    const listening = session?.questions.filter((question) => question.kind === "listening") ?? [];
    const readingOrGrammar = session?.questions.filter((question) => session.readingWeighted ? question.kind === "reading" : question.kind === "grammar") ?? [];
    return { listening, readingOrGrammar };
  }, [session]);
  const writingIsWeighted = Boolean(session?.writingPrompt && session.plan.targets.writing !== null);
  const writingWords = wordCount(writingAnswer);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(false);
    setValidationMessage("");
    if (!session) return;

    if (session.questions.some((question) => !answers[question.id])) {
      setValidationMessage(t("learner.checkin.validation"));
      return;
    }
    if (session.speakingPrompt && !speakingAnswer.trim()) {
      setValidationMessage(t("learner.checkin.speakingAnswerRequired"));
      return;
    }
    if (session.speakingPrompt && !speakingSelfRating) {
      setValidationMessage(t("learner.checkin.speakingRatingRequired"));
      return;
    }
    if (writingIsWeighted && (writingWords < 40 || writingWords > 120)) {
      setValidationMessage(t("placement.writing.wordLimit"));
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitMyWeeklyCheckIn({
        answers,
        speakingAnswer: speakingAnswer.trim(),
        speakingSelfRating,
        writingAnswer: writingAnswer.trim(),
      });
      setResult(saved);
      setAnswers({});
      setSpeakingAnswer("");
      setSpeakingSelfRating(null);
      setWritingAnswer("");
    } catch (error) {
      console.error("Parle weekly check-in submission failed", error);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[340px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite">
        <div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learner.checkin.loading")}</p></div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleHelp aria-hidden="true" className="h-6 w-6" /></span>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.checkin.loadErrorTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("learner.checkin.loadErrorBody")}</p>
        <button type="button" onClick={() => void loadSession()} className="parle-button-primary mt-6 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learner.checkin.retry")}</button>
      </section>
    );
  }

  if (session.notDue) {
    const dueDate = session.dueDate ?? session.plan.planStartDate;
    return (
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="rounded-[1.6rem] border border-primary/10 bg-white p-6 shadow-[0_20px_54px_-38px_rgba(30,58,138,0.35)] sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><CalendarCheck2 aria-hidden="true" className="h-6 w-6" /></span>
        <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A13F36]">{t("learner.checkin.eyebrow")}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.checkin.notDueTitle")}</h2>
        {dueDate && <p className="mt-3 text-sm leading-6 text-foreground">{t("learner.checkin.firstDueDate").replace("{date}", localDateLabel(dueDate))}</p>}
        <Link to="/learner" className="parle-button-primary mt-6 justify-center"><ArrowRight aria-hidden="true" className="h-4 w-4" />{t("learner.checkin.backToToday")}</Link>
      </motion.section>
    );
  }

  if (result) return <WeeklyCheckInResult session={session} result={result} />;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }} className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.65rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.75)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-14 -top-16 h-48 w-48 rounded-full border-[22px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-14 right-24 h-32 w-32 rounded-full bg-[#F97362]/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.checkin.eyebrow")}</p>
            <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("learner.checkin.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{t("learner.checkin.intro")}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white"><CalendarCheck2 aria-hidden="true" className="h-3.5 w-3.5 text-[#FFC0B4]" />{localDateLabel(session.plan.weekStart)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFC0B4]/15 text-[#FFC0B4]"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span>
            <div><p className="font-display text-xl font-extrabold leading-none">10</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">{t("learner.checkin.length")}</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-primary/10 bg-white px-4 py-3.5 text-xs leading-5 text-muted-foreground">
        <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#A13F36]" />
        <div className="min-w-0 flex-1"><p>{t("learner.checkin.bankNote")}</p><p className="mt-1 font-semibold text-foreground">{t("learner.checkin.scoreRule")}</p><p className="mt-1">{t("learner.checkin.estimateLabel")}</p></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <ObjectiveSet titleKey="learner.checkin.listeningTitle" kind="listening" questions={questionGroups.listening} answers={answers} onAnswer={(id, option) => setAnswers((current) => ({ ...current, [id]: option }))} questionOffset={0} />
        <ObjectiveSet titleKey={session.readingWeighted ? "learner.checkin.readingTitle" : "learner.checkin.grammarTitle"} kind={session.readingWeighted ? "reading" : "grammar"} questions={questionGroups.readingOrGrammar} answers={answers} onAnswer={(id, option) => setAnswers((current) => ({ ...current, [id]: option }))} questionOffset={questionGroups.listening.length} />

        {session.speakingPrompt ? (
          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.45)] sm:p-6" aria-labelledby="speaking-checkin-title">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h2 id="speaking-checkin-title" className="font-display text-lg font-extrabold text-primary">{t("learner.checkin.speakingTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.checkin.speakingPrompt")}</p></div></div>
            <p className="mt-4 rounded-xl bg-[#FAF9F5] px-3.5 py-3 text-sm font-semibold leading-6 text-foreground">{session.speakingPrompt.text}</p>
            <label htmlFor="checkin-speaking-answer" className="mt-4 block text-xs font-bold text-foreground">{t("learner.checkin.speakingAnswer")}</label>
            <textarea id="checkin-speaking-answer" value={speakingAnswer} onChange={(event) => setSpeakingAnswer(event.target.value.slice(0, 4000))} maxLength={4000} rows={4} placeholder={t("learner.checkin.speakingPlaceholder")} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground/75 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <fieldset className="mt-4 min-w-0">
              <legend className="text-xs font-bold text-foreground">{t("learner.checkin.speakingRating")}</legend>
              <div className="mt-2 grid gap-2">
                {(["below", "at", "above"] as const).map((rating) => (
                  <label key={rating} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm leading-5 transition ${speakingSelfRating === rating ? "border-primary bg-[#EEF2FA]" : "border-primary/10 bg-[#FAF9F5] hover:border-primary/25"}`}>
                    <input type="radio" name="speaking-self-rating" value={rating} checked={speakingSelfRating === rating} onChange={() => setSpeakingSelfRating(rating)} className="mt-1 h-4 w-4 shrink-0 accent-[#1E3A8A]" />
                    <span className="min-w-0 text-foreground">{t(`learner.checkin.speaking${rating[0].toUpperCase()}${rating.slice(1)}` as TranslationKey)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-3 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t("learner.checkin.speakingNoChange")}</p>
          </section>
        ) : (
          <p className="rounded-2xl border border-primary/10 bg-white px-4 py-4 text-sm leading-6 text-muted-foreground">{t("learner.progress.currentNotAssessed")}</p>
        )}

        {session.plan.targets.writing !== null && (
          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.45)] sm:p-6" aria-labelledby="writing-checkin-title">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><PenLine aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h2 id="writing-checkin-title" className="font-display text-lg font-extrabold text-primary">{t("learner.checkin.writingTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.checkin.writingPrompt")}</p></div></div>
            {session.writingPrompt ? (
              <>
                <p className="mt-4 rounded-xl bg-[#FAF9F5] px-3.5 py-3 text-sm font-semibold leading-6 text-foreground">{session.writingPrompt.text}</p>
                <label htmlFor="checkin-writing-answer" className="mt-4 block text-xs font-bold text-foreground">{t("learner.checkin.writingAnswer")}</label>
                <textarea id="checkin-writing-answer" value={writingAnswer} onChange={(event) => setWritingAnswer(event.target.value.slice(0, 6000))} maxLength={6000} rows={5} placeholder={t("learner.checkin.writingPlaceholder")} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground/75 focus:border-primary focus:ring-2 focus:ring-primary/15" />
                <p className={`mt-2 text-xs leading-5 ${writingIsWeighted && writingWords !== 0 && (writingWords < 40 || writingWords > 120) ? "font-semibold text-[#8D342D]" : "text-muted-foreground"}`}>
                  {t("learner.checkin.wordCount").replace("{count}", String(writingWords))}
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-[#FFF8F6] px-3.5 py-3 text-sm leading-6 text-[#75413D]">{t("learner.checkin.noWritingPrompt")}</p>
            )}
          </section>
        )}

        {(validationMessage || submitError) && (
          <p role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF3F0] px-4 py-3 text-sm font-semibold leading-6 text-[#8D342D]">
            {validationMessage || t("learner.checkin.submitError")}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-white shadow-[0_12px_26px_-14px_rgba(30,58,138,0.62)] transition hover:-translate-y-0.5 hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
            {submitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
            {t(submitting ? "learner.checkin.saving" : "learner.checkin.submit")}
            {!submitting && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
          </button>
          <Link to="/learner" className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.checkin.backToToday")}</Link>
        </div>
      </form>
    </motion.div>
  );
}
