import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  Compass,
  GraduationCap,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plane,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Brand } from "@/components/parle/Brand";
import { User } from "@/entities";
import { superdevClient } from "@/lib/superdev/client";
import { afterQuestionStep, checkSignInWithRetry, clampOnboardingStep, lastStepView, onboardingStepCount, type SignInState } from "@/lib/onboarding-steps";
import { parleAccountService } from "@/functions";
import { VerifyEmailCode } from "@/components/parle/VerifyEmailCode";
import {
  authErrorKey,
  isValidEmail,
  passwordMeetsRequirements,
  signUp,
} from "@/lib/auth-pages";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  browserTimeZone,
  createMyIdentity,
  isValidIanaTimeZone,
  syncMyOnboardingProfile,
  type ParleUser,
} from "@/lib/parle-profile";
import { formatRetakeDate, getRetakeGate } from "@/lib/placement-test";

const STORAGE_KEY = "parle-onboarding-session-v1";
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const goalOptions = [
  {
    id: "canada_immigration",
    labelKey: "onboarding.goal.immigration",
    detailKey: "onboarding.goal.immigrationDetail",
    icon: MapPin,
  },
  {
    id: "canadian_citizenship",
    labelKey: "onboarding.goal.citizenship",
    detailKey: "onboarding.goal.citizenshipDetail",
    icon: BadgeCheck,
  },
  {
    id: "conversation",
    labelKey: "onboarding.goal.conversation",
    detailKey: "onboarding.goal.conversationDetail",
    icon: MessageCircle,
  },
  {
    id: "general_fluency",
    labelKey: "onboarding.goal.general",
    detailKey: "onboarding.goal.generalDetail",
    icon: Sparkles,
  },
  {
    id: "work",
    labelKey: "onboarding.goal.work",
    detailKey: "onboarding.goal.workDetail",
    icon: BriefcaseBusiness,
  },
  {
    id: "job_interview",
    labelKey: "onboarding.goal.interview",
    detailKey: "onboarding.goal.interviewDetail",
    icon: UserRound,
  },
  {
    id: "school",
    labelKey: "onboarding.goal.school",
    detailKey: "onboarding.goal.schoolDetail",
    icon: GraduationCap,
  },
  {
    id: "travel",
    labelKey: "onboarding.goal.travel",
    detailKey: "onboarding.goal.travelDetail",
    icon: Plane,
  },
  {
    id: "other",
    labelKey: "onboarding.goal.other",
    detailKey: "onboarding.goal.otherDetail",
    icon: MoreHorizontal,
  },
] as const;

type GoalId = (typeof goalOptions)[number]["id"];
type Track = "immigration" | "citizenship" | "general";
type SkillKey = "L" | "R" | "W" | "S";
type CefrLevel = "A2" | "B1" | "B2" | "C1";
type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type OnboardingPhase = "questions" | "verify_email" | "account_setup" | "placement_intro" | "unverified_result" | "roadmap_preparing";

type TargetPerSkill = Record<SkillKey, string | null>;

interface OnboardingAnswers {
  goals: GoalId[];
  mainGoal: GoalId | "";
  otherGoalText: string;
  targetPerSkill: TargetPerSkill;
  cefrTarget: CefrLevel;
  targetDate: string;
  noDeadline: boolean;
  testBooked: "yes" | "no" | "";
  testBookedDate: string;
  selfAssessment: "A0" | "A1" | "A2" | "B1" | "B2" | "";
  availableDays: DayKey[];
  minutesPerDay: number;
  tutorWindows: string[];
  nativeLanguage: string;
  timeZone: string;
  tutorBudgetBand: "none" | "under_20" | "20_35" | "35_50" | "50_plus" | "";
  fullName: string;
  email: string;
}

interface OnboardingFlow {
  step: number;
  phase: OnboardingPhase;
  answers: OnboardingAnswers;
}


const skillOptions: { key: SkillKey; labelKey: TranslationKey }[] = [
  { key: "L", labelKey: "onboarding.skill.listening" },
  { key: "R", labelKey: "onboarding.skill.reading" },
  { key: "W", labelKey: "onboarding.skill.writing" },
  { key: "S", labelKey: "onboarding.skill.speaking" },
];

const dayOptions: { value: DayKey; shortKey: TranslationKey; fullKey: TranslationKey }[] = [
  { value: "monday", shortKey: "onboarding.day.monShort", fullKey: "onboarding.day.monday" },
  { value: "tuesday", shortKey: "onboarding.day.tueShort", fullKey: "onboarding.day.tuesday" },
  { value: "wednesday", shortKey: "onboarding.day.wedShort", fullKey: "onboarding.day.wednesday" },
  { value: "thursday", shortKey: "onboarding.day.thuShort", fullKey: "onboarding.day.thursday" },
  { value: "friday", shortKey: "onboarding.day.friShort", fullKey: "onboarding.day.friday" },
  { value: "saturday", shortKey: "onboarding.day.satShort", fullKey: "onboarding.day.saturday" },
  { value: "sunday", shortKey: "onboarding.day.sunShort", fullKey: "onboarding.day.sunday" },
];

const languageOptions: { value: string; labelKey: TranslationKey }[] = [
  { value: "English", labelKey: "language.english" },
  { value: "French", labelKey: "language.french" },
  { value: "Spanish", labelKey: "language.spanish" },
  { value: "Portuguese", labelKey: "language.portuguese" },
  { value: "Arabic", labelKey: "language.arabic" },
  { value: "Persian", labelKey: "language.persian" },
  { value: "Hindi", labelKey: "language.hindi" },
  { value: "Punjabi", labelKey: "language.punjabi" },
  { value: "Urdu", labelKey: "language.urdu" },
  { value: "Tagalog", labelKey: "language.tagalog" },
  { value: "Mandarin", labelKey: "language.mandarin" },
  { value: "Vietnamese", labelKey: "language.vietnamese" },
  { value: "Ukrainian", labelKey: "language.ukrainian" },
  { value: "Russian", labelKey: "language.russian" },
  { value: "Turkish", labelKey: "language.turkish" },
  { value: "Other", labelKey: "language.other" },
];

