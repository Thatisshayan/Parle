import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Headphones,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { PublicHeader } from "@/components/parle/PublicHeader";
import { parlePublicLevelCheck } from "@/functions";
import { t } from "@/lib/i18n";
import {
  checkLevelCheckBrowserLimit,
  recordLevelCheckBrowserStart,
  type TimestampStorage,
} from "@/lib/level-check-browser-limit";

type Skill = "reading" | "listening";
type ResultLevel = "A1" | "A2" | "B1" | "B2" | "Below A1";
type Screen = "ready" | "loading" | "question" | "scoring" | "result";

interface Choice {
  id: string;
  text: string;
}

interface CheckQuestion {
  id: string;
  skill: Skill;
  prompt: string;
  options: Choice[];
  passage?: string;
  transcript?: string;
}

interface CheckResult {
  reading: ResultLevel;
  listening: ResultLevel;
  isDemo: boolean;
}

const QUESTION_COUNT = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPayload(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!isRecord(current)) throw new Error("The level-check response was unavailable.");
    if (typeof current.error === "string") throw new Error(current.error);
    if (isRecord(current.result)) {
      current = current.result;
      continue;
    }
    if (isRecord(current.data)) {
      current = current.data;
      continue;
    }
    return current;
  }
  throw new Error("The level-check response was unavailable.");
}

function readQuestion(value: unknown): CheckQuestion | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  if (value.skill !== "reading" && value.skill !== "listening") return null;
  if (typeof value.prompt !== "string" || !value.prompt.trim() || !Array.isArray(value.options)) return null;
  if (value.options.length < 2 || value.options.length > 4) return null;
  const options: Choice[] = [];
  for (const entry of value.options) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.text !== "string" || !entry.text.trim()) return null;
    options.push({ id: entry.id, text: entry.text });
  }
  if (new Set(options.map((option) => option.id)).size !== options.length) return null;
  const passage = typeof value.passage === "string" && value.passage.trim() ? value.passage : undefined;
  const transcript = typeof value.transcript === "string" && value.transcript.trim() ? value.transcript : undefined;
  if (value.skill === "listening" && !transcript) return null;
  return {
    id: value.id,
    skill: value.skill,
    prompt: value.prompt,
    options,
    ...(value.skill === "reading" && passage ? { passage } : {}),
    ...(value.skill === "listening" && transcript ? { transcript } : {}),
  };
}

function readQuestionSet(value: unknown): { questions: CheckQuestion[]; isDemo: boolean; runId: string } {
  const payload = readPayload(value);
  const runId = typeof payload.runId === "string" && /^run_[0-9a-f]{32}$/.test(payload.runId)
    ? payload.runId
    : null;
  if (!Array.isArray(payload.questions) || payload.questions.length !== QUESTION_COUNT || typeof payload.isDemo !== "boolean" || !runId) {
    throw new Error("The level-check response was incomplete.");
  }
  const questions = payload.questions.map(readQuestion);
  if (questions.some((question) => !question)) throw new Error("The level-check response was incomplete.");
  const safeQuestions = questions as CheckQuestion[];
  const ids = safeQuestions.map((question) => question.id);
  const reading = safeQuestions.filter((question) => question.skill === "reading").length;
  const listening = safeQuestions.filter((question) => question.skill === "listening").length;
  if (new Set(ids).size !== QUESTION_COUNT || reading !== 5 || listening !== 5) {
    throw new Error("The level-check response was incomplete.");
  }
  return { questions: safeQuestions, isDemo: payload.isDemo, runId };
}

function readCheckResult(value: unknown): CheckResult {
  const payload = readPayload(value);
  const validLevel = (level: unknown): level is ResultLevel =>
    level === "A1" || level === "A2" || level === "B1" || level === "B2" || level === "Below A1";
  if (!validLevel(payload.reading) || !validLevel(payload.listening) || typeof payload.isDemo !== "boolean") {
    throw new Error("The level-check result was incomplete.");
  }
  return { reading: payload.reading, listening: payload.listening, isDemo: payload.isDemo };
}

function browserStorage(): TimestampStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function formatResetTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function displayLevel(level: ResultLevel): string {
  return level === "Below A1" ? t("placement.level.belowA1") : level;
}

