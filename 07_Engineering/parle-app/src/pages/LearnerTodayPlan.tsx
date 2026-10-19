import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  Clock3,
  Flag,
  Headphones,
  Info,
  LoaderCircle,
  MessageCircle,
  Mic2,
  PenLine,
  RefreshCw,
  SkipForward,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import LessonBookingCard from "@/components/parle/LessonBookingCard";
import { SpeakingTaskPanel } from "@/components/parle/SpeakingTaskPanel";
import { ListeningAudioButton } from "@/components/parle/ListeningAudioButton";
import { dateKeyInTimeZone, loadLearnerLessons, type ParleBooking } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";
import { completedMinutesForLocalDate, completedMinutesForLocalDateRange, formatCalendarDate, formatLearnerLevel, formatTaskCountLabel, scheduledMinutesForTasks } from "@/lib/learner-display";
import { needsOnboarding } from "@/lib/onboarding-steps";
import { getOrCreateMyLearnerPlan, markMyLearnerTaskDone, prepareMyTaskContent, skipMyLearnerTask, submitMyTaskPracticeReport, todayLevelHeadingKey, type LearnerPlanView, type LearnerTaskView, type PracticeContent, type PracticeReportCategory } from "@/lib/learner-plan-remote";
import { pendingTaskIds, prepareTasks, withPreparedTask } from "@/lib/task-content-queue";
import { loadMyLearnerCoachNote, type LearnerCoachNote } from "@/lib/learner-coach-note";
import { gradePracticeAnswer, type SkillKey, type TaskType } from "@/lib/roadmap-engine";

const SKILL_KEYS: SkillKey[] = ["listening", "reading", "writing", "speaking"];
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
const skillIcons: Record<SkillKey, typeof Headphones> = {
  listening: Headphones,
  reading: BookOpenText,
  writing: PenLine,
  speaking: Mic2,
};
const topicKeys: Record<string, TranslationKey> = {
  work: "learner.topic.work",
  housing: "learner.topic.housing",
  services: "learner.topic.services",
  opinions: "learner.topic.opinions",
  everyday_life: "learner.topic.everydayLife",
  community: "learner.topic.community",
  appointments: "learner.topic.appointments",
  personal_history: "learner.topic.personalHistory",
  general_conversation: "learner.topic.generalConversation",
  canada_immigration: "onboarding.goal.immigration",
  canadian_citizenship: "onboarding.goal.citizenship",
  conversation: "onboarding.goal.conversation",
  general_fluency: "onboarding.goal.general",
  work_goal: "onboarding.goal.work",
  job_interview: "onboarding.goal.interview",
  school: "onboarding.goal.school",
  other: "onboarding.goal.other",
  individual_feedback: "learner.topic.tutorFeedback",
  weekly_review: "learner.content.checkInTitle",
};
const checkInKindKeys: Record<string, TranslationKey> = {
  listening: "learner.content.kind.listening",
  reading: "learner.content.kind.reading",
  grammar: "learner.content.kind.grammar",
  speaking: "learner.content.kind.speaking",
  writing: "learner.content.kind.writing",
};
const tutorWindowKeys: Record<string, TranslationKey> = {
  weekday_morning: "learner.today.tutorWindow.weekdayMorning",
  weekday_afternoon: "learner.today.tutorWindow.weekdayAfternoon",
  weekday_evening: "learner.today.tutorWindow.weekdayEvening",
  weekend_morning: "learner.today.tutorWindow.weekendMorning",
  weekend_afternoon: "learner.today.tutorWindow.weekendAfternoon",
  weekend_evening: "learner.today.tutorWindow.weekendEvening",
};

function localDateLabel(value: string): string {
  return formatCalendarDate(value, { weekday: "long", month: "short", day: "numeric" });
}

function skillLabel(skill: SkillKey): string {
  return t(`learner.skill.${skill}` as TranslationKey);
}

function topicLabel(topic: string): string {
  const key = topicKeys[topic];
  return key ? t(key) : topic;
}

function checkInKindLabel(kind: string): string {
  return t(checkInKindKeys[kind] ?? "learner.content.kind.practice");
}

function tutorWindowLabel(window: string): string {
  const key = tutorWindowKeys[window];
  return key ? t(key) : t("learner.today.flexibleSuggestion");
}

function reasonText(task: LearnerTaskView): string {
  if (task.reason === "biggest_gap" && task.reasonSkill) {
    return t("learner.today.reason.biggestGap").replace("{skill}", skillLabel(task.reasonSkill));
  }
  const reasonKeys: Record<string, TranslationKey> = {
    weekly_practice: "learner.today.reason.weeklyPractice",
    speaking_check: "learner.today.reason.speakingCheck",
    weekly_checkin: "learner.today.reason.weeklyCheckin",
    tutor_suggestion: "learner.today.reason.tutorSuggestion",
  };
  return t(reasonKeys[task.reason] ?? "learner.today.reason.weeklyPractice");
}

function timeLabel(minutes: number): string {
  return t("learner.today.minutesShort").replace("{minutes}", String(minutes));
}

function formatHours(hours: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(hours);
}

function contentHasDetails(content: PracticeContent): boolean {
  return Boolean(content.text || content.vocabulary?.length || content.questions?.length || content.steps?.length || content.items?.length);
}

type PracticeAnswers = Record<number, string>;
type VocabularyResponses = Record<number, "recalled" | "review">;
type VocabularyRevealState = Record<number, boolean>;