const tutorWindowOptions: { value: string; labelKey: TranslationKey }[] = [
  { value: "weekday_morning", labelKey: "onboarding.window.weekdayMorning" },
  { value: "weekday_afternoon", labelKey: "onboarding.window.weekdayAfternoon" },
  { value: "weekday_evening", labelKey: "onboarding.window.weekdayEvening" },
  { value: "weekend_morning", labelKey: "onboarding.window.weekendMorning" },
  { value: "weekend_afternoon", labelKey: "onboarding.window.weekendAfternoon" },
  { value: "weekend_evening", labelKey: "onboarding.window.weekendEvening" },
];

const cefrOptions: { level: CefrLevel; descriptionKey: TranslationKey }[] = [
  { level: "A2", descriptionKey: "onboarding.target.a2Description" },
  { level: "B1", descriptionKey: "onboarding.target.b1Description" },
  { level: "B2", descriptionKey: "onboarding.target.b2Description" },
  { level: "C1", descriptionKey: "onboarding.target.c1Description" },
];

const selfAssessmentOptions: { value: OnboardingAnswers["selfAssessment"]; labelKey: TranslationKey; detailKey: TranslationKey }[] = [
  { value: "A0", labelKey: "onboarding.level.never", detailKey: "onboarding.level.neverDetail" },
  { value: "A1", labelKey: "onboarding.level.words", detailKey: "onboarding.level.wordsDetail" },
  { value: "A2", labelKey: "onboarding.level.basic", detailKey: "onboarding.level.basicDetail" },
  { value: "B1", labelKey: "onboarding.level.comfortable", detailKey: "onboarding.level.comfortableDetail" },
  { value: "B2", labelKey: "onboarding.level.fluentGaps", detailKey: "onboarding.level.fluentGapsDetail" },
];

const stepLabelKeys: TranslationKey[] = [
  "onboarding.step.goals",
  "onboarding.step.target",
  "onboarding.step.deadline",
  "onboarding.step.selfAssessment",
  "onboarding.step.availability",
  "onboarding.step.aboutYou",
  "onboarding.step.account",
];

function defaultTargetPerSkill(mainGoal: GoalId | ""): TargetPerSkill {
  if (mainGoal === "canada_immigration") {
    return { L: "NCLC 7", R: "NCLC 7", W: "NCLC 7", S: "NCLC 7" };
  }
  if (mainGoal === "canadian_citizenship") {
    return { L: "NCLC 4", R: null, W: null, S: "NCLC 4" };
  }
  return { L: "CEFR B1", R: "CEFR B1", W: "CEFR B1", S: "CEFR B1" };
}

function defaultAnswers(): OnboardingAnswers {
  return {
    goals: [],
    mainGoal: "",
    otherGoalText: "",
    targetPerSkill: defaultTargetPerSkill(""),
    cefrTarget: "B1",
    targetDate: "",
    noDeadline: false,
    testBooked: "",
    testBookedDate: "",
    selfAssessment: "",
    availableDays: [],
    minutesPerDay: 20,
    tutorWindows: [],
    nativeLanguage: "",
    timeZone: browserTimeZone(),
    tutorBudgetBand: "",
    fullName: "",
    email: "",
  };
}

function isPhase(value: unknown): value is OnboardingPhase {
  return value === "questions" || value === "verify_email" || value === "account_setup" || value === "placement_intro" || value === "unverified_result" || value === "roadmap_preparing";
}

function readSavedFlow(): OnboardingFlow {
  const empty: OnboardingFlow = { step: 1, phase: "questions", answers: defaultAnswers() };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<OnboardingFlow>;
    if (!parsed || typeof parsed !== "object" || !parsed.answers || typeof parsed.answers !== "object") return empty;
    const savedAnswers = parsed.answers as Partial<OnboardingAnswers>;
    const answers = { ...empty.answers, ...savedAnswers };
    answers.targetPerSkill = {
      ...empty.answers.targetPerSkill,
      ...(savedAnswers.targetPerSkill && typeof savedAnswers.targetPerSkill === "object" ? savedAnswers.targetPerSkill : {}),
    };
    answers.goals = Array.isArray(savedAnswers.goals) ? savedAnswers.goals : [];
    answers.availableDays = Array.isArray(savedAnswers.availableDays) ? savedAnswers.availableDays : [];
    answers.tutorWindows = Array.isArray(savedAnswers.tutorWindows) ? savedAnswers.tutorWindows : [];
    return {
      step: typeof parsed.step === "number" ? Math.min(7, Math.max(1, parsed.step)) : 1,
      phase: isPhase(parsed.phase) ? parsed.phase : "questions",
      answers,
    };
  } catch {
    return empty;
  }
}

function trackForGoal(mainGoal: GoalId | ""): Track {
  if (mainGoal === "canada_immigration") return "immigration";
  if (mainGoal === "canadian_citizenship") return "citizenship";
  return "general";
}

function trackIntroKey(track: Track): TranslationKey {
  if (track === "immigration") return "onboarding.target.immigrationIntro";
  if (track === "citizenship") return "onboarding.target.citizenshipIntro";
  return "onboarding.target.generalIntro";
}

function localDateValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function validateStep(step: number, answers: OnboardingAnswers, password: string, ageConfirmed: boolean): TranslationKey | null {
  if (step === 1) {
    if (answers.goals.length === 0) return "onboarding.error.chooseGoal";
    if (answers.goals.includes("other") && !answers.otherGoalText.trim()) return "onboarding.error.otherGoal";
    if (!answers.mainGoal || !answers.goals.includes(answers.mainGoal)) return "onboarding.error.mainGoal";
  }
  if (step === 2) {
    if (!Object.values(answers.targetPerSkill).some(Boolean)) return "onboarding.error.target";
  }
  if (step === 3) {
    if (!answers.noDeadline && !answers.targetDate) return "onboarding.error.targetDate";
    if (!answers.noDeadline && answers.targetDate < localDateValue()) return "onboarding.error.datePast";
    if (trackForGoal(answers.mainGoal) === "immigration") {
      if (!answers.testBooked) return "onboarding.error.testBooked";
      if (answers.testBooked === "yes" && !answers.testBookedDate) return "onboarding.error.testDate";
      if (answers.testBooked === "yes" && answers.testBookedDate < localDateValue()) return "onboarding.error.datePast";
    }
  }
  if (step === 4 && !answers.selfAssessment) return "onboarding.error.selfAssessment";
  if (step === 5 && answers.availableDays.length === 0) return "onboarding.error.days";
  if (step === 6) {
    if (!answers.nativeLanguage) return "onboarding.error.language";
    if (!isValidIanaTimeZone(answers.timeZone)) return "onboarding.error.timeZone";
  }
  if (step === 7) {
    if (!answers.fullName.trim()) return "auth.nameRequired";
    if (!answers.email.trim()) return "auth.emailRequired";
    if (!isValidEmail(answers.email)) return "auth.emailInvalid";
    if (!passwordMeetsRequirements(password)) return "auth.passwordWeak";
    if (!ageConfirmed) return "auth.ageRequired";
  }
  return null;
}