function MotionPanel({ children, reduceMotion, className = "" }: {
  children: ReactNode;
  reduceMotion: boolean | null;
  className?: string;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function LevelCheck() {
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("ready");
  const [questions, setQuestions] = useState<CheckQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [limitResetAt, setLimitResetAt] = useState<number | null>(null);
  const [startError, setStartError] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const currentQuestion = questions[questionIndex] ?? null;
  const allAnswered = questions.length === QUESTION_COUNT && questions.every((question) => Boolean(answers[question.id]));
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? "" : "";

  useEffect(() => {
    const currentLimit = checkLevelCheckBrowserLimit(browserStorage());
    setLimitResetAt(currentLimit.allowed ? null : currentLimit.nextAllowedAt);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [screen, questionIndex, reduceMotion]);

  async function startCheck() {
    const currentLimit = checkLevelCheckBrowserLimit(browserStorage());
    if (!currentLimit.allowed) {
      setLimitResetAt(currentLimit.nextAllowedAt);
      return;
    }

    const returnScreen = screen === "result" ? "result" : "ready";
    setStartError(false);
    setSubmitError(false);
    setRunId(null);
    setQuestions([]);
    setQuestionIndex(0);
    setAnswers({});
    setScreen("loading");
    try {
      const response = await parlePublicLevelCheck({ action: "start" });
      const questionSet = readQuestionSet(response);
      const recorded = recordLevelCheckBrowserStart(browserStorage(), Date.now());
      setLimitResetAt(recorded.allowed ? null : recorded.nextAllowedAt);
      setQuestions(questionSet.questions);
      setRunId(questionSet.runId);
      setIsDemo(questionSet.isDemo);
      setQuestionIndex(0);
      setAnswers({});
      setResult(null);
      setScreen("question");
    } catch (error) {
      console.error("The public French level check could not start", error instanceof Error ? error.name : "unknown");
      setStartError(true);
      setScreen(returnScreen);
    }
  }

  function chooseAnswer(question: CheckQuestion, choiceId: string) {
    setAnswers((previous) => ({ ...previous, [question.id]: choiceId }));
    setSubmitError(false);
  }

  async function submitAnswers() {
    if (!allAnswered || !runId || screen !== "question") return;
    setSubmitError(false);
    setScreen("scoring");
    const submissions = questions.map((question) => ({
      questionId: question.id,
      choiceId: answers[question.id],
    }));
    try {
      const response = await parlePublicLevelCheck({ action: "score", runId, answers: submissions });
      const scored = readCheckResult(response);
      setResult(scored);
      setRunId(null);
      setAnswers({});
      setQuestions([]);
      setQuestionIndex(0);
      setIsDemo(scored.isDemo);
      setScreen("result");
    } catch (error) {
      console.error("The public French level check could not be scored", error instanceof Error ? error.name : "unknown");
      setSubmitError(true);
      setScreen("question");
    }
  }

  function refreshLimitMessage(nextAllowedAt: number | null) {
    if (nextAllowedAt === null) return null;
    return t("publicLevelCheck.limitWait", { time: formatResetTime(nextAllowedAt) });
  }

  const skillName = (skill: Skill) => t(skill === "reading" ? "publicLevelCheck.skill.reading" : "publicLevelCheck.skill.listening");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="relative isolate min-w-0 overflow-hidden bg-[radial-gradient(ellipse_at_12%_0%,rgba(249,115,98,0.12),transparent_28%),radial-gradient(ellipse_at_94%_35%,rgba(30,58,138,0.07),transparent_30%),linear-gradient(140deg,#fbfaf5_0%,#f7f6f0_58%,#f2f3f7_100%)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 h-80 w-80 rounded-full border border-primary/10 sm:-right-24 sm:h-[26rem] sm:w-[26rem]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-32 h-56 w-56 rounded-full border border-[#F97362]/20 sm:-right-10 sm:h-72 sm:w-72" />
        <div className="relative mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <h1 className="sr-only">{t("publicLevelCheck.title")}</h1>
          <AnimatePresence mode="wait" initial={false}>
            {screen === "ready" && (
              <MotionPanel key="ready" reduceMotion={reduceMotion} className="grid min-w-0 items-center gap-8 lg:grid-cols-[1.03fr_0.97fr] lg:gap-14">
                <section className="min-w-0 max-w-2xl">
                  <p className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/80 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary shadow-sm backdrop-blur">
                    <Sparkles aria-hidden="true" className="h-4 w-4 text-[#B83E36]" />
                    {t("publicLevelCheck.eyebrow")}
                  </p>
                  <h2 className="mt-6 max-w-[13ch] font-display text-[2.35rem] font-extrabold leading-[1.06] tracking-[-0.06em] text-primary sm:text-5xl lg:text-[3.8rem]">
                    {t("publicLevelCheck.title")}
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                    {t("publicLevelCheck.intro")}
                  </p>
                  <div className="mt-7 flex items-start gap-3 rounded-2xl border border-primary/10 bg-white/75 p-4 shadow-sm">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-6 text-foreground/80">{t("publicLevelCheck.browserLimitNote")}</p>
                  </div>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                    {t("publicLevelCheck.demoFallback")}
                  </p>
                </section>

                <aside className="relative min-w-0 rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_28px_90px_-58px_rgba(30,58,138,0.42)] sm:p-7 lg:p-8">
                  <div aria-hidden="true" className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]">
                    <Target className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("publicLevelCheck.coverageEyebrow")}</p>
                  <h3 className="mt-3 max-w-[15ch] font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] text-primary sm:text-3xl">
                    {t("publicLevelCheck.coverageTitle")}
                  </h3>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-primary/10 bg-[#F8F9FC] p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FB] text-primary"><BookOpenText aria-hidden="true" className="h-5 w-5" /></span>
                      <span className="min-w-0 text-sm font-bold leading-5 text-primary">{t("publicLevelCheck.readingCount")}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-primary/10 bg-[#F8F9FC] p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><Headphones aria-hidden="true" className="h-5 w-5" /></span>
                      <span className="min-w-0 text-sm font-bold leading-5 text-primary">{t("publicLevelCheck.listeningCount")}</span>
                    </div>
                  </div>
                  <p className="mt-5 rounded-xl bg-[#FAF9F5] px-4 py-3 text-sm leading-6 text-muted-foreground">
                    {t("publicLevelCheck.speakingWritingNote")}
                  </p>
                  {startError && (
                    <div className="auth-message-error mt-4" role="alert">
                      <p className="font-extrabold">{t("publicLevelCheck.startErrorTitle")}</p>
                      <p className="mt-1">{t("publicLevelCheck.startErrorBody")}</p>
                    </div>
                  )}
                  {limitResetAt !== null && (
                    <p className="mt-4 rounded-xl border border-[#F2CDC7] bg-[#FFF5F2] px-4 py-3 text-sm font-semibold leading-6 text-[#75413D]" role="status">
                      {refreshLimitMessage(limitResetAt)}
                    </p>
                  )}
                  <button type="button" onClick={() => void startCheck()} className="parle-button-primary mt-6 w-full justify-center">
                    {t("publicLevelCheck.start")}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </aside>
              </MotionPanel>
            )}

            {screen === "loading" && (
              <MotionPanel key="loading" reduceMotion={reduceMotion} className="mx-auto max-w-2xl rounded-[1.75rem] border border-primary/10 bg-white p-7 text-center shadow-[0_28px_90px_-58px_rgba(30,58,138,0.42)] sm:p-10">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" /></span>
                <h2 className="mt-5 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("publicLevelCheck.starting")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("publicLevelCheck.loadingBody")}</p>
              </MotionPanel>
            )}

            {screen === "question" && currentQuestion && (
              <MotionPanel key={`question-${questionIndex}`} reduceMotion={reduceMotion} className="mx-auto max-w-4xl rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_28px_90px_-58px_rgba(30,58,138,0.42)] sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{skillName(currentQuestion.skill)}</p>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      {t("publicLevelCheck.questionCounter", { current: questionIndex + 1, total: QUESTION_COUNT })}
                    </p>
                  </div>
                  {isDemo && <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#F2CDC7] bg-[#FFF5F2] px-3.5 py-2 text-xs font-extrabold text-[#8D342D]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{t("publicLevelCheck.demoNote")}</span>}
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="progressbar" aria-label={t("publicLevelCheck.progressLabel")} aria-valuemin={0} aria-valuemax={QUESTION_COUNT} aria-valuenow={questionIndex + 1}>
                  <motion.div className="h-full rounded-full bg-[#F97362]" initial={false} animate={{ width: `${((questionIndex + 1) / QUESTION_COUNT) * 100}%` }} transition={{ duration: reduceMotion ? 0 : 0.3 }} />
                </div>

                {currentQuestion.skill === "listening" && currentQuestion.transcript && (
                  <div className="mt-6 rounded-2xl border border-[#F2CDC7] bg-[#FFF7F4] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#8D342D]">
                      <Headphones aria-hidden="true" className="h-4 w-4" />{t("publicLevelCheck.transcriptLabel")}
                    </div>
                    <p lang="fr" className="mt-3 whitespace-pre-line text-base font-semibold leading-7 text-foreground sm:text-lg">{currentQuestion.transcript}</p>
                  </div>
                )}
                {currentQuestion.skill === "reading" && currentQuestion.passage && (
                  <div className="mt-6 rounded-2xl border border-primary/10 bg-[#F8F9FC] p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-primary">
                      <BookOpenText aria-hidden="true" className="h-4 w-4" />{t("publicLevelCheck.passageLabel")}
                    </div>
                    <p lang="fr" className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground sm:text-base">{currentQuestion.passage}</p>
                  </div>
                )}

                <fieldset className="mt-6 min-w-0">
                  <legend className="font-display text-xl font-extrabold leading-snug tracking-[-0.035em] text-primary sm:text-2xl" lang="fr">{currentQuestion.prompt}</legend>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("publicLevelCheck.chooseAnswer")}</p>
                  <div className="mt-3 space-y-2.5">
                    {currentQuestion.options.map((option, index) => {
                      const selected = currentAnswer === option.id;
                      const letter = String.fromCharCode(65 + index);
                      return (
                        <label key={`${currentQuestion.id}-${option.id}`} className={`group flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 ${selected ? "border-primary bg-[#EEF2FA] shadow-sm" : "border-primary/10 bg-white hover:border-primary/25 hover:bg-[#FAFBFE]"}`}>
                          <input className="sr-only" type="radio" name={`question-${currentQuestion.id}`} value={option.id} checked={selected} onChange={() => chooseAnswer(currentQuestion, option.id)} aria-label={t("publicLevelCheck.choiceLabel", { letter })} />
                          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${selected ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary"}`}>{letter}</span>
                          <span lang="fr" className="min-w-0 flex-1 whitespace-pre-line break-words text-sm font-semibold leading-6 text-foreground">{option.text}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {submitError && (
                  <div className="auth-message-error mt-5" role="alert">
                    <p className="font-extrabold">{t("publicLevelCheck.submitErrorTitle")}</p>
                    <p className="mt-1">{t("publicLevelCheck.submitErrorBody")}</p>
                  </div>
                )}
                {!currentAnswer && <p className="mt-4 text-sm font-semibold text-muted-foreground" role="status">{t("publicLevelCheck.answerRequired")}</p>}
                {questionIndex === QUESTION_COUNT - 1 && !allAnswered && <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("publicLevelCheck.allRequired")}</p>}

                <div className="mt-7 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {questionIndex > 0 ? (
                    <button type="button" onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))} className="parle-button-secondary w-full justify-center sm:w-auto">
                      <ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("publicLevelCheck.previous")}
                    </button>
                  ) : <span className="hidden sm:block" />}
                  {questionIndex < QUESTION_COUNT - 1 ? (
                    <button type="button" disabled={!currentAnswer} onClick={() => setQuestionIndex((index) => Math.min(QUESTION_COUNT - 1, index + 1))} className="parle-button-primary w-full justify-center sm:w-auto">
                      {t("publicLevelCheck.next")}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" disabled={!allAnswered} onClick={() => void submitAnswers()} className="parle-button-primary w-full justify-center sm:w-auto">
                      {t("publicLevelCheck.seeEstimates")}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("publicLevelCheck.transcriptNotice")}</p>
              </MotionPanel>
            )}

            {screen === "scoring" && (
              <MotionPanel key="scoring" reduceMotion={reduceMotion} className="mx-auto max-w-2xl rounded-[1.75rem] border border-primary/10 bg-white p-7 text-center shadow-[0_28px_90px_-58px_rgba(30,58,138,0.42)] sm:p-10" role="status" aria-live="polite">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" /></span>
                <h2 className="mt-5 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("publicLevelCheck.scoring")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("publicLevelCheck.scoringBody")}</p>
              </MotionPanel>
            )}

            {screen === "result" && result && (
              <MotionPanel key="result" reduceMotion={reduceMotion} className="mx-auto max-w-4xl rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_28px_90px_-58px_rgba(30,58,138,0.42)] sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("publicLevelCheck.resultEyebrow")}</p>
                    <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("publicLevelCheck.resultTitle")}</h2>
                  </div>
                  {result.isDemo && <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#F2CDC7] bg-[#FFF5F2] px-3.5 py-2 text-xs font-extrabold text-[#8D342D]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{t("publicLevelCheck.demoNote")}</span>}
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  {([
                    { skill: "reading" as const, level: result.reading, icon: BookOpenText },
                    { skill: "listening" as const, level: result.listening, icon: Headphones },
                  ]).map(({ skill, level, icon: Icon }, index) => (
                    <motion.article
                      key={skill}
                      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.36, delay: reduceMotion ? 0 : index * 0.08 }}
                      className="rounded-2xl border border-primary/10 bg-[#FAFBFD] p-5 sm:p-6"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${skill === "reading" ? "bg-[#EAF0FB] text-primary" : "bg-[#FFF0EC] text-[#A13F36]"}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
                        <h3 className="font-display text-lg font-extrabold tracking-[-0.03em] text-primary">{skillName(skill)}</h3>
                      </div>
                      <p className="mt-5 font-display text-5xl font-extrabold leading-none tracking-[-0.06em] text-primary">{displayLevel(level)}</p>
                      <p className="mt-3 inline-flex items-center gap-2 text-xs font-extrabold leading-5 text-muted-foreground"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#287252]" />{t("publicLevelCheck.estimateLabel")}</p>
                    </motion.article>
                  ))}
                </div>

                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#F8F9FC] p-4 sm:p-5">
                  <Target aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-foreground/80">{t("publicLevelCheck.studyNote")}</p>
                </div>
                <p className="mt-4 rounded-xl bg-[#FAF9F5] px-4 py-3 text-sm font-semibold leading-6 text-foreground/80">{t("publicLevelCheck.speakingWritingNote")}</p>

                <div className="mt-7 rounded-[1.5rem] bg-primary p-5 text-white sm:p-7">
                  <h3 className="font-display text-xl font-extrabold leading-snug tracking-[-0.035em] sm:text-2xl">{t("publicLevelCheck.nextStepTitle")}</h3>
                  <Link to="/signup" className="mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-full bg-white px-5 py-3 text-left text-sm font-extrabold leading-5 text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-[#FFF8F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary sm:w-fit sm:max-w-full">
                    <span className="min-w-0">{t("publicLevelCheck.signupCta")}</span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <p className="mt-4 text-sm leading-6 text-white/80">{t("publicLevelCheck.noTransferNote")}</p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => void startCheck()} className="parle-button-secondary w-full justify-center sm:w-auto">
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />{t("publicLevelCheck.startFresh")}
                  </button>
                  <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {t("common.backHome")}
                  </Link>
                </div>
                {startError && (
                  <div className="auth-message-error mt-4" role="alert">
                    <p className="font-extrabold">{t("publicLevelCheck.startErrorTitle")}</p>
                    <p className="mt-1">{t("publicLevelCheck.startErrorBody")}</p>
                  </div>
                )}
                {limitResetAt !== null && (
                  <p className="mt-4 rounded-xl border border-[#F2CDC7] bg-[#FFF5F2] px-4 py-3 text-sm font-semibold leading-6 text-[#75413D]" role="status">
                    {refreshLimitMessage(limitResetAt)}
                  </p>
                )}
              </MotionPanel>
            )}
          </AnimatePresence>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
