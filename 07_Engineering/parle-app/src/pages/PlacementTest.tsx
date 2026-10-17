import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BookOpenText,
  Check,
  CheckCircle2,
  Clock3,
  Headphones,
  Languages,
  Loader2,
  Mic2,
  MicOff,
  PenLine,
  ShieldCheck,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import { Brand } from "@/components/parle/Brand";
import { User } from "@/entities";
import { answerQuestion, finishPlacement, nextQuestion, openPlacement, scoreSpeaking, scoreWriting, skipListeningAudio, skipSection } from "@/lib/placement-remote";
import { VoiceRecorder } from "@/components/parle/VoiceRecorder";
import { SpeakingResultCard } from "@/components/parle/SpeakingResultCard";
import { ListeningPlayer } from "@/components/parle/ListeningPlayer";
import { ANSWER_MAX_MS } from "@/lib/voice-audio";
import { resultFromAssessment, voiceErrorFrom, voiceErrorKey } from "@/lib/voice-client";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  bestWritingLevel,
  parseTargetPerSkill,
  countWords,
  describeTargetGap,
  formatRetakeDate,
  recordsFromResponse,
  selectPrompt,
  snapshotFromSavedRecord,
  summarizeAutoRun,
  type AdaptiveRun,
  type AdaptiveUpdate,
  type AutoSectionKey,
  type AutoSectionSummary,
  type GapDescriptor,
  type PlacementResultRecord,
  type PlacementResultSnapshot,
  type PromptItem,
  type QuestionItem,
  type QuestionOption,
  type RetakeGate,
  type ResultLevel,
  type SkillKey,
  type Track,
  type WritingAssessment,
  type SpeakingAssessment,
} from "@/lib/placement-test";

interface LearnerProfileRecord {
  id: string;
  user_id: string;
  track: Track;
  self_assessed_level: string;
  target_per_skill: string;
  main_goal?: string;
}

interface ParleUser {
  id: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

type SectionKey = AutoSectionKey | "writing" | "speaking";
type Screen = "loading" | "section_intro" | "question" | "writing" | "speaking" | "saving" | "result" | "preparing" | "error" | "access";

interface ActiveQuestionPresentation {
  questionId: string;
  options: QuestionOption[];
}

interface AnswerFeedback {
  update: AdaptiveUpdate;
  item: QuestionItem;
}

const sectionOrder: SectionKey[] = ["listening", "reading", "grammar_vocabulary", "writing", "speaking"];

const sectionMeta: Record<SectionKey, { label: TranslationKey; description: TranslationKey; icon: typeof Headphones }> = {
  listening: { label: "placement.section.listening", description: "placement.section.listeningDescription", icon: Headphones },
  reading: { label: "placement.section.reading", description: "placement.section.readingDescription", icon: BookOpenText },
  grammar_vocabulary: { label: "placement.section.grammar", description: "placement.section.grammarDescription", icon: Languages },
  writing: { label: "placement.section.writing", description: "placement.section.writingDescription", icon: PenLine },
  speaking: { label: "placement.section.speaking", description: "placement.section.speakingDescription", icon: Mic2 },
};





function getGapText(gap: GapDescriptor): string {
  switch (gap.kind) {
    case "optional": return t("placement.result.gap.optional");
    case "unassessed": return t("placement.result.gap.unassessed");
    case "below_a1": return t("placement.result.gap.belowA1");
    case "no_target": return t("placement.result.gap.noTarget");
    case "nclc_met": return t("placement.result.gap.nclcMet").replace("{target}", String(gap.target));
    case "nclc_close": return t("placement.result.gap.nclcClose").replace("{target}", String(gap.target));
    case "nclc_steps": return t("placement.result.gap.nclcSteps").replace("{steps}", String(gap.steps)).replace("{target}", String(gap.target));
    case "cefr_met": return t("placement.result.gap.cefrMet").replace("{target}", gap.target);
    case "cefr_steps": return t("placement.result.gap.cefrSteps").replace("{steps}", String(gap.steps)).replace("{target}", gap.target);
    case "outside_range": return t("placement.result.gap.outsideRange").replace("{target}", gap.target);
  }
}

function displayResultLevel(level: ResultLevel | null): string {
  return level === "Below A1" ? t("placement.level.belowA1") : level ?? t("placement.result.notAssessed");
}

function formatDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}