async function saveMyLearnerProfile(user: ParleUser, answers: OnboardingAnswers) {
  const track = trackForGoal(answers.mainGoal);
  const availability = Object.fromEntries(
    dayOptions
      .filter((day) => answers.availableDays.includes(day.value))
      .map((day) => [day.value, answers.minutesPerDay]),
  );
  const payload = {
    user_id: user.id,
    goals: answers.goals,
    main_goal: answers.mainGoal,
    other_goal_text: answers.goals.includes("other") ? answers.otherGoalText.trim() : "",
    track,
    target_per_skill: JSON.stringify(answers.targetPerSkill),
    target_date: answers.noDeadline ? "" : answers.targetDate,
    no_deadline: answers.noDeadline,
    test_booked: track === "immigration" && answers.testBooked === "yes",
    test_booked_date: track === "immigration" && answers.testBooked === "yes" ? answers.testBookedDate : "",
    availability: JSON.stringify(availability),
    tutor_windows: answers.tutorWindows,
    tutor_budget_band: answers.tutorBudgetBand || "unspecified",
    self_assessed_level: answers.selfAssessment,
    native_language: answers.nativeLanguage,
    time_zone: answers.timeZone.trim(),
  };
  // Saved on the server (backend Plan 2); the service sets user_id, owner and creator from the signed-in account.
  const res = await parleAccountService({ action: "save_learner_profile", ...payload });
  if (!isRecord(res.learner_profile) || typeof res.learner_profile.id !== "string" || !res.learner_profile.id) {
    throw new Error("The learner profile could not be confirmed.");
  }
}

async function saveMyUnverifiedPlacement(_user: ParleUser, answers: OnboardingAnswers) {
  // The server builds the self-assessed (unverified) placement record exactly as onboarding did on Buildy.
  const res = await parleAccountService({ action: "save_unverified_placement", self_assessed_level: answers.selfAssessment, track: trackForGoal(answers.mainGoal) });
  if (!isRecord(res.placement_result) || typeof res.placement_result.id !== "string" || !res.placement_result.id) {
    throw new Error("The unverified result could not be confirmed.");
  }
}