function PracticeQuestions({
  taskId,
  questions,
  answers,
  onAnswer,
  disabled,
}: {
  taskId: string;
  questions: NonNullable<PracticeContent["questions"]>;
  answers: PracticeAnswers;
  onAnswer: (index: number, optionId: string) => void;
  disabled: boolean;
}) {
  if (!questions.length) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{t("learner.practice.chooseAnswer")}</p>
      {questions.map((question, index) => {
        const selectedOptionId = answers[index];
        const feedback = selectedOptionId
          ? gradePracticeAnswer(question.options, question.answerOptionId, selectedOptionId)
          : null;
        const correctOption = question.options.find((option) => option.id === feedback?.correctOptionId);

        return (
          <fieldset key={index} className="min-w-0 rounded-xl bg-white p-3 sm:p-4">
            <legend className="max-w-full text-sm font-bold leading-5 text-foreground">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">
                {t("learner.practice.questionLabel").replace("{number}", String(index + 1))}
              </span>
              <span className="mt-1 block break-words">{question.prompt}</span>
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const isSelected = selectedOptionId === option.id;
                const answerStyle = isSelected
                  ? feedback?.correct
                    ? "border-[#B9D9CB] bg-[#F0F8F4]"
                    : "border-[#F0C5C0] bg-[#FFF5F2]"
                  : "border-primary/10 bg-[#FAF9F5] hover:border-primary/25 hover:bg-white";
                return (
                  <label key={option.id} className="block min-w-0 cursor-pointer">
                    <input
                      type="radio"
                      name={`${taskId}-practice-question-${index}`}
                      value={option.id}
                      checked={isSelected}
                      onChange={() => onAnswer(index, option.id)}
                      disabled={disabled || Boolean(selectedOptionId)}
                      className="peer sr-only"
                    />
                    <span className={`flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm leading-5 text-foreground transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-80 ${answerStyle}`}>
                      <span className="break-words">{option.text}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {feedback && correctOption && (
              <div role="status" aria-live="polite" className={`mt-3 rounded-xl px-3.5 py-3 text-xs leading-5 ${feedback.correct ? "bg-[#E7F4ED] text-[#205D45]" : "bg-[#FFF5F2] text-[#75413D]"}`}>
                <p className="font-extrabold">
                  {t(feedback.correct ? "learner.practice.feedbackCorrect" : "learner.practice.feedbackIncorrect")
                    .replace("{answer}", correctOption.text)}
                </p>
                {question.explanation && (
                  <p className="mt-1.5"><span className="font-extrabold">{t("learner.practice.explanationLabel")}</span> {question.explanation}</p>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function VocabularySelfCheck({
  items,
  revealed,
  responses,
  onReveal,
  onResponse,
  disabled,
}: {
  items: NonNullable<PracticeContent["vocabulary"]>;
  revealed: VocabularyRevealState;
  responses: VocabularyResponses;
  onReveal: (index: number) => void;
  onResponse: (index: number, response: "recalled" | "review") => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">{t("learner.practice.vocabularyInstruction")}</p>
      <ul className="space-y-2" aria-label={t("learner.content.vocabularyLabel")}>
        {items.map((item, index) => {
          const response = responses[index];
          return (
            <li key={`${item.term}-${index}`} className="rounded-xl bg-white p-3">
              <strong className="break-words text-sm text-primary">{item.term}</strong>
              {item.example && <p className="mt-1 break-words text-xs leading-5 text-foreground">{item.example}</p>}
              {revealed[index] ? (
                <div className="mt-3 rounded-lg bg-[#EEF2FA] px-3 py-2.5">
                  <p className="break-words text-sm font-semibold text-primary">{item.meaning}</p>
                  {item.example && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.example}</p>}
                </div>
              ) : (
                <button type="button" onClick={() => onReveal(index)} disabled={disabled} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-primary/15 bg-white px-4 py-2 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60">
                  {t("learner.practice.revealMeaning")}
                </button>
              )}
              {revealed[index] && !response && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onResponse(index, "recalled")} disabled={disabled} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60">
                    {t("learner.practice.knewIt")}
                  </button>
                  <button type="button" onClick={() => onResponse(index, "review")} disabled={disabled} className="inline-flex min-h-11 items-center rounded-full border border-primary/15 bg-white px-4 py-2 text-xs font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60">
                    {t("learner.practice.needReview")}
                  </button>
                </div>
              )}
              {response && (
                <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-[#E7F4ED] px-3 py-2.5 text-xs font-semibold leading-5 text-[#287252]">
                  {t(response === "recalled" ? "learner.practice.vocabularyRecalled" : "learner.practice.vocabularyReview")
                    .replace("{term}", item.term)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TaskContent({
  task,
  answers,
  onAnswer,
  vocabularyRevealed,
  vocabularyResponses,
  onRevealVocabulary,
  onRateVocabulary,
}: {
  task: LearnerTaskView;
  answers: PracticeAnswers;
  onAnswer: (index: number, optionId: string) => void;
  vocabularyRevealed: VocabularyRevealState;
  vocabularyResponses: VocabularyResponses;
  onRevealVocabulary: (index: number) => void;
  onRateVocabulary: (index: number, response: "recalled" | "review") => void;
}) {
  const content = task.content;
  if (task.contentSource === "pending") {
    // a card skipped or done before its practice arrived is never prepared: no waiting note (final review)
    if (task.status !== "planned" && task.status !== "rolled") return null;
    return <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#EEF2FA] px-4 py-3 text-sm leading-6 text-primary"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("learner.content.preparing")}</p>;
  }
  if (task.contentSource === "unavailable") {
    return <p className="mt-4 rounded-xl bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#75413D]">{t("learner.content.unavailable")}</p>;
  }
  if (!contentHasDetails(content)) return null;

  const questions = content.questions ?? [];
  const vocabulary = content.vocabulary ?? [];
  const vocabularyOnly = task.type === "vocabulary_drill" && questions.length === 0 && vocabulary.length > 0;
  const practiceDisabled = task.status === "done" || task.status === "skipped" || task.status === "dropped";

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
      {task.contentSource !== "plan_only" && (
        <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
          {task.contentSource === "generated" ? <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#C64D43]" /> : <BookOpenText aria-hidden="true" className="h-3.5 w-3.5 text-primary" />}
          {t(task.contentSource === "generated" ? "learner.content.generatedLabel" : "learner.content.bankLabel")}
        </p>
      )}
      {content.title && <h4 className="font-display text-sm font-extrabold text-primary">{content.title}</h4>}
      {content.instructions && <p className="text-sm leading-6 text-foreground">{content.instructions}</p>}
      {content.text && (
        <div>
          {task.type === "listening_exercise" && <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.11em] text-muted-foreground">{t("learner.content.transcriptLabel")}</p>}
          {task.type === "listening_exercise" && <ListeningAudioButton kind="learner_task" id={task.id} />}
          <p className="whitespace-pre-line break-words text-sm leading-6 text-foreground">{content.text}</p>
        </div>
      )}
      {vocabulary.length > 0 && (vocabularyOnly ? (
        <VocabularySelfCheck
          items={vocabulary}
          revealed={vocabularyRevealed}
          responses={vocabularyResponses}
          onReveal={onRevealVocabulary}
          onResponse={onRateVocabulary}
          disabled={practiceDisabled}
        />
      ) : (
        <ul className="space-y-3" aria-label={t("learner.content.vocabularyLabel")}>
          {vocabulary.map((item, index) => (
            <li key={`${item.term}-${index}`} className="border-t border-primary/10 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <strong className="text-sm text-primary">{item.term}</strong>
                <span className="text-xs font-semibold text-muted-foreground">{item.meaning}</span>
              </div>
              {item.example && <p className="mt-1 text-xs leading-5 text-foreground">{item.example}</p>}
            </li>
          ))}
        </ul>
      ))}
      {questions.length > 0 && (
        <PracticeQuestions taskId={task.id} questions={questions} answers={answers} onAnswer={onAnswer} disabled={practiceDisabled} />
      )}
      {Boolean(content.steps?.length) && (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground">
          {content.steps?.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
        </ol>
      )}
      {Boolean(content.items?.length) && (
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-muted-foreground">{t("learner.content.bankItemsLabel").replace("{count}", String(content.items?.length ?? 0))}</p>
          {content.items?.slice(0, 3).map((item, index) => (
            <div key={`${item.demo_code}-${index}`} className="rounded-xl bg-white p-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{checkInKindLabel(item.kind)}</span>
              <p className="mt-1 whitespace-pre-line break-words text-sm leading-5 text-foreground">{item.text}</p>
            </div>
          ))}
          {(content.items?.length ?? 0) > 3 && <p className="text-xs text-muted-foreground">{t("learner.content.bankMore").replace("{count}", String((content.items?.length ?? 0) - 3))}</p>}
        </div>
      )}
    </div>
  );
}

function TaskReport({ task }: { task: LearnerTaskView }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<PracticeReportCategory>("content_issue");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const submitInFlight = useRef(false);
  const formId = `task-report-${task.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const taskLabel = t(taskTypeKeys[task.type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSending(true);
    setError(false);
    try {
      await submitMyTaskPracticeReport({ taskId: task.id, category, note });
      setSent(true);
      setOpen(false);
    } catch (submitError) {
      console.error("Parle practice report could not be saved", submitError);
      setError(true);
    } finally {
      submitInFlight.current = false;
      setSending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-primary/10 pt-3">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (sending && !nextOpen) return;
          if (nextOpen) setError(false);
          setOpen(nextOpen);
        }}
      >
        {sent ? (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-[#E7F4ED] px-3.5 py-3 text-xs leading-5 text-[#287252]">
            <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("learner.report.sent")}</span>
          </p>
        ) : (
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t("learner.report.triggerLabel").replace("{task}", taskLabel)}
              className="inline-flex min-h-11 w-full items-center gap-2 rounded-full px-3 text-left text-xs font-extrabold text-[#A13F36] transition hover:bg-[#FFF0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C64D43] sm:w-auto"
            >
              <Flag aria-hidden="true" className="h-3.5 w-3.5" />
              {t("learner.today.reportProblem")}
            </button>
          </DialogTrigger>
        )}
        <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md gap-5 overflow-y-auto rounded-[1.5rem] border-primary/10 bg-[#FFFEFC] p-5 shadow-[0_26px_70px_-42px_rgba(30,58,138,0.65)] sm:p-6">
          <DialogHeader className="flex-row items-start gap-3 space-y-0 pr-8 text-left sm:pr-10">
            <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]">
              <Flag className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-display text-xl font-extrabold leading-tight tracking-[-0.035em] text-primary">{t("learner.report.dialogTitle")}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("learner.report.dialogDescription").replace("{task}", taskLabel)}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={submit} aria-busy={sending} className="space-y-4">
            <div>
              <label htmlFor={`${formId}-category`} className="mb-1.5 block text-xs font-bold text-foreground">{t("learner.report.categoryLabel")}</label>
              <select
                id={`${formId}-category`}
                name="category"
                required
                value={category}
                onChange={(event) => setCategory(event.target.value as PracticeReportCategory)}
                className="min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="content_issue">{t("learner.report.category.contentIssue")}</option>
                <option value="wrong_answer">{t("learner.report.category.wrongAnswer")}</option>
                <option value="technical_problem">{t("learner.report.category.technical")}</option>
                <option value="other">{t("learner.report.category.other")}</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${formId}-note`} className="mb-1.5 block text-xs font-bold text-foreground">{t("learner.report.noteLabel")}</label>
              <textarea
                id={`${formId}-note`}
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 240))}
                maxLength={240}
                rows={3}
                aria-describedby={`${formId}-note-count`}
                placeholder={t("learner.report.notePlaceholder")}
                className="w-full resize-y rounded-xl border border-primary/15 bg-white px-3 py-2.5 text-sm leading-5 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <p id={`${formId}-note-count`} aria-live="polite" className="mt-1 text-right text-[10px] text-muted-foreground">{t("learner.report.noteCount").replace("{count}", String(note.length))}</p>
            </div>
            <p className="rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-[11px] leading-5 text-muted-foreground">{t("learner.report.privacyNote")}</p>
            {error && <p role="alert" className="text-xs leading-5 text-[#8D342D]">{t("learner.report.error")}</p>}
            <div className="flex flex-col gap-2 border-t border-primary/10 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} disabled={sending} className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2 text-xs font-bold text-muted-foreground transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60 sm:w-auto">{t("learner.report.close")}</button>
              <button type="submit" disabled={sending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                {sending && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
                {t(sending ? "learner.report.sending" : "learner.report.submit")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TaskCardAction = "done" | "skipped";

function TaskCard({
  task,
  onAction,
  busy,
  actionsBlocked,
  actionError,
}: {
  task: LearnerTaskView;
  onAction: (task: LearnerTaskView, action: TaskCardAction) => void;
  busy: boolean;
  actionsBlocked: boolean;
  actionError: boolean;
}) {
  const [answers, setAnswers] = useState<PracticeAnswers>({});
  const [vocabularyRevealed, setVocabularyRevealed] = useState<VocabularyRevealState>({});
  const [vocabularyResponses, setVocabularyResponses] = useState<VocabularyResponses>({});
  const questions = task.content.questions ?? [];
  const vocabulary = task.content.vocabulary ?? [];
  const isVocabularySelfCheck = task.type === "vocabulary_drill" && questions.length === 0 && vocabulary.length > 0;
  const isAnswerablePractice = task.type === "vocabulary_drill" || task.type === "listening_exercise";
  const isActionable = task.status === "planned" || task.status === "rolled" || task.status === "suggested";
  const answeredQuestionCount = questions.reduce((count, _question, index) => count + (answers[index] ? 1 : 0), 0);
  const reviewedVocabularyCount = vocabulary.reduce((count, _item, index) => count + (vocabularyResponses[index] ? 1 : 0), 0);
  const hasPracticeItems = questions.length > 0 || isVocabularySelfCheck;
  const practiceComplete = questions.length > 0
    ? answeredQuestionCount === questions.length
    : isVocabularySelfCheck && reviewedVocabularyCount === vocabulary.length;
  const needsPracticeAnswers = isActionable && isAnswerablePractice && hasPracticeItems && !practiceComplete;
  const canMarkDone = isActionable && task.type !== "weekly_checkin" && task.type !== "tutor_lesson" && (!isAnswerablePractice || (hasPracticeItems && practiceComplete));
  const canSkip = isActionable;
  const tutorMode = task.type === "ai_lesson"
    ? "lesson"
    : task.type === "speaking_practice"
      ? "speaking"
      : task.type === "writing"
        ? "writing"
        : null;
  const isTutorSuggestion = task.type === "tutor_lesson" || task.status === "suggested";
  const Icon = task.skill ? skillIcons[task.skill] : task.type === "tutor_lesson" ? UsersRound : task.type === "weekly_checkin" ? CalendarDays : MessageCircle;
  const iconClass = task.status === "done"
    ? "bg-[#E7F4ED] text-[#287252]"
    : task.status === "skipped"
      ? "bg-[#F7F8FB] text-muted-foreground"
      : "bg-[#EEF2FA] text-primary";
  const cardBorder = task.status === "done"
    ? "border-[#B9D9CB]"
    : task.status === "skipped"
      ? "border-primary/10"
      : "border-primary/10 hover:border-primary/20";

  return (
    <article className={`rounded-[1.45rem] border bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.45)] transition sm:p-5 ${cardBorder}`} aria-busy={busy}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
          {task.status === "done" ? <Check aria-hidden="true" className="h-5 w-5" /> : task.status === "skipped" ? <SkipForward aria-hidden="true" className="h-5 w-5" /> : <Icon aria-hidden="true" className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-display text-base font-extrabold leading-5 tracking-[-0.025em] text-primary">{t(taskTypeKeys[task.type])}</h3>
            {isTutorSuggestion && <span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.11em] text-[#8D342D]">{t("learner.today.suggested")}</span>}
            {task.status === "done" && <span className="rounded-full bg-[#E7F4ED] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.11em] text-[#287252]">{t("learner.today.done")}</span>}
            {task.status === "skipped" && <span className="rounded-full bg-[#F7F8FB] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.11em] text-muted-foreground">{t("learner.today.skipped")}</span>}
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{task.skill ? skillLabel(task.skill) : t("learner.today.allSkills")} <span aria-hidden="true">·</span> {timeLabel(task.minutes)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[#F7F8FB] px-3.5 py-3">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.today.topicLabel")}</p>
          <p className="mt-1 break-words text-sm font-bold text-foreground">{topicLabel(task.topic)}</p>
        </div>
        <div className="rounded-xl bg-[#F7F8FB] px-3.5 py-3">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.today.reasonLabel")}</p>
          <p className="mt-1 text-sm leading-5 text-foreground">{reasonText(task)}</p>
        </div>
      </div>

      {task.type === "tutor_lesson" && (
        <div className="mt-3 rounded-xl border border-[#F2CDC7] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D]">
          <p>{t("learner.today.tutorNotBooked")}</p>
          {task.tutorWindow && <p className="mt-1 font-bold">{t("learner.today.tutorWindowNote").replace("{window}", tutorWindowLabel(task.tutorWindow))}</p>}
          <Link to="/learner/tutors" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E9BDB6] bg-white px-4 py-2 text-xs font-extrabold text-[#8D342D] transition hover:bg-[#FFF0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C64D43]">
            {t("learner.today.openTutors")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      {task.type !== "weekly_checkin" && (
        <TaskContent
          task={task}
          answers={answers}
          onAnswer={(index, optionId) => setAnswers((current) => current[index] ? current : { ...current, [index]: optionId })}
          vocabularyRevealed={vocabularyRevealed}
          vocabularyResponses={vocabularyResponses}
          onRevealVocabulary={(index) => setVocabularyRevealed((current) => ({ ...current, [index]: true }))}
          onRateVocabulary={(index, response) => setVocabularyResponses((current) => current[index] ? current : { ...current, [index]: response })}
        />
      )}

      {(task.type === "speaking_practice" || task.type === "speaking_check") && task.contentSource !== "pending" && (isActionable || task.status === "done") && (
        <SpeakingTaskPanel task={task} onScored={() => onAction(task, "done")} disabled={actionsBlocked} />
      )}

      {needsPracticeAnswers && (
        <p className="mt-3 rounded-xl bg-[#EEF2FA] px-3.5 py-3 text-xs leading-5 text-primary">{t("learner.practice.answerAll")}</p>
      )}
      {isActionable && isAnswerablePractice && hasPracticeItems && practiceComplete && (
        <p role="status" className="mt-3 rounded-xl bg-[#E7F4ED] px-3.5 py-3 text-xs font-semibold leading-5 text-[#287252]">{t("learner.practice.answersComplete")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {tutorMode && isActionable && (
          <Link to={`/learner/ai-tutor?mode=${tutorMode}&task_id=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {t("learner.today.openTutor")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}
        {canMarkDone && (
          <button type="button" onClick={() => onAction(task, "done")} disabled={actionsBlocked} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-2 text-xs font-extrabold text-[#287252] transition hover:bg-[#E7F4ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#287252] disabled:cursor-wait disabled:opacity-60">
            {busy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
            {t(busy ? "learner.today.savingDone" : "learner.today.markDone")}
          </button>
        )}
        {canSkip && (
          <button type="button" onClick={() => onAction(task, "skipped")} disabled={actionsBlocked} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/15 bg-white px-4 py-2 text-xs font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60">
            {busy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />}
            {t(busy ? "learner.today.savingDone" : "learner.today.skipTask")}
          </button>
        )}
        {task.type === "weekly_checkin" && (
          <Link to="/learner/check-in" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
            {t(task.status === "done" ? "learner.today.reviewCheckIn" : "learner.today.openCheckIn")}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {task.status === "done" && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-[#E7F4ED] px-3.5 py-3 text-xs leading-5 text-[#287252]">
          <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("learner.today.doneStatus").replace("{minutes}", String(task.minutes))}</span>
        </p>
      )}
      {task.status === "skipped" && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <SkipForward aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("learner.today.skippedStatus")}</span>
        </p>
      )}
      {actionError && <p role="alert" className="mt-3 rounded-xl border border-[#F0C5C0] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#8D342D]">{t("learner.today.taskActionError")}</p>}
      <TaskReport task={task} />
    </article>
  );
}

function FeasibilityCard({ plan }: { plan: LearnerPlanView }) {
  const feasibility = plan.feasibility;
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
  const ratio = feasibility.ratio === null ? null : Math.max(0, Math.min(100, feasibility.ratio * 100));
  const date = feasibility.targetDate ?? feasibility.projectedDate;
  return (
    <section className="rounded-[1.5rem] border border-primary/10 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-6" aria-labelledby="feasibility-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Target aria-hidden="true" className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("learner.feasibility.eyebrow")}</p>
            <h2 id="feasibility-title" className="mt-1 font-display text-base font-extrabold text-primary">{t("learner.feasibility.title")}</h2>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] ${badgeClass}`}>{t(statusKey[feasibility.status] ?? "learner.feasibility.projected")}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-foreground">
        {date
          ? t(feasibility.targetDate ? "learner.feasibility.targetDate" : "learner.feasibility.projectedDate").replace("{date}", localDateLabel(date))
          : t("learner.feasibility.noProjection")}
      </p>
      {ratio !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
            <span>{t("learner.feasibility.availableHours").replace("{hours}", formatHours(feasibility.availableHours))}</span>
            <span>{t("learner.feasibility.requiredHours").replace("{hours}", formatHours(feasibility.requiredHours))}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="img" aria-label={t("learner.feasibility.ratioLabel").replace("{percent}", String(Math.round(ratio)))}>
            <div className={`h-full rounded-full transition-all ${feasibility.status === "unlikely" ? "bg-[#F97362]" : "bg-primary"}`} style={{ width: `${ratio}%` }} />
          </div>
        </div>
      )}
      {feasibility.status === "unlikely" && (
        <div className="mt-4 space-y-2 rounded-xl bg-[#FFF5F2] p-3.5 text-xs leading-5 text-[#75413D]">
          <p>{typeof feasibility.minutesPerDayNeeded === "number" ? t("learner.feasibility.minutesOption").replace("{minutes}", String(feasibility.minutesPerDayNeeded)) : t("learner.feasibility.minutesUnavailable")}</p>
          <p>{feasibility.realisticDate ? t("learner.feasibility.realisticOption").replace("{date}", localDateLabel(feasibility.realisticDate)) : t("learner.feasibility.realisticUnavailable")}</p>
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("learner.feasibility.guidedHoursNote")}
      </p>
    </section>
  );
}

export function TodayLevelSummary({ plan }: {
  plan: Pick<LearnerPlanView, "hasScoredAssessment" | "current" | "track" | "skillStates">;
}) {
  return (
    <div className="mt-4 min-w-0">
      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#FFC0B4]" />{t(todayLevelHeadingKey(plan.hasScoredAssessment))}
      </p>
      <ul className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:max-w-[34rem] sm:grid-cols-4">
        {SKILL_KEYS.map((skill) => {
          const Icon = skillIcons[skill];
          const isUnassessedSpeaking = skill === "speaking" && plan.skillStates.speaking === "not_assessed";
          const level = isUnassessedSpeaking
            ? t("learner.progress.levelNotYetAssessed")
            : formatLearnerLevel(plan.current[skill], plan.track);
          return (
            <li key={skill} className="min-w-0 rounded-xl border border-white/15 bg-white/10 px-2.5 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-extrabold text-white/80">
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#FFC0B4]" />
                <span className="min-w-0 break-words">{skillLabel(skill)}</span>
              </div>
              <p className="mt-1 break-words text-xs font-bold leading-5 text-white [overflow-wrap:anywhere]">{level}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] font-semibold leading-4 text-white/70">{t("learner.today.estimateCaveat")}</p>
    </div>
  );
}

export function TodayCoachNoteCard({ note, loading }: {
  note: LearnerCoachNote | null;
  loading: boolean;
}) {
  const generatedText = !loading && note?.status === "generated" ? note.text : "";

  return (
    <section
      className="min-w-0 rounded-[1.35rem] border border-[#F1D3CB] bg-gradient-to-br from-[#FFF9F6] to-white px-4 py-4 shadow-[0_14px_38px_-30px_rgba(124,55,48,0.45)] sm:px-5"
      aria-labelledby="today-coach-note-title"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCE7E3] text-[#A13F36]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="today-coach-note-title" className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#A13F36]">
            {t("learner.today.coachNoteTitle")}
          </h3>
          {loading ? (
            <p role="status" className="mt-1.5 break-words text-sm leading-6 text-[#75413D] [overflow-wrap:anywhere]">
              {t("learner.today.coachNoteLoading")}
            </p>
          ) : generatedText ? (
            <>
              <p className="mt-1.5 min-w-0 break-words text-sm leading-6 text-[#4E3937] [overflow-wrap:anywhere]">
                {generatedText}
              </p>
              <p className="mt-2 break-words text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                {t("learner.today.coachNoteDisclaimer")}
              </p>
            </>
          ) : (
            <p className="mt-1.5 break-words text-sm leading-6 text-[#75413D] [overflow-wrap:anywhere]">
              {t("learner.today.coachNoteFallback")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function LearnerTodayPlan() {
  const [plan, setPlan] = useState<LearnerPlanView | null>(null);
  const [bookings, setBookings] = useState<ParleBooking[]>([]);
  const [bookingLoadError, setBookingLoadError] = useState(false);
  const [bookingReload, setBookingReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [actionErrorTaskId, setActionErrorTaskId] = useState<string | null>(null);
  const busyTaskIdRef = useRef<string | null>(null);
  const [coachNote, setCoachNote] = useState<LearnerCoachNote | null>(null);
  const [coachNoteLoading, setCoachNoteLoading] = useState(true);
  const coachNoteFlightRef = useRef<{ key: string; promise: Promise<LearnerCoachNote> } | null>(null);
  const coachNoteLoadedKeyRef = useRef<string | null>(null);
  const coachNoteRequestVersionRef = useRef(0);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getOrCreateMyLearnerPlan({ includeTaskHistory: true });
      setPlan(result);
    } catch (error) {
      if (needsOnboarding(error)) {
        setOnboardingNeeded(true);
        return;
      }
      console.error("Parle Today plan could not be loaded", error instanceof Error ? error.name : "unknown");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  // The plan is on screen; each pending card is filled as its content arrives, two at a time (A28, D1).
  const preparingRef = useRef(new Set<string>());
  const pendingKey = plan ? pendingTaskIds(plan).join(",") : "";
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(",").filter((id) => !preparingRef.current.has(id));
    ids.forEach((id) => preparingRef.current.add(id));
    void prepareTasks(
      ids,
      prepareMyTaskContent,
      (prepared) => setPlan((current) => (current ? withPreparedTask(current, prepared) : current)),
      (id) => setPlan((current) => (current
        ? { ...current, tasks: current.tasks.map((task) => (task.id === id ? { ...task, contentSource: "unavailable" as const } : task)) }
        : current)),
    );
  }, [pendingKey]);

  const coachNoteKey = plan
    ? JSON.stringify([plan.userId, plan.today, plan.timeZone, plan.weekPlanId])
    : "";

  useEffect(() => {
    if (!coachNoteKey || coachNoteLoadedKeyRef.current === coachNoteKey) return;
    const requestVersion = ++coachNoteRequestVersionRef.current;
    let flight = coachNoteFlightRef.current;
    if (!flight || flight.key !== coachNoteKey) {
      setCoachNote(null);
      setCoachNoteLoading(true);
      flight = { key: coachNoteKey, promise: loadMyLearnerCoachNote() };
      coachNoteFlightRef.current = flight;
    }

    const request = flight.promise;
    void request.then((result) => {
      if (coachNoteRequestVersionRef.current !== requestVersion) return;
      coachNoteLoadedKeyRef.current = coachNoteKey;
      setCoachNote(result);
    }).catch((error) => {
      console.warn("Parle Today Coach note could not be confirmed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      if (coachNoteRequestVersionRef.current === requestVersion) {
        coachNoteLoadedKeyRef.current = coachNoteKey;
        setCoachNote({ status: "fallback", text: "" });
      }
    }).finally(() => {
      if (coachNoteFlightRef.current?.promise === request) coachNoteFlightRef.current = null;
      if (coachNoteRequestVersionRef.current === requestVersion) setCoachNoteLoading(false);
    });

    return () => {
      if (coachNoteRequestVersionRef.current === requestVersion) coachNoteRequestVersionRef.current += 1;
    };
  }, [coachNoteKey]);

  const loadBookings = useCallback(async () => {
    setBookingLoadError(false);
    try {
      const result = await loadLearnerLessons();
      setBookings(result.lessons);
    } catch (error) {
      console.error("Parle Today lesson requests could not be loaded", error instanceof Error ? error.name : "unknown");
      setBookingLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings, bookingReload]);

  const todayBookings = useMemo(() => plan
    ? bookings.filter((booking) => booking.status === "confirmed" && dateKeyInTimeZone(booking.start_at, plan.timeZone) === plan.today)
    : [], [bookings, plan]);

  const todayTasks = useMemo(() => plan?.tasks.filter((task) => task.dateLocal === plan.today && task.status !== "dropped") ?? [], [plan]);
  const todayScheduledMinutes = useMemo(() => scheduledMinutesForTasks(todayTasks), [todayTasks]);
  const laterTasks = useMemo(() => plan?.tasks.filter((task) => task.dateLocal > (plan?.today ?? "") || (!task.dateLocal && task.type === "tutor_lesson")) ?? [], [plan]);
  const minuteHistory = plan?.taskHistory ?? plan?.tasks ?? [];
  const completedTodayMinutes = plan ? completedMinutesForLocalDate(minuteHistory, plan.today, plan.timeZone) : 0;
  const completedWeekMinutes = plan
    ? completedMinutesForLocalDateRange(minuteHistory, plan.weekStart, plan.weekEnd, plan.timeZone)
    : 0;
  const nextTaskDate = laterTasks.find((task) => task.dateLocal)?.dateLocal ?? "";
  const planStartsLater = Boolean(plan?.planStartDate && plan.planStartDate > plan.today);
  const goalKey: Record<string, TranslationKey> = {
    immigration: "onboarding.goal.immigration",
    citizenship: "onboarding.goal.citizenship",
    general: "onboarding.goal.general",
  };

  async function updateTaskStatus(task: LearnerTaskView, action: TaskCardAction) {
    if (busyTaskIdRef.current) return;
    if (task.status !== "planned" && task.status !== "rolled" && task.status !== "suggested") return;
    if (action === "done" && task.type === "weekly_checkin") return;

    busyTaskIdRef.current = task.id;
    setBusyTaskId(task.id);
    setActionErrorTaskId(null);
    try {
      let completedAtUtc: string | null = null;
      if (action === "done") completedAtUtc = await markMyLearnerTaskDone(task.id);
      else await skipMyLearnerTask(task.id);
      setPlan((current) => {
        if (!current) return current;
        const taskHistory = action === "done" && completedAtUtc
          ? [
              { id: task.id, status: "done", minutes: task.minutes, completedAtUtc },
              ...(current.taskHistory ?? []).filter((item) => item.id !== task.id),
            ]
          : current.taskHistory ?? [];
        return {
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id ? {
            ...item,
            status: action,
            ...(action === "done" && completedAtUtc ? { completedAtUtc } : {}),
          } : item),
          taskHistory,
        };
      });
    } catch (error) {
      console.error(`Parle practice task could not be marked ${action}`, error instanceof Error ? error.name : "unknown");
      setActionErrorTaskId(task.id);
    } finally {
      busyTaskIdRef.current = null;
      setBusyTaskId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[340px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite">
        <div className="text-center">
          <LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learner.today.loading")}</p>
        </div>
      </div>
    );
  }

  if (onboardingNeeded) {
    return (
      <section className="rounded-[1.6rem] border border-primary/10 bg-white p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Info aria-hidden="true" className="h-6 w-6" /></span>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.today.onboardingTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("learner.today.onboardingBody")}</p>
        <Link to="/onboarding" className="parle-button-primary mt-6 justify-center">{t("learner.today.onboardingButton")}</Link>
      </section>
    );
  }

  if (loadError || !plan) {
    return (
      <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Info aria-hidden="true" className="h-6 w-6" /></span>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("learner.today.errorTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("learner.today.errorBody")}</p>
        <button type="button" onClick={() => void loadPlan()} className="parle-button-primary mt-6 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learner.today.retry")}</button>
      </section>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }} className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.75)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[24px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-16 right-20 h-36 w-36 rounded-full bg-[#F97362]/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.today.eyebrow")}</p>
            <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("learner.today.planTitle")}</h2>
            <p className="mt-2 text-sm font-semibold text-white/80">{localDateLabel(plan.today)}</p>
            <TodayLevelSummary plan={plan} />
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFC0B4]/15 text-[#FFC0B4]"><Clock3 aria-hidden="true" className="h-5 w-5" /></span>
            <div>
              <p className="font-display text-2xl font-extrabold leading-none">{completedTodayMinutes}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">{t("learner.today.minutesToday")}</p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-xs font-semibold text-white/75">
          <span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t(goalKey[plan.track] ?? "onboarding.goal.general")}</span>
          <span>{t("learner.today.weekProgress").replace("{completed}", String(completedWeekMinutes))}</span>
        </div>
      </section>

      <TodayCoachNoteCard note={coachNote} loading={coachNoteLoading} />

      {plan.whatChangedNote && (
        <section className="rounded-[1.35rem] border border-[#F2CDC7] bg-[#FFF8F6] px-4 py-4 sm:px-5" aria-labelledby="what-changed-title">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCE7E3] text-[#A13F36]"><RefreshCw aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h3 id="what-changed-title" className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#A13F36]">{t("learner.today.whatChanged")}</h3>
              <p className="mt-1.5 break-words text-sm leading-6 text-[#75413D] [overflow-wrap:anywhere]">{plan.whatChangedNote}</p>
            </div>
          </div>
        </section>
      )}

      {(todayBookings.length > 0 || bookingLoadError) && (
        <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_16px_38px_-32px_rgba(30,58,138,0.4)] sm:p-5" aria-labelledby="today-bookings-title">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("learner.today.dayEyebrow")}</p>
              <h2 id="today-bookings-title" className="mt-1 font-display text-xl font-extrabold text-primary">{t("learner.today.bookingsHeading")}</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("learner.today.bookingsIntro")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#EEF2FA] px-3 py-1.5 text-[10px] font-bold text-primary">{t("learnerLessons.timeZone").replace("{zone}", plan.timeZone)}</span>
          </div>
          {bookingLoadError ? (
            <div role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] p-4">
              <p className="text-sm leading-6 text-[#8D342D]">{t("learner.today.bookingsLoadError")}</p>
              <button type="button" onClick={() => setBookingReload((value) => value + 1)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E9BDB6] bg-white px-4 py-2 text-xs font-extrabold text-[#8D342D] transition hover:bg-[#FFF0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C64D43]">
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.today.retryBookings")}
              </button>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">{todayBookings.map((booking) => <LessonBookingCard key={booking.id} booking={booking} timeZone={plan.timeZone} compact />)}</div>
          )}
        </section>
      )}

      {(plan.tutorFocusSkills?.length ?? 0) > 0 && (
        <p className="rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-4 py-3 text-sm leading-6 text-primary">
          {t("learner.today.tutorFocus", { skills: plan.tutorFocusSkills.map((skill) => t(`learner.skill.${skill}` as TranslationKey)).join(", ") })}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="today-tasks-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("learner.today.dayEyebrow")}</p>
                <h2 id="today-tasks-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("learner.today.todayHeading")}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF0EC] px-3 py-1.5 text-xs font-extrabold text-[#8D342D]">
                  <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("learner.today.scheduledToday").replace("{minutes}", String(todayScheduledMinutes))}
                </span>
                {todayTasks.length > 0 && <span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary">{formatTaskCountLabel(todayTasks.length, t("learner.today.taskCountSingular"), t("learner.today.taskCount"))}</span>}
              </div>
            </div>
            {todayTasks.length > 0 ? (
              <div className="space-y-3">
                {todayTasks.map((task) => <TaskCard key={task.id} task={task} onAction={updateTaskStatus} busy={busyTaskId === task.id} actionsBlocked={busyTaskId !== null} actionError={actionErrorTaskId === task.id} />)}
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-primary/20 bg-white p-5 sm:p-6">
                <p className="font-display text-base font-extrabold text-primary">
                  {planStartsLater
                    ? t("learner.today.planStarts").replace("{date}", localDateLabel(plan.planStartDate ?? ""))
                    : t("learner.today.restDayTitle")}
                </p>
                {!planStartsLater && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {nextTaskDate
                      ? t("learner.today.nextStudyDay").replace("{date}", localDateLabel(nextTaskDate))
                      : t("learner.today.noTasksToday")}
                  </p>
                )}
              </div>
            )}
          </section>

          {laterTasks.length > 0 && (
            <section aria-labelledby="later-tasks-title">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  {!planStartsLater && <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{t("learner.today.weekEyebrow")}</p>}
                  <h2 id="later-tasks-title" className={`${planStartsLater ? "" : "mt-1 "}font-display text-xl font-extrabold tracking-[-0.035em] text-primary`}>
                    {t(planStartsLater ? "learner.today.firstWeekHeading" : "learner.today.laterHeading")}
                  </h2>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">{localDateLabel(plan.weekStart)} – {localDateLabel(plan.weekEnd)}</span>
              </div>
              <div className="space-y-5">
                {Array.from(new Set(laterTasks.map((task) => task.dateLocal || ""))).map((date) => {
                  const dayTasks = laterTasks.filter((task) => task.dateLocal === date);
                  return (
                    <div key={date || "flexible"}>
                      <h3 className="mb-2 px-1 text-xs font-extrabold text-primary">{date ? localDateLabel(date) : t("learner.today.flexibleSuggestion")}</h3>
                      <div className="space-y-3">{dayTasks.map((task) => <TaskCard key={task.id} task={task} onAction={updateTaskStatus} busy={busyTaskId === task.id} actionsBlocked={busyTaskId !== null} actionError={actionErrorTaskId === task.id} />)}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <FeasibilityCard plan={plan} />
          <section className="rounded-[1.5rem] border border-primary/10 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-6" aria-labelledby="allocation-title">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><BookOpenText aria-hidden="true" className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("learner.today.weekEyebrow")}</p>
                <h2 id="allocation-title" className="mt-1 font-display text-base font-extrabold text-primary">{t("learner.today.focusTitle")}</h2>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {SKILL_KEYS.filter((skill) => plan.allocationShare[skill] > 0).map((skill) => {
                const share = plan.allocationShare[skill];
                return (
                  <div key={skill}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-foreground">{skillLabel(skill)}</span>
                      <span className="font-extrabold text-primary">{Math.round(share * 100)}% <span className="font-semibold text-muted-foreground">· {plan.allocationMinutes[skill]} {t("learner.today.minutesUnit")}</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#E9EDF5]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, share * 100))}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 border-t border-primary/10 pt-4 text-xs leading-5 text-muted-foreground">{t("learner.today.allocationNote")}</p>
          </section>
        </aside>
      </div>
    </motion.div>
  );
}