export default function PlacementTest() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("loading");
  const [profile, setProfile] = useState<LearnerProfileRecord | null>(null);
  const [user, setUser] = useState<ParleUser | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [servedQuestion, setServedQuestion] = useState<QuestionItem | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [run, setRun] = useState<AdaptiveRun | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [activePresentation, setActivePresentation] = useState<ActiveQuestionPresentation | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [questionBusy, setQuestionBusy] = useState(false);
  const [autoResults, setAutoResults] = useState<AutoSectionSummary[]>([]);
  const [skippedSections, setSkippedSections] = useState<string[]>([]);
  const [writingPrompt, setWritingPrompt] = useState<PromptItem | null>(null);
  const [writingText, setWritingText] = useState("");
  const [writingAssessment, setWritingAssessment] = useState<WritingAssessment | null>(null);
  const [writingBusy, setWritingBusy] = useState(false);
  const [writingError, setWritingError] = useState<TranslationKey | null>(null);
  const [loadingError, setLoadingError] = useState<TranslationKey | null>(null);
  const [retryMode, setRetryMode] = useState<"load" | "save" | null>(null);
  const [retakeGate, setRetakeGate] = useState<RetakeGate | null>(null);
  const [resultSnapshot, setResultSnapshot] = useState<PlacementResultSnapshot | null>(null);
  const [resultRecord, setResultRecord] = useState<PlacementResultRecord | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [speakingAssessment, setSpeakingAssessment] = useState<SpeakingAssessment | null>(null);
  const [speakingBusy, setSpeakingBusy] = useState(false);
  const [speakingProblem, setSpeakingProblem] = useState<TranslationKey | null>(null);

  const currentSection = sectionOrder[sectionIndex];
  const isCitizenship = profile?.track === "citizenship";
  const isOptionalSection = isCitizenship && (currentSection === "reading" || currentSection === "writing");
  const sectionMetaCurrent = currentSection ? sectionMeta[currentSection] : null;
  const targets = useMemo(() => parseTargetPerSkill(profile?.target_per_skill), [profile?.target_per_skill]);
  // The server serves each question without its answer; after answering, feedback brings the full item.
  const currentQuestion = answerFeedback?.item ?? servedQuestion;
  const presentedOptions = activePresentation && currentQuestion && activePresentation.questionId === currentQuestion.id
    ? activePresentation.options
    : [];
  const writingWordCount = countWords(writingText);
  const writingWordCountValid = writingWordCount >= 40 && writingWordCount <= 120;
  const estimatedWritingLevel = useMemo(
    () => bestWritingLevel(autoResults, profile?.self_assessed_level),
    [autoResults, profile?.self_assessed_level],
  );
  const speakingPromptList = useMemo(
    () => selectPrompt(prompts, "speaking", estimatedWritingLevel).slice(0, 2),
    [prompts, estimatedWritingLevel],
  );

  const showError = (key: TranslationKey, retry: "load" | "save" | null) => {
    setLoadingError(key);
    setRetryMode(retry);
    setScreen("error");
  };

  const loadTestData = useCallback(async () => {
    setScreen("loading");
    setLoadingError(null);
    setRetryMode("load");
    setActivePresentation(null);
    setServedQuestion(null);
    try {
      let signedInUser: ParleUser;
      try {
        signedInUser = (await User.me()) as ParleUser;
      } catch {
        navigate("/login", { replace: true });
        return;
      }
      if (!signedInUser?.email || !signedInUser.id || signedInUser.role === "administrator") {
        setScreen("access");
        return;
      }
      setUser(signedInUser);

      const opened = await openPlacement();
      if (opened.screen === "access") {
        setScreen("access");
        return;
      }
      setRetakeGate(opened.gate);
      if (opened.screen === "result") {
        setResultRecord(opened.record);
        setResultSnapshot(snapshotFromSavedRecord(opened.record));
        setScreen("result");
        return;
      }
      setProfile(opened.profile as LearnerProfileRecord);
      setRunId(opened.runId);
      setPrompts(opened.prompts);
      setAutoResults([]);
      setSkippedSections([]);
      setSectionIndex(0);
      setScreen("section_intro");
    } catch (error) {
      console.error("Parle placement test could not load", error);
      showError(/BANK_INCOMPLETE/.test(String((error as Error)?.message)) ? "placement.error.bankIncomplete" : "placement.error.load", "load");
    }
  }, [navigate]);

  useEffect(() => {
    void loadTestData();
  }, [loadTestData]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: shouldReduceMotion ? "auto" : "smooth" });
  }, [screen, sectionIndex, shouldReduceMotion]);

  /** Asks the server for the next question of a section; returns false when the section has no more. */
  async function loadNextQuestion(section: AutoSectionKey): Promise<boolean> {
    if (!runId) return false;
    const served = await nextQuestion(runId, section);
    if (!("question" in served)) return false;
    setRun(served.run);
    setServedQuestion(served.question);
    setActivePresentation({ questionId: served.question.id, options: served.question.options });
    return true;
  }

  async function startCurrentSection() {
    if (!currentSection || !profile) return;
    if (currentSection === "listening" || currentSection === "reading" || currentSection === "grammar_vocabulary") {
      setSelectedOptionId("");
      setAnswerFeedback(null);
      setQuestionBusy(true);
      try {
        if (await loadNextQuestion(currentSection)) setScreen("question");
        else showError("placement.error.bankIncomplete", null);
      } catch (error) {
        console.error("Parle placement question could not load", error);
        showError("placement.error.load", "load");
      } finally {
        setQuestionBusy(false);
      }
      return;
    }
    if (currentSection === "writing") {
      const matches = selectPrompt(prompts, "writing", estimatedWritingLevel);
      if (!matches.length) {
        showError("placement.error.bankIncomplete", null);
        return;
      }
      setWritingPrompt(matches[0]);
      setWritingAssessment(null);
      setWritingText("");
      setWritingError(null);
      setScreen("writing");
      return;
    }
    setScreen("speaking");
  }

  async function skipCurrentOptionalSection() {
    if (!isOptionalSection || !currentSection || !runId) return;
    try {
      await skipSection(runId, currentSection);
    } catch (error) {
      console.error("Parle placement section could not be skipped", error);
      showError("placement.error.load", "load");
      return;
    }
    setSkippedSections((current) => current.includes(currentSection) ? current : [...current, currentSection]);
    setSectionIndex((current) => current + 1);
    setScreen("section_intro");
  }

  async function submitSelectedAnswer() {
    if (!runId || !run || !currentQuestion || !selectedOptionId || !presentedOptions.length || answerFeedback || questionBusy) return;
    setQuestionBusy(true);
    try {
      const feedback = await answerQuestion(runId, selectedOptionId);
      setRun(feedback.update.run);
      setAnswerFeedback({ update: feedback.update, item: feedback.item });
    } catch (error) {
      console.error("Parle placement answer could not be saved", error);
      showError("placement.error.load", "load");
    } finally {
      setQuestionBusy(false);
    }
  }

  /** Plan 13: the listening question's audio would not load after a retry: skipped, never scored. */
  async function skipListeningQuestionAudio() {
    if (!runId || questionBusy) return;
    setQuestionBusy(true);
    try {
      const skipped = await skipListeningAudio(runId);
      setSelectedOptionId("");
      setAnswerFeedback(null);
      if (skipped.completed) {
        setServedQuestion(null);
        setAutoResults((current) => [...current.filter((item) => item.section !== "listening"), summarizeAutoRun(skipped.run)]);
        setRun(null);
        setSectionIndex((current) => current + 1);
        setScreen("section_intro");
        return;
      }
      setRun(skipped.run);
      if (!(await loadNextQuestion("listening"))) showError("placement.error.bankIncomplete", null);
    } catch (error) {
      console.error("Parle placement question could not be skipped", error);
      showError("placement.error.load", "load");
    } finally {
      setQuestionBusy(false);
    }
  }

  async function continueAfterAnswer() {
    if (!answerFeedback || questionBusy) return;
    const completedRun = answerFeedback.update.run;
    if (answerFeedback.update.completed) {
      setAnswerFeedback(null);
      setSelectedOptionId("");
      setServedQuestion(null);
      setAutoResults((current) => [
        ...current.filter((item) => item.section !== completedRun.section),
        summarizeAutoRun(completedRun),
      ]);
      setRun(null);
      setSectionIndex((current) => current + 1);
      setScreen("section_intro");
      return;
    }
    setQuestionBusy(true);
    try {
      const more = await loadNextQuestion(completedRun.section);
      setAnswerFeedback(null);
      setSelectedOptionId("");
      if (!more) showError("placement.error.bankIncomplete", null);
    } catch (error) {
      console.error("Parle placement question could not load", error);
      showError("placement.error.load", "load");
    } finally {
      setQuestionBusy(false);
    }
  }

  async function submitWriting() {
    if (!runId || !writingPrompt || !writingWordCountValid || writingBusy || writingAssessment) return;
    setWritingBusy(true);
    setWritingError(null);
    try {
      const scored = await scoreWriting(runId, writingPrompt.id, writingText.trim());
      setWritingAssessment(scored.assessment);
    } catch (error) {
      console.error("Parle writing assessment failed", error);
      setWritingError("placement.writing.scoreError");
    } finally {
      setWritingBusy(false);
    }
  }

  function continueAfterWriting() {
    if (!writingAssessment) return;
    setSectionIndex((current) => current + 1);
    setScreen("section_intro");
  }

  async function scorePlacementSpeaking(promptId: string, ticketId: string) {
    if (!runId) return;
    setSpeakingBusy(true);
    setSpeakingProblem(null);
    try {
      const outcome = await scoreSpeaking(runId, promptId, ticketId);
      if (outcome.status === "scored") setSpeakingAssessment(outcome.assessment);
      else setSpeakingProblem(outcome.status === "not_french" ? "voice.notFrench" : "voice.tooQuiet");
    } catch (error) {
      setSpeakingProblem(voiceErrorKey(voiceErrorFrom(error), "answer"));
    } finally {
      setSpeakingBusy(false);
    }
  }

  async function saveCompletedResult() {
    if (!user || !profile || !runId || saveBusy) return;
    setSaveBusy(true);
    setScreen("saving");
    setLoadingError(null);
    setRetryMode("save");
    try {
      const { record: saved, snapshot } = await finishPlacement(runId);
      if (!saved?.id) throw new Error("The saved placement result could not be confirmed.");
      setResultRecord(saved);
      setResultSnapshot(snapshot);
      const availableAt = new Date(Date.parse(saved.taken_at || new Date().toISOString()) + 14 * 24 * 60 * 60 * 1000).toISOString();
      setRetakeGate({ blocked: Date.parse(availableAt) > Date.now(), availableAt, latest: saved });
      setRetryMode(null);
      setScreen("result");
    } catch (error) {
      console.error("Parle placement result could not be saved", error);
      setLoadingError("placement.error.save");
      setScreen("error");
    } finally {
      setSaveBusy(false);
    }
  }

  const sectionIsComplete = (key: SectionKey): boolean => {
    if (key === "speaking") return screen === "result" || screen === "preparing";
    if (key === "writing") return Boolean(writingAssessment) || skippedSections.includes("writing");
    if (key === "reading" && skippedSections.includes("reading")) return true;
    return autoResults.some((result) => result.section === key);
  };

  function renderProgressRail() {
    return (
      <aside className="rounded-[1.6rem] bg-primary p-5 text-white shadow-[0_24px_64px_-42px_rgba(30,58,138,0.75)] sm:p-6 lg:sticky lg:top-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-[#FFC0B4]"><Target aria-hidden="true" className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]">{t("placement.eyebrow")}</p>
            <p className="mt-0.5 text-sm font-bold text-white">{t("placement.estimatedTime")}</p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-white/75">{t("placement.railBody")}</p>
        <ol className="mt-6 grid grid-cols-5 gap-2 lg:block lg:space-y-3">
          {sectionOrder.map((section, index) => {
            const meta = sectionMeta[section];
            const Icon = meta.icon;
            const complete = sectionIsComplete(section);
            const active = sectionIndex === index && screen !== "result" && screen !== "preparing";
            return (
              <li key={section} className={`min-w-0 rounded-xl border p-2 transition lg:p-3 ${active ? "border-white/25 bg-white/12" : complete ? "border-white/10 bg-white/5" : "border-transparent bg-transparent"}`}>
                <div className="flex items-center justify-center gap-2 lg:justify-start">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${complete ? "bg-[#FFC0B4] text-primary" : active ? "bg-white text-primary" : "bg-white/10 text-white/70"}`}>
                    {complete ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
                  </span>
                  <span className="hidden min-w-0 flex-1 text-xs font-bold leading-5 lg:block">{t(meta.label)}</span>
                  {active && <span className="hidden text-[10px] font-bold uppercase tracking-[0.12em] text-[#FFC0B4] lg:block">{t("placement.progress.current")}</span>}
                </div>
                <span className="mt-1 block truncate text-center text-[9px] font-bold leading-4 text-white/75 lg:hidden">{t(meta.label)}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 hidden rounded-2xl border border-white/15 bg-white/5 p-4 lg:block">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC0B4]" />
            <p className="text-xs leading-5 text-white/75">{t("placement.railEstimateNote")}</p>
          </div>
        </div>
      </aside>
    );
  }

  function renderSectionIntro() {
    if (!currentSection || !sectionMetaCurrent) return null;
    const Icon = sectionMetaCurrent.icon;
    return (
      <motion.div
        key={`intro-${currentSection}`}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_20px_56px_-42px_rgba(30,58,138,0.35)] sm:p-8"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Icon aria-hidden="true" className="h-5 w-5" /></div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("placement.section.introEyebrow")}</p>
          {isOptionalSection && <span className="rounded-full bg-[#FFF0EC] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("placement.optionalForGoal")}</span>}
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t(sectionMetaCurrent.label)}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{t(sectionMetaCurrent.description)}</p>
        {currentSection === "listening" && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F2CDC7] bg-[#FFF5F2] p-4">
            <Volume2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#A13F36]" />
            <p className="text-sm leading-6 text-[#75413D]">{t("placement.listening.audioNotice")}</p>
          </div>
        )}
        {currentSection === "writing" && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
            <Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-6 text-foreground">{t("placement.writing.timingNote")}</p>
          </div>
        )}
        {currentSection === "speaking" && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
            <MicOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-6 text-foreground">{t("placement.speaking.providerNote")}</p>
          </div>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {sectionIndex === 0 ? (
            <Link to="/onboarding" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("placement.backToOnboarding")}
            </Link>
          ) : <span className="hidden sm:block" />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {isOptionalSection && (
              <button type="button" onClick={skipCurrentOptionalSection} className="parle-button-secondary justify-center">
                {t("placement.skipOptional")}
              </button>
            )}
            <button type="button" onClick={startCurrentSection} disabled={questionBusy} aria-busy={questionBusy} className="parle-button-primary justify-center">
              {t(currentSection === "speaking" ? "placement.speaking.reviewPrompts" : "placement.section.begin")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  function renderQuestion() {
    if (!run || !currentQuestion) {
      return (
        <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6" role="alert">
          <p className="font-bold text-[#8D342D]">{t("placement.error.itemUnavailable")}</p>
          <button type="button" onClick={() => { setLoadingError("placement.error.bankIncomplete"); setRetryMode(null); setScreen("error"); }} className="parle-button-secondary mt-5">
            {t("placement.backToSpace")}
          </button>
        </section>
      );
    }
    const answeredCount = run.responses.length;
    const progress = Math.min(100, (answeredCount / run.maximum) * 100);
    const feedback = answerFeedback?.update;
    const correctAnswerText = currentQuestion.options.find((option) => option.id === currentQuestion.answer_option_id)?.text ?? currentQuestion.answer;
    return (
      <motion.section
        key={`question-${currentQuestion.id}-${Boolean(answerFeedback)}`}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_20px_56px_-42px_rgba(30,58,138,0.35)] sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t(sectionMeta[run.section].label)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{t("placement.question.counter").replace("{current}", String(answeredCount + (answerFeedback ? 0 : 1))).replace("{maximum}", String(run.maximum))}</p>
          </div>
          <span className="rounded-full bg-[#EEF2FA] px-3.5 py-2 text-xs font-extrabold text-primary">{t("placement.question.bankLevel").replace("{level}", currentQuestion.cefr_level)}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="progressbar" aria-label={t("placement.question.progressLabel")} aria-valuemin={0} aria-valuemax={run.maximum} aria-valuenow={answeredCount}>
          <motion.div className="h-full rounded-full bg-[#F97362]" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: shouldReduceMotion ? 0 : 0.3 }} />
        </div>

        {run.section === "listening" && (
          <div className="mt-6 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("placement.listening.audioLabel")}</p>
            {/* Plan 13: played, never read; the transcript stays on the server. No skip once the answer is shown. */}
            <ListeningPlayer audioUrl={currentQuestion.audio_url} itemId={currentQuestion.id} onGiveUp={answerFeedback ? undefined : () => void skipListeningQuestionAudio()} />
          </div>
        )}

        {currentQuestion.passage && (
          <div className="mt-6 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("placement.question.passageLabel")}</p>
            <p lang="fr" className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground sm:text-base">{currentQuestion.passage}</p>
          </div>
        )}

        <div className="mt-6">
          <h1 className="font-display text-xl font-extrabold leading-snug tracking-[-0.035em] text-primary sm:text-2xl whitespace-pre-line" lang="fr">{currentQuestion.prompt}</h1>
          <fieldset className="mt-5">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("placement.question.chooseAnswer")}</legend>
            <div role="radiogroup" aria-label={t("placement.question.chooseAnswer")} className="mt-3 space-y-2.5">
              {!presentedOptions.length ? (
                <div role="status" aria-live="polite" className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] px-4 py-3 text-sm font-semibold text-muted-foreground">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />{t("placement.question.preparingChoices")}
                </div>
              ) : presentedOptions.map((option, index) => {
                const isSelected = selectedOptionId === option.id;
                const isCorrectOption = Boolean(answerFeedback && option.id === currentQuestion.answer_option_id);
                const isIncorrectSelection = answerFeedback && isSelected && !answerFeedback.update.response.is_correct;
                return (
                  <button
                    key={`${currentQuestion.id}-${option.id}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => !answerFeedback && setSelectedOptionId(option.id)}
                    disabled={Boolean(answerFeedback)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-default ${isCorrectOption ? "border-[#B9D9CB] bg-[#F0F8F4]" : isIncorrectSelection ? "border-[#F0C5C0] bg-[#FFF5F2]" : isSelected ? "border-primary bg-[#EEF2FA] shadow-sm" : "border-primary/10 bg-white hover:border-primary/25 hover:bg-[#FAFBFE]"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${isCorrectOption ? "border-[#287252] bg-[#287252] text-white" : isSelected ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary"}`}>
                      {isCorrectOption ? <Check aria-hidden="true" className="h-4 w-4" /> : String.fromCharCode(65 + index)}
                    </span>
                    <span lang="fr" className="min-w-0 flex-1 whitespace-pre-line text-sm font-semibold leading-6 text-foreground">{option.text}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {answerFeedback && (
          <div className={`mt-5 rounded-2xl border p-4 ${feedback?.response.is_correct ? "border-[#B9D9CB] bg-[#F0F8F4]" : "border-[#F0C5C0] bg-[#FFF5F2]"}`} role="status" aria-live="polite">
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${feedback?.response.is_correct ? "text-[#287252]" : "text-[#A13F36]"}`} />
              <div>
                <p className="text-sm font-extrabold text-foreground">{t(feedback?.response.is_correct ? "placement.question.correct" : "placement.question.incorrect")}</p>
                {!feedback?.response.is_correct && <p className="mt-1 whitespace-pre-line text-sm font-semibold text-foreground" lang="fr">{t("placement.question.correctAnswer").replace("{answer}", correctAnswerText)}</p>}
                {currentQuestion.explanation && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{t("placement.question.explanation")} {currentQuestion.explanation}</p>}
                {feedback?.movement && <p className="mt-2 text-xs font-bold text-primary">{t(feedback.movement === "up" ? "placement.question.movedUp" : "placement.question.movedDown").replace("{level}", displayResultLevel(feedback.run.estimatedLevel))}</p>}
                {feedback?.completed && <p className="mt-2 text-xs font-extrabold uppercase tracking-[0.1em] text-primary">{t("placement.question.sectionComplete")}</p>}
              </div>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs leading-5 text-muted-foreground">{t("placement.question.adaptiveHint")}</span>
          {answerFeedback ? (
            <button type="button" onClick={continueAfterAnswer} disabled={questionBusy} aria-busy={questionBusy} className="parle-button-primary w-full justify-center sm:w-auto">
              {t(answerFeedback.update.completed ? "placement.question.finishSection" : "placement.question.continue")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submitSelectedAnswer} disabled={!selectedOptionId || !presentedOptions.length || questionBusy} aria-busy={questionBusy} className="parle-button-primary w-full justify-center sm:w-auto">
              {t("placement.question.submitAnswer")}
              <Check aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.section>
    );
  }

  function renderWriting() {
    if (!writingPrompt) return null;
    return (
      <motion.section key="writing" initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_20px_56px_-42px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("placement.writing.eyebrow")}</p>
            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] text-primary sm:text-3xl">{t("placement.writing.title")}</h1>
          </div>
          <span className="rounded-full bg-[#EEF2FA] px-3.5 py-2 text-xs font-extrabold text-primary">{t("placement.question.bankLevel").replace("{level}", writingPrompt.cefr_level)}</span>
        </div>
        <div className="mt-5 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("placement.writing.promptLabel")}</p>
          <p lang="fr" className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-foreground sm:text-base">{writingPrompt.text}</p>
        </div>
        {!writingAssessment ? (
          <div className="mt-5 space-y-3">
            <label htmlFor="placement-writing-response" className="block text-sm font-bold text-foreground">{t("placement.writing.responseLabel")}</label>
            <textarea
              id="placement-writing-response"
              value={writingText}
              onChange={(event) => { setWritingText(event.target.value); setWritingError(null); }}
              rows={8}
              maxLength={5000}
              lang="fr"
              aria-describedby="placement-writing-count placement-writing-help"
              className="min-h-52 w-full resize-y rounded-2xl border border-input bg-white px-4 py-3 text-sm leading-7 text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("placement.writing.placeholder")}
              disabled={writingBusy}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="placement-writing-count" className={`text-xs font-bold ${writingWordCountValid ? "text-[#287252]" : "text-muted-foreground"}`} aria-live="polite">
                {t("placement.writing.wordCount").replace("{count}", String(writingWordCount))}
              </p>
              <p id="placement-writing-help" className="text-xs leading-5 text-muted-foreground">{t("placement.writing.wordLimit")}</p>
            </div>
            {writingError && <p role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF3F0] px-4 py-3 text-sm font-semibold leading-6 text-[#8D342D]">{t(writingError)}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-xs leading-5 text-muted-foreground">{t("placement.writing.timingNote")}</p>
              <button type="button" onClick={submitWriting} disabled={!writingWordCountValid || writingBusy} aria-busy={writingBusy} className="parle-button-primary w-full justify-center sm:w-auto">
                {writingBusy ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t("placement.writing.scoring")}</> : <>{t("placement.writing.submit")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-[#B9D9CB] bg-[#F0F8F4] p-4 sm:p-5" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#287252]">{t("placement.writing.feedbackEyebrow")}</p>
                <p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("placement.writing.estimatedLevel").replace("{level}", writingAssessment.level)}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-foreground">{t("placement.writing.wordCount").replace("{count}", String(writingAssessment.word_count))}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-foreground">{writingAssessment.feedback}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["task_completion", "placement.writing.rubric.task"],
                ["grammar", "placement.writing.rubric.grammar"],
                ["vocabulary", "placement.writing.rubric.vocabulary"],
                ["coherence", "placement.writing.rubric.coherence"],
              ] as const).map(([key, labelKey]) => (
                <div key={key} className="rounded-xl border border-[#B9D9CB]/70 bg-white p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t(labelKey)}</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">{writingAssessment.rubric[key]}<span className="ml-1 text-xs font-bold text-muted-foreground">/ 4</span></p>
                </div>
              ))}
            </div>
            <button type="button" onClick={continueAfterWriting} className="parle-button-primary mt-6 w-full justify-center sm:w-auto">
              {t("placement.writing.continue")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </motion.section>
    );
  }

  function renderSpeaking() {
    const prompt = speakingPromptList[0] ?? null;
    return (
      <motion.section key="speaking" initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_20px_56px_-42px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Mic2 aria-hidden="true" className="h-5 w-5" /></div>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("placement.speaking.eyebrow")}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("placement.speaking.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("placement.speaking.providerNote")}</p>
        {prompt && (
          <div className="mt-5 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("placement.speaking.samplePrompts")}</p>
            <p lang="fr" className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-foreground sm:text-base">{prompt.text}</p>
          </div>
        )}
        {speakingAssessment ? (
          <div className="mt-5"><SpeakingResultCard result={resultFromAssessment(speakingAssessment)} /></div>
        ) : prompt && runId ? (
          <div className="mt-5 space-y-3">
            {speakingBusy
              ? <p role="status" className="flex items-center gap-2 text-sm text-primary"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t("placement.speaking.scoring")}</p>
              : <VoiceRecorder purpose="placement" refId={runId} maxMs={ANSWER_MAX_MS} onTranscribed={(r) => void scorePlacementSpeaking(prompt.id, r.ticketId)} />}
            {speakingProblem && <p role="alert" className="rounded-xl border border-[#F2CDC7] bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#75413D]">{t(speakingProblem)}</p>}
          </div>
        ) : null}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">{t(speakingAssessment ? "voice.result.pronunciation" : "placement.speaking.noMic")}</p>
          <button type="button" onClick={() => void saveCompletedResult()} disabled={saveBusy || speakingBusy} className="parle-button-primary w-full justify-center sm:w-auto">
            {t(speakingAssessment ? "placement.speaking.finish" : "placement.speaking.finishWithout")}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </motion.section>
    );
  }

  function renderResultSkill(skill: SkillKey, labelKey: TranslationKey, level: ResultLevel | null, state: PlacementResultSnapshot["states"][SkillKey], nclc: PlacementResultSnapshot["nclcEstimates"][SkillKey]) {
    const descriptor = describeTargetGap(level, state, resultSnapshot?.targetPerSkill[skill] ?? targets[skill], profile?.track ?? "general");
    const stateLabelKey: TranslationKey = state === "transcript_only"
      ? "placement.result.stateTranscriptOnly"
      : state === "optional"
        ? "placement.result.stateOptional"
        : state === "not_assessed"
          ? "placement.result.stateNotAssessed"
          : "placement.result.stateAssessed";
    return (
      <article key={skill} className="rounded-2xl border border-primary/10 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t(labelKey)}</p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{displayResultLevel(level)}</p>
          </div>
          <span className={`max-w-[55%] rounded-full px-3 py-1.5 text-right text-[10px] font-extrabold leading-4 ${state === "assessed" ? "bg-[#EAF5EF] text-[#236146]" : state === "transcript_only" ? "bg-[#FFF0EC] text-[#8D342D]" : "bg-[#EEF2FA] text-primary"}`}>{t(stateLabelKey)}</span>
        </div>
        {profile?.track !== "general" && nclc && (
          <div className="mt-4 border-t border-primary/10 pt-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("placement.result.nclcLabel")}</p>
            <p className="mt-1 text-base font-extrabold text-foreground">{nclc.label}</p>
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{getGapText(descriptor)}</p>
      </article>
    );
  }

  function renderResults() {
    if (!resultSnapshot) return null;
    return (
      <motion.section key="result" initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[1.7rem] border border-primary/10 bg-white shadow-[0_24px_68px_-46px_rgba(30,58,138,0.4)]">
        <div className="relative overflow-hidden bg-primary px-5 py-7 text-white sm:px-8 sm:py-9">
          <div aria-hidden="true" className="absolute -right-10 -top-20 h-56 w-56 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -right-2 -top-12 h-40 w-40 rounded-full border border-[#FFC0B4]/20" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white/90"><BookOpenCheck aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("placement.result.eyebrow")}</span>
            <h1 className="mt-4 max-w-2xl font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] sm:text-4xl">{t("placement.result.title")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">{t("placement.result.intro")}</p>
            <p className="mt-5 inline-flex rounded-xl border border-[#FFC0B4]/30 bg-white/10 px-4 py-3 text-sm font-extrabold leading-6 text-white">{t("placement.result.estimateLabel")}</p>
          </div>
        </div>
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("placement.result.levelsEyebrow")}</p>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("placement.result.levelsTitle")}</h2>
            </div>
            {resultRecord?.taken_at && <p className="text-xs font-semibold text-muted-foreground">{t("placement.result.completedAt").replace("{date}", formatDate(resultRecord.taken_at))}</p>}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {renderResultSkill("L", "placement.result.skillListening", resultSnapshot.levels.L, resultSnapshot.states.L, resultSnapshot.nclcEstimates.L)}
            {renderResultSkill("R", "placement.result.skillReading", resultSnapshot.levels.R, resultSnapshot.states.R, resultSnapshot.nclcEstimates.R)}
            {renderResultSkill("W", "placement.result.skillWriting", resultSnapshot.levels.W, resultSnapshot.states.W, resultSnapshot.nclcEstimates.W)}
            {renderResultSkill("S", "placement.result.skillSpeaking", resultSnapshot.levels.S, resultSnapshot.states.S, resultSnapshot.nclcEstimates.S)}
          </div>
          {resultSnapshot.grammarLevel && (
            <div className="mt-4 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("placement.result.grammarDiagnostic")}</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">{displayResultLevel(resultSnapshot.grammarLevel)}</p>
                </div>
                {resultSnapshot.grammarScore && <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-foreground">{t("placement.result.score").replace("{correct}", String(resultSnapshot.grammarScore.correct)).replace("{total}", String(resultSnapshot.grammarScore.total))}</span>}
              </div>
            </div>
          )}
          {profile?.track !== "general" && <p className="mt-4 rounded-xl border border-primary/10 bg-[#FAF9F5] px-4 py-3 text-xs leading-5 text-muted-foreground">{t("placement.result.nclcNote")}</p>}
          <div className="mt-4 rounded-xl border border-[#F2CDC7] bg-[#FFF5F2] px-4 py-3 text-xs leading-5 text-[#75413D]">
            <p>{t(resultSnapshot.states.L === "transcript_only" ? "placement.result.transcriptCaveat" : "placement.result.listeningCaveat")}</p>
            <p className="mt-2">{t("placement.result.demoCaveat")}</p>
          </div>
          {resultSnapshot.feedback.W && (
            <div className="mt-4 rounded-2xl border border-[#B9D9CB] bg-[#F0F8F4] p-4 sm:p-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#287252]">{t("placement.result.writingFeedback")}</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{resultSnapshot.feedback.W}</p>
            </div>
          )}
          {retakeGate?.blocked && retakeGate.availableAt && (
            <p className="mt-5 rounded-xl border border-primary/10 bg-[#EEF2FA] px-4 py-3 text-sm leading-6 text-foreground">
              {t("placement.result.retakeAvailable").replace("{date}", formatRetakeDate(retakeGate.availableAt))}
            </p>
          )}
          <div className="mt-7 flex flex-col gap-3 border-t border-primary/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/learner" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("placement.backToSpace")}
            </Link>
            <Link to="/learner" className="parle-button-primary w-full justify-center sm:w-auto">
              {t("placement.result.roadmapCta")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </motion.section>
    );
  }

  function renderPreparing() {
    return (
      <motion.section key="preparing" initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.7rem] border border-primary/10 bg-white px-5 py-10 text-center shadow-[0_24px_68px_-46px_rgba(30,58,138,0.4)] sm:px-10 sm:py-14">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#EEF2FA] text-primary"><Clock3 aria-hidden="true" className="h-7 w-7" /></span>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("placement.result.eyebrow")}</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("placement.preparing.title")}</h1>
        <button type="button" onClick={() => setScreen("result")} className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("placement.preparing.back")}
        </button>
      </motion.section>
    );
  }

  function renderError() {
    return (
      <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><AlertCircle aria-hidden="true" className="h-6 w-6" /></span>
        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("placement.error.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(loadingError ?? "placement.error.load")}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          {retryMode === "load" && <button type="button" onClick={() => void loadTestData()} className="parle-button-primary justify-center">{t("placement.error.retry")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>}
          {retryMode === "save" && <button type="button" onClick={() => void saveCompletedResult()} disabled={saveBusy} className="parle-button-primary justify-center">{t("placement.error.retry")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>}
          <Link to="/learner" className="parle-button-secondary justify-center">{t("placement.backToSpace")}</Link>
        </div>
      </section>
    );
  }

  function renderAccess() {
    return (
      <section className="rounded-[1.6rem] border border-primary/10 bg-white p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></span>
        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("placement.access.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("placement.access.body")}</p>
        <Link to="/onboarding" className="parle-button-primary mt-6 justify-center">{t("placement.access.onboardingLink")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </section>
    );
  }

  const showAssessmentRail = screen !== "loading" && screen !== "error" && screen !== "access";

  return (
    <div className="min-h-screen overflow-hidden bg-[#F7F8FB] text-foreground">
      <header className="border-b border-primary/10 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:min-h-[76px] sm:px-6 lg:px-8">
          <Brand compact />
          <div className="flex items-center gap-2 rounded-full border border-primary/10 bg-white px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-primary sm:px-4">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-[#C64D43]" />
            <span>{t("placement.demoBadge")}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {screen === "loading" ? (
          <div role="status" aria-live="polite" className="mx-auto max-w-xl rounded-[1.6rem] border border-primary/10 bg-white p-8 text-center shadow-sm">
            <Loader2 aria-hidden="true" className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-4 text-sm font-bold text-primary">{t("placement.loading")}</p>
          </div>
        ) : screen === "access" ? renderAccess() : screen === "error" ? renderError() : (
          <div className={`grid items-start gap-5 lg:gap-7 ${showAssessmentRail ? "lg:grid-cols-[270px_minmax(0,1fr)]" : ""}`}>
            {showAssessmentRail && renderProgressRail()}
            <div className="min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                {screen === "section_intro" && <div key={`section-${currentSection}`}>{renderSectionIntro()}</div>}
                {screen === "question" && renderQuestion()}
                {screen === "writing" && renderWriting()}
                {screen === "speaking" && renderSpeaking()}
                {screen === "saving" && (
                  <div key="saving" role="status" aria-live="polite" className="rounded-[1.6rem] border border-primary/10 bg-white p-8 text-center shadow-sm">
                    <Loader2 aria-hidden="true" className="mx-auto h-7 w-7 animate-spin text-primary" />
                    <p className="mt-4 text-sm font-bold text-primary">{t("placement.saving")}</p>
                  </div>
                )}
                {screen === "result" && <div key="result-view">{renderResults()}</div>}
                {screen === "preparing" && <div key="preparing-view">{renderPreparing()}</div>}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs leading-5 text-muted-foreground sm:px-6 lg:px-8">
        {t("placement.footer")}
      </footer>
    </div>
  );
}