export default function Onboarding() {
  const shouldReduceMotion = useReducedMotion();
  const [flow, setFlow] = useState<OnboardingFlow>(() => readSavedFlow());
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [setupError, setSetupError] = useState<TranslationKey | null>(null);
  const [skipError, setSkipError] = useState<TranslationKey | null>(null);
  const [retakeStatus, setRetakeStatus] = useState<"checking" | "ready" | "blocked" | "error">("checking");
  const [retakeAvailableAt, setRetakeAvailableAt] = useState<string | null>(null);
  const [retakeCheckAttempt, setRetakeCheckAttempt] = useState(0);
  // someone who signed up on the sign-up page arrives signed in: no account step for them
  const [signInState, setSignInState] = useState<SignInState>("checking");
  const signedIn = signInState === "learner";
  const stepCount = onboardingStepCount(signedIn);
  const displayStep = clampOnboardingStep(flow.step, signedIn);
  const answers = flow.answers;
  const track = trackForGoal(answers.mainGoal);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
    } catch (error) {
      console.error("Parle onboarding answers could not be saved for this session", error instanceof Error ? error.name : "unknown");
    }
  }, [flow]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: shouldReduceMotion ? "auto" : "smooth" });
  }, [flow.phase, flow.step, shouldReduceMotion]);

  useEffect(() => {
    if (flow.phase !== "placement_intro") return;
    let active = true;
    setRetakeStatus("checking");
    setRetakeAvailableAt(null);
    const checkRetakeWindow = async () => {
      try {
        const user = (await User.me()) as ParleUser;
        const gate = await getRetakeGate(user.email);
        if (!active) return;
        setRetakeAvailableAt(gate.availableAt);
        setRetakeStatus(gate.blocked ? "blocked" : "ready");
      } catch (error) {
        console.error("Parle placement retake window could not be checked", error instanceof Error ? error.name : "unknown");
        if (active) setRetakeStatus("error");
      }
    };
    void checkRetakeWindow();
    return () => { active = false; };
  }, [flow.phase, retakeCheckAttempt]);

  const checkSignIn = async (): Promise<"learner" | "visitor"> => {
    if (!(await superdevClient.isAuthenticated())) return "visitor";
    const user = (await User.me()) as ParleUser;
    return user?.id && user.role !== "administrator" ? "learner" : "visitor";
  };

  async function recheckSignIn() {
    setSignInState("checking");
    setFormError(null);
    setSignInState(await checkSignInWithRetry(checkSignIn));
  }

  useEffect(() => {
    let active = true;
    void checkSignInWithRetry(checkSignIn).then((state) => { if (active) setSignInState(state); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // a saved visitor flow at step 7 becomes step 6 of 6 once we know this person is signed in (R29)
    if (signedIn) setFlow((current) => (current.step > onboardingStepCount(true) ? { ...current, step: clampOnboardingStep(current.step, true) } : current));
  }, [signedIn]);

  function retryRetakeCheck() {
    setRetakeAvailableAt(null);
    setRetakeStatus("checking");
    setRetakeCheckAttempt((attempt) => attempt + 1);
  }

  function patchAnswers(patch: Partial<OnboardingAnswers>) {
    setFlow((current) => ({ ...current, answers: { ...current.answers, ...patch } }));
    setFormError(null);
  }

  function toggleGoal(goal: GoalId) {
    setFlow((current) => {
      const selected = current.answers.goals.includes(goal);
      const goals = selected
        ? current.answers.goals.filter((item) => item !== goal)
        : [...current.answers.goals, goal];
      const mainGoal = selected && current.answers.mainGoal === goal ? "" : current.answers.mainGoal;
      const nextMainGoal = mainGoal && goals.includes(mainGoal) ? mainGoal : "";
      return {
        ...current,
        answers: {
          ...current.answers,
          goals,
          mainGoal: nextMainGoal,
          targetPerSkill: nextMainGoal === current.answers.mainGoal
            ? current.answers.targetPerSkill
            : defaultTargetPerSkill(nextMainGoal),
        },
      };
    });
    setFormError(null);
  }

  function chooseMainGoal(goal: GoalId) {
    setFlow((current) => ({
      ...current,
      answers: {
        ...current.answers,
        mainGoal: goal,
        targetPerSkill: goal === current.answers.mainGoal ? current.answers.targetPerSkill : defaultTargetPerSkill(goal),
      },
    }));
    setFormError(null);
  }

  function chooseCefrTarget(level: CefrLevel) {
    setFlow((current) => ({
      ...current,
      answers: {
        ...current.answers,
        cefrTarget: level,
        targetPerSkill: { L: `CEFR ${level}`, R: `CEFR ${level}`, W: `CEFR ${level}`, S: `CEFR ${level}` },
      },
    }));
    setFormError(null);
  }

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flow.phase !== "questions" || busy) return;
    const errorKey = validateStep(flow.step, answers, password, ageConfirmed);
    if (errorKey) {
      setFormError(errorKey);
      return;
    }
    let state = signInState;
    // The account step depends on the sign-in check; if it has not answered, ask again before choosing (R29).
    if (flow.step >= onboardingStepCount(true) && (state === "unknown" || state === "checking")) {
      state = await checkSignInWithRetry(checkSignIn);
      setSignInState(state);
      if (state === "unknown") {
        setFormError("onboarding.signInCheckFailed");
        return;
      }
    }
    const next = afterQuestionStep(flow.step, state === "learner");
    if (next === "next") {
      setFlow((current) => ({ ...current, step: current.step + 1 }));
      setFormError(null);
      return;
    }
    if (next === "finish_signed_in") {
      void afterEmailVerified();
      return;
    }
    void createAccountAndProfile();
  }

  async function finishAccountSetup() {
    const user = (await User.me()) as ParleUser;
    if (!user?.email || !user.id) throw new Error("The signed-in account could not be confirmed.");
    if (user.role === "administrator") throw new Error("Administrator accounts cannot use learner onboarding.");
    await createMyIdentity("learner", true);
    await syncMyOnboardingProfile({ native_language: answers.nativeLanguage, time_zone: answers.timeZone });
    await saveMyLearnerProfile(user, answers);
  }

  async function createAccountAndProfile() {
    setBusy(true);
    setFormError(null);
    try {
      await signUp(answers.fullName.trim(), answers.email.trim(), password);
      // The account is usable once the emailed code is entered (backend Plan 2); the step survives a reload.
      setFlow((current) => ({ ...current, phase: "verify_email" }));
    } catch (error) {
      console.error("Parle learner onboarding sign-up failed", error instanceof Error ? error.name : "unknown");
      setFormError(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  async function afterEmailVerified() {
    setBusy(true);
    setFlow((current) => ({ ...current, phase: "account_setup" }));
    try {
      await finishAccountSetup();
      setSetupError(null);
      setFlow((current) => ({ ...current, phase: "placement_intro" }));
    } catch (error) {
      console.error("Parle learner onboarding account setup failed", error instanceof Error ? error.name : "unknown");
      setSetupError("onboarding.accountSetupError");
    } finally {
      setBusy(false);
    }
  }

  async function retryAccountSetup() {
    setBusy(true);
    setSetupError(null);
    try {
      await finishAccountSetup();
      setFlow((current) => ({ ...current, phase: "placement_intro" }));
    } catch (error) {
      console.error("Parle learner onboarding setup retry failed", error instanceof Error ? error.name : "unknown");
      setSetupError("onboarding.accountSetupError");
    } finally {
      setBusy(false);
    }
  }

  async function skipPlacement() {
    setBusy(true);
    setSkipError(null);
    try {
      const user = (await User.me()) as ParleUser;
      await saveMyUnverifiedPlacement(user, answers);
      setFlow((current) => ({ ...current, phase: "unverified_result" }));
    } catch (error) {
      console.error("Parle unverified placement result could not be saved", error instanceof Error ? error.name : "unknown");
      setSkipError("onboarding.placement.saveError");
    } finally {
      setBusy(false);
    }
  }

  function toggleDay(day: DayKey) {
    const selected = answers.availableDays.includes(day);
    const nextDays = selected
      ? answers.availableDays.filter((item) => item !== day)
      : dayOptions.filter((item) => answers.availableDays.includes(item.value) || item.value === day).map((item) => item.value);
    patchAnswers({ availableDays: nextDays });
  }

  function toggleTutorWindow(windowValue: string) {
    const selected = answers.tutorWindows.includes(windowValue);
    patchAnswers({
      tutorWindows: selected
        ? answers.tutorWindows.filter((item) => item !== windowValue)
        : [...answers.tutorWindows, windowValue],
    });
  }

  const stepTitleKeys: TranslationKey[] = [
    "onboarding.question.goalsTitle",
    "onboarding.question.targetTitle",
    "onboarding.question.deadlineTitle",
    "onboarding.question.selfAssessmentTitle",
    "onboarding.question.availabilityTitle",
    "onboarding.question.aboutYouTitle",
    "onboarding.question.accountTitle",
  ];
  const stepDescriptionKeys: TranslationKey[] = [
    "onboarding.question.goalsDescription",
    "onboarding.question.targetDescription",
    "onboarding.question.deadlineDescription",
    "onboarding.question.selfAssessmentDescription",
    "onboarding.question.availabilityDescription",
    "onboarding.question.aboutYouDescription",
    "onboarding.question.accountDescription",
  ];

  function renderQuestionStep() {
    if (flow.step === 1) {
      return (
        <div className="space-y-6">
          <fieldset>
            <legend className="sr-only">{t("onboarding.question.chooseAllGoals")}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {goalOptions.map((option) => {
                const Icon = option.icon;
                const selected = answers.goals.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleGoal(option.id)}
                    className={`group flex min-h-[82px] min-w-0 items-start gap-3 rounded-2xl border p-3.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:p-4 ${selected ? "border-primary bg-[#EEF2FA] shadow-sm" : "border-primary/10 bg-white hover:border-primary/25 hover:bg-[#FAFBFE]"}`}
                  >
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${selected ? "bg-primary text-white" : "bg-[#F0F2F8] text-primary group-hover:bg-[#E8EDF8]"}`}>
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-5 text-foreground">{t(option.labelKey)}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(option.detailKey)}</span>
                    </span>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${selected ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-transparent"}`}>
                      <Check aria-hidden="true" className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {answers.goals.includes("other") && (
            <div className="space-y-2">
              <label htmlFor="onboarding-other-goal" className="block text-sm font-bold text-foreground">{t("onboarding.question.otherGoalLabel")}</label>
              <input
                id="onboarding-other-goal"
                className="auth-input"
                type="text"
                maxLength={120}
                value={answers.otherGoalText}
                onChange={(event) => patchAnswers({ otherGoalText: event.target.value })}
                placeholder={t("onboarding.question.otherGoalPlaceholder")}
              />
            </div>
          )}

          {answers.goals.length > 0 && (
            <fieldset className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
              <legend className="px-1 font-display text-base font-extrabold tracking-[-0.025em] text-primary">{t("onboarding.question.mainGoalTitle")}</legend>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("onboarding.question.mainGoalDescription")}</p>
              <div role="radiogroup" aria-label={t("onboarding.question.mainGoalTitle")} className="mt-3 flex flex-wrap gap-2">
                {goalOptions.filter((option) => answers.goals.includes(option.id)).map((option) => {
                  const selected = answers.mainGoal === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseMainGoal(option.id)}
                      className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-primary text-white" : "border-primary/15 bg-white text-primary hover:bg-[#EEF2FA]"}`}
                    >
                      <span className="truncate">{t(option.labelKey)}</span>
                      {selected && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      );
    }

    if (flow.step === 2) {
      return (
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Target aria-hidden="true" className="h-4 w-4" /></span>
              <p className="pt-1 text-sm leading-6 text-foreground">{t(trackIntroKey(track))}</p>
            </div>
          </div>

          {track === "general" ? (
            <fieldset>
              <legend className="text-sm font-bold text-foreground">{t("onboarding.target.cefrLabel")}</legend>
              <div role="radiogroup" aria-label={t("onboarding.target.cefrLabel")} className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {cefrOptions.map((option) => {
                  const selected = answers.cefrTarget === option.level;
                  return (
                    <button
                      key={option.level}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseCefrTarget(option.level)}
                      className={`flex min-h-[96px] items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-[#EEF2FA] shadow-sm" : "border-primary/10 bg-white hover:border-primary/25"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${selected ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary"}`}>{selected ? <Check aria-hidden="true" className="h-4 w-4" /> : option.level}</span>
                      <span>
                        <span className="block font-display text-lg font-extrabold tracking-[-0.03em] text-primary">{option.level}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(option.descriptionKey)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{t("onboarding.target.skillTargets")}</h3>
                <span className="rounded-full bg-[#EEF2FA] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">{t("onboarding.target.nclcScale")}</span>
              </div>
              <div className="space-y-2.5">
                {skillOptions.map((skill) => {
                  const fieldId = `target-${skill.key}`;
                  return (
                    <div key={skill.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(118px,0.72fr)] items-center gap-3 rounded-2xl border border-primary/10 bg-white p-3.5 sm:grid-cols-[minmax(0,1fr)_190px] sm:px-4">
                      <label htmlFor={fieldId} className="min-w-0 text-sm font-bold text-foreground">{t(skill.labelKey)}</label>
                      <select
                        id={fieldId}
                        className="auth-input min-w-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                        value={answers.targetPerSkill[skill.key] ?? ""}
                        onChange={(event) => patchAnswers({ targetPerSkill: { ...answers.targetPerSkill, [skill.key]: event.target.value || null } })}
                        aria-label={`${t(skill.labelKey)} ${t("onboarding.target.targetLabelSuffix")}`}
                      >
                        {track === "citizenship" && <option value="">{t("onboarding.target.noSpecificTarget")}</option>}
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((level) => (
                          <option key={level} value={`NCLC ${level}`}>{t("onboarding.target.nclcLevel").replace("{level}", String(level))}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("onboarding.target.nclcHelp")}</p>
            </div>
          )}
          <p className="rounded-xl bg-[#FFF3F0] px-4 py-3 text-xs leading-5 text-[#75413D]">{t("onboarding.target.editableNote")}</p>
        </div>
      );
    }

    if (flow.step === 3) {
      const isImmigration = track === "immigration";
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="onboarding-target-date" className="block text-sm font-bold text-foreground">{t("onboarding.deadline.dateLabel")}</label>
            <input
              id="onboarding-target-date"
              className="auth-input"
              type="date"
              min={localDateValue()}
              value={answers.targetDate}
              onChange={(event) => patchAnswers({ targetDate: event.target.value })}
              disabled={answers.noDeadline}
              required={!answers.noDeadline}
              aria-describedby="onboarding-deadline-help"
            />
            <p id="onboarding-deadline-help" className="text-xs leading-5 text-muted-foreground">{t("onboarding.deadline.dateHelp")}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 transition hover:border-primary/20">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              checked={answers.noDeadline}
              onChange={(event) => patchAnswers({ noDeadline: event.target.checked, targetDate: event.target.checked ? "" : answers.targetDate })}
            />
            <span className="text-sm font-bold leading-6 text-foreground">{t("onboarding.deadline.noDeadline")}</span>
          </label>
          {isImmigration && (
            <fieldset className="rounded-2xl border border-primary/10 bg-white p-4 sm:p-5">
              <legend className="font-display text-base font-extrabold tracking-[-0.025em] text-primary">{t("onboarding.deadline.testBookedTitle")}</legend>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("onboarding.deadline.testBookedDescription")}</p>
              <div role="radiogroup" aria-label={t("onboarding.deadline.testBookedTitle")} className="mt-3 flex gap-2">
                {(["yes", "no"] as const).map((value) => {
                  const selected = answers.testBooked === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patchAnswers({ testBooked: value, testBookedDate: value === "no" ? "" : answers.testBookedDate })}
                      className={`min-h-11 min-w-24 rounded-full border px-5 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-primary text-white" : "border-primary/15 bg-white text-primary hover:bg-[#EEF2FA]"}`}
                    >
                      {t(value === "yes" ? "common.yes" : "common.no")}
                    </button>
                  );
                })}
              </div>
              {answers.testBooked === "yes" && (
                <div className="mt-4 space-y-2">
                  <label htmlFor="onboarding-test-date" className="block text-sm font-bold text-foreground">{t("onboarding.deadline.testDateLabel")}</label>
                  <input
                    id="onboarding-test-date"
                    className="auth-input"
                    type="date"
                    min={localDateValue()}
                    value={answers.testBookedDate}
                    onChange={(event) => patchAnswers({ testBookedDate: event.target.value })}
                    required
                  />
                </div>
              )}
            </fieldset>
          )}
        </div>
      );
    }

    if (flow.step === 4) {
      return (
        <fieldset>
          <legend className="sr-only">{t("onboarding.question.selfAssessmentTitle")}</legend>
          <div role="radiogroup" aria-label={t("onboarding.question.selfAssessmentTitle")} className="space-y-2.5">
            {selfAssessmentOptions.map((option) => {
              const selected = answers.selfAssessment === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => patchAnswers({ selfAssessment: option.value })}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-[#EEF2FA] shadow-sm" : "border-primary/10 bg-white hover:border-primary/25"}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-white" : "border-primary/25 bg-white text-transparent"}`}><Check aria-hidden="true" className="h-3 w-3" /></span>
                  <span>
                    <span className="block text-sm font-bold text-foreground">{t(option.labelKey)}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(option.detailKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 rounded-xl bg-[#FAF9F5] px-4 py-3 text-xs leading-5 text-muted-foreground">{t("onboarding.selfAssessment.note")}</p>
        </fieldset>
      );
    }

    if (flow.step === 5) {
      return (
        <div className="space-y-6">
          <fieldset>
            <legend className="text-sm font-bold text-foreground">{t("onboarding.availability.daysLabel")}</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("onboarding.availability.daysHelp")}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {dayOptions.map((day) => {
                const selected = answers.availableDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-label={t(day.fullKey)}
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.value)}
                    className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-primary text-white" : "border-primary/15 bg-white text-primary hover:bg-[#EEF2FA]"}`}
                  >
                    {t(day.shortKey)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-foreground">{t("onboarding.availability.minutesLabel")}</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("onboarding.availability.minutesHelp")}</p>
            <div role="radiogroup" aria-label={t("onboarding.availability.minutesLabel")} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[10, 20, 30, 45, 60, 90].map((minutes) => {
                const selected = answers.minutesPerDay === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patchAnswers({ minutesPerDay: minutes })}
                    className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-[#EEF2FA] text-primary" : "border-primary/15 bg-white text-foreground hover:bg-[#FAFBFE]"}`}
                  >
                    {t("onboarding.availability.minutesValue").replace("{minutes}", String(minutes))}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
            <legend className="px-1 font-display text-base font-extrabold tracking-[-0.025em] text-primary">{t("onboarding.availability.tutorWindowsLabel")}</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("onboarding.availability.tutorWindowsHelp")}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tutorWindowOptions.map((option) => {
                const selected = answers.tutorWindows.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTutorWindow(option.value)}
                    className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-white text-primary" : "border-primary/10 bg-white/70 text-foreground hover:border-primary/25"}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-white" : "border-primary/25 bg-white text-transparent"}`}><Check aria-hidden="true" className="h-3 w-3" /></span>
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      );
    }

    if (flow.step === 6) {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="onboarding-native-language" className="block text-sm font-bold text-foreground">{t("onboarding.about.nativeLanguage")}</label>
            <select
              id="onboarding-native-language"
              className="auth-input"
              value={answers.nativeLanguage}
              onChange={(event) => patchAnswers({ nativeLanguage: event.target.value })}
              required
            >
              <option value="">{t("onboarding.about.nativeLanguagePlaceholder")}</option>
              {languageOptions.map((language) => <option key={language.value} value={language.value}>{t(language.labelKey)}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="onboarding-time-zone" className="block text-sm font-bold text-foreground">{t("onboarding.about.timeZone")}</label>
            <div className="relative">
              <Clock3 aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="onboarding-time-zone"
                className="auth-input pl-10"
                type="text"
                autoComplete="off"
                value={answers.timeZone}
                onChange={(event) => patchAnswers({ timeZone: event.target.value })}
                placeholder={t("onboarding.about.timeZonePlaceholder")}
                required
                aria-describedby="onboarding-time-zone-help"
              />
            </div>
            <p id="onboarding-time-zone-help" className="text-xs leading-5 text-muted-foreground">{t("onboarding.about.timeZoneHelp")}</p>
          </div>

          <fieldset>
            <legend className="text-sm font-bold text-foreground">{t("onboarding.about.tutorBudget")}</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("onboarding.about.tutorBudgetHelp")}</p>
            <div role="radiogroup" aria-label={t("onboarding.about.tutorBudget")} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                ["none", "onboarding.budget.none"],
                ["under_20", "onboarding.budget.under20"],
                ["20_35", "onboarding.budget.20to35"],
                ["35_50", "onboarding.budget.35to50"],
                ["50_plus", "onboarding.budget.50plus"],
              ] as const).map(([value, labelKey]) => {
                const selected = answers.tutorBudgetBand === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patchAnswers({ tutorBudgetBand: value })}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-bold leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-primary bg-[#EEF2FA] text-primary" : "border-primary/15 bg-white text-foreground hover:bg-[#FAFBFE]"}`}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      );
    }

    const lastView = lastStepView(flow.step, signInState);
    if (lastView === "checking") {
      return <p role="status" className="rounded-xl bg-[#EEF2FA] px-4 py-3 text-sm leading-6 text-foreground">{t("onboarding.signInChecking")}</p>;
    }
    if (lastView === "retry") {
      return (
        <div role="alert" className="space-y-3 rounded-xl border border-[#F0C5C0] bg-[#FFF3F0] px-4 py-3 text-sm leading-6 text-[#8D342D]">
          <p>{t("onboarding.signInCheckFailed")}</p>
          <button type="button" className="parle-button-secondary justify-center" onClick={() => void recheckSignIn()}>{t("onboarding.signInCheckAgain")}</button>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="onboarding-full-name" className="block text-sm font-bold text-foreground">{t("auth.nameLabel")}</label>
            <input
              id="onboarding-full-name"
              className="auth-input"
              type="text"
              autoComplete="name"
              maxLength={120}
              value={answers.fullName}
              onChange={(event) => patchAnswers({ fullName: event.target.value })}
              placeholder={t("auth.namePlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="onboarding-email" className="block text-sm font-bold text-foreground">{t("auth.emailLabel")}</label>
            <input
              id="onboarding-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={answers.email}
              onChange={(event) => patchAnswers({ email: event.target.value })}
              placeholder={t("auth.emailPlaceholder")}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="onboarding-password" className="block text-sm font-bold text-foreground">{t("auth.passwordLabel")}</label>
          <input
            id="onboarding-password"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setFormError(null); }}
            placeholder={t("auth.passwordPlaceholder")}
            required
            aria-describedby="onboarding-password-hint"
          />
          <p id="onboarding-password-hint" className="text-xs leading-5 text-muted-foreground">{t("auth.passwordHint")}</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 text-sm leading-6 text-foreground transition hover:border-primary/20">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            checked={ageConfirmed}
            onChange={(event) => { setAgeConfirmed(event.target.checked); setFormError(null); }}
            required
            aria-required="true"
          />
          <span>{t("auth.ageConfirmation")}</span>
        </label>
        <p className="rounded-xl bg-[#EEF2FA] px-4 py-3 text-xs leading-5 text-muted-foreground">{t("onboarding.account.emailPasswordNote")}</p>
      </div>
    );
  }

  const progressPercent = (displayStep / stepCount) * 100;
  const selfAssessmentChoice = selfAssessmentOptions.find((option) => option.value === answers.selfAssessment);
  const selfAssessmentLevel = answers.selfAssessment || "A0";

  return (
    <div className="min-h-screen overflow-hidden bg-[#F7F8FB] text-foreground">
      <header className="border-b border-primary/10 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:min-h-[76px] sm:px-6 lg:px-8">
          <Brand compact />
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>{t("common.backHome")}</span>
          </Link>
        </div>
      </header>

      {flow.phase === "questions" ? (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-7">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("onboarding.eyebrow")}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("onboarding.duration")}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF0EC] text-[#A13F36]"><Compass aria-hidden="true" className="h-3.5 w-3.5" /></span>
              {t("onboarding.consultationLabel")}
            </span>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-7">
            <aside className="relative overflow-hidden rounded-[1.75rem] bg-primary p-5 text-white shadow-[0_28px_70px_-48px_rgba(30,58,138,0.7)] sm:p-7 lg:min-h-[430px] lg:p-8">
              <div aria-hidden="true" className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/15" />
              <div aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-[#FFC0B4]/25" />
              <div className="relative">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#FFC0B4]"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span>
                <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]">{t("onboarding.sidebar.eyebrow")}</p>
                <h2 className="mt-2 max-w-[16ch] font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("onboarding.sidebar.title")}</h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/80">{t("onboarding.sidebar.body")}</p>
                <ul className="mt-6 space-y-3 border-t border-white/15 pt-5 text-xs font-semibold leading-5 text-white/85">
                  {["onboarding.sidebar.pointOne", "onboarding.sidebar.pointTwo", "onboarding.sidebar.pointThree"].map((key) => (
                    <li key={key} className="flex items-start gap-2.5">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC0B4]" />
                      <span>{t(key as TranslationKey)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            <section aria-labelledby="onboarding-step-title" className="min-w-0 rounded-[1.75rem] border border-primary/10 bg-white p-4 shadow-[0_24px_72px_-52px_rgba(30,58,138,0.35)] sm:p-7 lg:p-9">
              <div className="mb-7">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t("onboarding.progressLabel").replace("{step}", String(displayStep)).replace("{total}", String(stepCount))}</p>
                  <span className="text-xs font-semibold text-muted-foreground">{t(stepLabelKeys[displayStep - 1])}</span>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[#E9EDF5]"
                  role="progressbar"
                  aria-label={t("onboarding.progressLabel").replace("{step}", String(displayStep)).replace("{total}", String(stepCount))}
                  aria-valuemin={1}
                  aria-valuemax={stepCount}
                  aria-valuenow={displayStep}
                >
                  <motion.div
                    className="h-full rounded-full bg-[#F97362]"
                    initial={false}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>

              <form onSubmit={handleQuestionSubmit} noValidate>
                <div className="mb-6">
                  <h1 id="onboarding-step-title" className="font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-3xl">
                    {t(stepTitleKeys[flow.step - 1])}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{t(stepDescriptionKeys[flow.step - 1])}</p>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={flow.step}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: "easeOut" }}
                  >
                    {renderQuestionStep()}
                  </motion.div>
                </AnimatePresence>

                {formError && (
                  <div role="alert" className="mt-5 rounded-xl border border-[#F0C5C0] bg-[#FFF3F0] px-4 py-3 text-sm font-semibold leading-6 text-[#8D342D]">
                    {t(formError)}
                    {formError === "auth.error.emailExists" && <span className="ml-1"><Link to="/login" className="font-extrabold underline underline-offset-2">{t("common.signIn")}</Link></span>}
                  </div>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {flow.step > 1 ? (
                    <button
                      type="button"
                      onClick={() => { setFlow((current) => ({ ...current, step: Math.max(1, current.step - 1) })); setFormError(null); }}
                      disabled={busy}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-5 py-3 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
                    >
                      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                      {t("onboarding.back")}
                    </button>
                  ) : <span className="hidden sm:block" />}
                  <button
                    type="submit"
                    disabled={busy || lastStepView(flow.step, signInState) === "checking" || lastStepView(flow.step, signInState) === "retry"}
                    aria-busy={busy}
                    className="parle-button-primary w-full justify-center sm:w-auto"
                  >
                    <span>{flow.step === 7 ? t(busy ? "onboarding.account.creating" : "onboarding.account.createButton") : t("onboarding.continue")}</span>
                    {flow.step < 7 && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </main>
      ) : (
        <main className="mx-auto flex max-w-4xl justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={flow.phase}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: "easeOut" }}
              className="w-full max-w-2xl rounded-[2rem] border border-primary/10 bg-white p-5 shadow-[0_28px_80px_-50px_rgba(30,58,138,0.42)] sm:p-9 lg:p-11"
            >
              {flow.phase === "verify_email" && (
                <VerifyEmailCode email={answers.email.trim()} password={password} fullName={answers.fullName.trim()} onVerified={afterEmailVerified} />
              )}

              {flow.phase === "account_setup" && (
                <div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-6 w-6" /></div>
                  <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("onboarding.account.eyebrow")}</p>
                  <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("onboarding.account.setupTitle")}</h1>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("onboarding.account.setupBody")}</p>
                  {setupError && <p role="alert" className="auth-message-error mt-5">{t(setupError)}</p>}
                  <button type="button" className="parle-button-primary mt-7 w-full justify-center sm:w-auto" onClick={retryAccountSetup} disabled={busy} aria-busy={busy}>
                    {t(busy ? "onboarding.account.setupWorking" : "onboarding.account.setupRetry")}
                    {!busy && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {flow.phase === "placement_intro" && (
                <div>
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#FFF0EC] text-[#A13F36]">
                    <Target aria-hidden="true" className="h-7 w-7" />
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary text-white"><Check aria-hidden="true" className="h-3 w-3" /></span>
                  </div>
                  <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("onboarding.placement.eyebrow")}</p>
                  <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("onboarding.placement.title")}</h1>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("onboarding.placement.introBody")}</p>
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
                    <CalendarDays aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-6 text-foreground">{t("onboarding.placement.demoNote")}</p>
                  </div>
                  {retakeStatus === "checking" && <p role="status" className="mt-5 rounded-xl bg-[#EEF2FA] px-4 py-3 text-sm leading-6 text-foreground">{t("onboarding.placement.retakeChecking")}</p>}
                  {retakeStatus === "blocked" && retakeAvailableAt && <p role="status" className="mt-5 rounded-xl bg-[#EEF2FA] px-4 py-3 text-sm leading-6 text-foreground">{t("onboarding.placement.retakeBlocked").replace("{date}", formatRetakeDate(retakeAvailableAt))}</p>}
                  {retakeStatus === "error" && (
                    <>
                      <p role="alert" className="auth-message-error mt-5">{t("onboarding.placement.retakeError")}</p>
                      <button type="button" className="parle-button-secondary mt-3 w-full justify-center sm:w-auto" onClick={retryRetakeCheck} disabled={busy}>
                        {t("onboarding.placement.retakeRetry")}
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {retakeStatus === "ready" && (
                    <Link to="/placement-test" className="parle-button-primary mt-7 w-full justify-center sm:w-auto">
                      {t("onboarding.placement.takeTest")}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  )}
                  {skipError && <p role="alert" className="auth-message-error mt-5">{t(skipError)}</p>}
                  <button type="button" className="parle-button-secondary mt-3 w-full justify-center sm:w-auto" onClick={skipPlacement} disabled={busy} aria-busy={busy}>
                    {t(busy ? "onboarding.placement.saving" : "onboarding.placement.skip")}
                  </button>
                </div>
              )}

              {flow.phase === "unverified_result" && (
                <div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Compass aria-hidden="true" className="h-6 w-6" /></div>
                  <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("onboarding.result.eyebrow")}</p>
                  <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("onboarding.result.title")}</h1>
                  <div className="mt-6 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-bold text-foreground">{t("onboarding.result.statusLabel")}</p>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#EEF2FA] px-3.5 py-2 text-sm font-extrabold text-primary"><span className="h-2 w-2 rounded-full bg-[#F97362]" />{t("onboarding.result.unverified")}</span>
                    </div>
                    <div className="mt-5 border-t border-primary/10 pt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("onboarding.result.selfAssessmentLabel")}</p>
                      <p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{selfAssessmentLevel}</p>
                      {selfAssessmentChoice && <p className="mt-1 text-sm font-semibold text-foreground">{t(selfAssessmentChoice.labelKey)}</p>}
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("onboarding.result.selfAssessmentNote").replace("{level}", selfAssessmentLevel)}</p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] px-4 py-3 text-sm font-bold leading-6 text-[#8D342D]">{t("onboarding.result.estimateLabel")}</p>
                  <Link to="/learner" className="parle-button-primary mt-7 w-full justify-center sm:w-auto">
                    {t("onboarding.result.roadmapCta")}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </div>
              )}

              {flow.phase === "roadmap_preparing" && (
                <div className="py-8 text-center sm:py-12" aria-live="polite">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#EEF2FA] text-primary"><Clock3 aria-hidden="true" className="h-7 w-7" /></span>
                  <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-4xl">{t("onboarding.roadmap.preparing")}</h1>
                  <Link to="/learner" className="parle-button-primary mt-7 justify-center">
                    {t("onboarding.result.roadmapCta")}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </motion.section>
          </AnimatePresence>
        </main>
      )}

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs leading-5 text-muted-foreground sm:px-6 lg:px-8">
        {t("onboarding.footer")}
      </footer>
    </div>
  );
}
