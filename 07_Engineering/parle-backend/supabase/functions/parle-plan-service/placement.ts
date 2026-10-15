import {
  applyAdaptiveAnswer,
  assemblePlacementResult,
  countWords,
  createAdaptiveRun,
  createBalancedOptionOrder,
  emptyCorrectPositionCounts,
  getNextQuestion,
  getRetakeGate,
  normalizeStoredText,
  parseTargetPerSkill,
  selectApprovedDemoQuestionItems,
  summarizeAutoRun,
  validatePromptBank,
  validateQuestionBank,
  validateWritingAssessment,
  type AdaptiveRun,
  type AutoSectionKey,
  type AutoSectionSummary,
  type CorrectPositionCounts,
  type PromptItem,
  type QuestionItem,
  type QuestionOption,
  type Track,
  type WritingAssessment,
} from "../_app/src/lib/placement-test.ts";
import { parleAssessmentService } from "../_shared/app-shims/functions.ts";
import { current } from "../_shared/app-shims/context.ts";

/** A refusal the learner caused (bad run id, wrong order); the service answers 400. */
export class PlacementError extends Error {}

const AUTO: AutoSectionKey[] = ["listening", "reading", "grammar_vocabulary"];
type State = {
  track: Track;
  selfLevel: string;
  targetPerSkill: string;
  run: AdaptiveRun | null;
  served: { id: string; options: QuestionOption[] } | null;
  autoResults: AutoSectionSummary[];
  skipped: string[];
  writing: WritingAssessment | null;
  counts: CorrectPositionCounts;
};
type Caller = { id: string; email: string; role: string };

const db = () => current().client.serviceDb();
const optional = (track: Track, section: string) => track === "citizenship" && (section === "reading" || section === "writing");

async function caller(): Promise<Caller> {
  return (await current().client.auth.me()) as Caller;
}

/** The approved demo bank, exactly as the page loaded it on Buildy (now read on the server only). */
async function bank(): Promise<{ questions: QuestionItem[]; prompts: PromptItem[] }> {
  const entities = current().client.entities as any;
  const [questionRows, promptRows] = await Promise.all([
    entities.question_item.filter({ status: "approved", is_test_data: true }, "demo_code", 150),
    entities.prompt_item.filter({ status: "approved", is_test_data: true }, "demo_code", 100),
  ]);
  const questions = selectApprovedDemoQuestionItems(questionRows);
  const prompts = (promptRows as PromptItem[])
    .filter((item) => item.status === "approved" && item.is_test_data)
    .map((item) => ({ ...item, text: normalizeStoredText(item.text) }));
  if (!validateQuestionBank(questions) || !validatePromptBank(prompts)) throw new PlacementError("BANK_INCOMPLETE");
  return { questions, prompts };
}

async function load(runId: unknown, user: Caller): Promise<{ id: string; state: State }> {
  if (typeof runId !== "string" || !runId) throw new PlacementError("RUN_NOT_FOUND");
  const { data, error } = await db().from("placement_run").select("id, state_json").eq("id", runId).eq("owner_id", user.id).eq("status", "open").maybeSingle();
  if (error || !data) throw new PlacementError("RUN_NOT_FOUND");
  return { id: data.id, state: JSON.parse(data.state_json) as State };
}

async function save(id: string, state: State, status: "open" | "finished" = "open") {
  const { error } = await db().from("placement_run").update({ state_json: JSON.stringify(state), status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** The question as the learner may see it before answering: no answer key, no explanation; options in served order. */
function publicQuestion(item: QuestionItem, options: QuestionOption[]) {
  const { answer_option_id: _a, answer: _b, explanation: _c, ...rest } = item as QuestionItem & Record<string, unknown>;
  return { ...rest, options };
}

export async function placementOpen() {
  const user = await caller();
  if (user.role === "administrator") return { screen: "access" };
  const entities = current().client.entities as any;
  const [profile] = await entities.learner_profile.filter({ created_by: user.email }, "-created_at", 1);
  if (!profile?.id || !profile.self_assessed_level) return { screen: "access" };
  const gate = await getRetakeGate(user.email);
  if (gate.blocked && gate.latest) return { screen: "result", record: gate.latest, gate };
  const { prompts } = await bank();
  await db().from("placement_run").update({ status: "abandoned" }).eq("owner_id", user.id).eq("status", "open");
  const state: State = {
    track: profile.track, selfLevel: profile.self_assessed_level, targetPerSkill: profile.target_per_skill ?? "",
    run: null, served: null, autoResults: [], skipped: [], writing: null, counts: emptyCorrectPositionCounts(),
  };
  const { data, error } = await db().from("placement_run").insert({ owner_id: user.id, user_id: user.id, state_json: JSON.stringify(state) }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "placement run could not be created");
  return {
    screen: "ready",
    runId: data.id,
    gate,
    profile: { id: profile.id, track: profile.track, self_assessed_level: profile.self_assessed_level, target_per_skill: profile.target_per_skill },
    prompts,
  };
}

export async function placementQuestion(body: Record<string, unknown>) {
  const user = await caller();
  const { id, state } = await load(body.runId, user);
  const section = body.section as AutoSectionKey;
  if (!AUTO.includes(section) || state.skipped.includes(section)) throw new PlacementError("SECTION_INVALID");
  if (state.autoResults.some((r) => r.section === section)) return { done: true };
  if (state.run && state.run.section !== section && !state.run.completed) throw new PlacementError("SECTION_IN_PROGRESS");
  const { questions } = await bank();
  if (!state.run || state.run.section !== section) {
    state.run = createAdaptiveRun(section, state.selfLevel);
    state.served = null;
  }
  if (state.served) {
    const item = questions.find((q) => q.id === state.served!.id);
    if (item) return { question: publicQuestion(item, state.served.options), run: state.run };
  }
  const next = getNextQuestion(state.run, questions);
  if (!next) return { done: true };
  const presentation = createBalancedOptionOrder(next, state.counts);
  state.counts = presentation.counts;
  state.served = { id: next.id, options: presentation.options };
  await save(id, state);
  return { question: publicQuestion(next, presentation.options), run: state.run };
}

export async function placementAnswer(body: Record<string, unknown>) {
  const user = await caller();
  const { id, state } = await load(body.runId, user);
  if (!state.run || !state.served) throw new PlacementError("NO_QUESTION_SERVED");
  const optionId = String(body.optionId ?? "");
  if (!state.served.options.some((o) => o.id === optionId)) throw new PlacementError("OPTION_INVALID");
  const { questions } = await bank();
  const item = questions.find((q) => q.id === state.served!.id);
  if (!item) throw new PlacementError("QUESTION_NOT_FOUND");
  const update = applyAdaptiveAnswer(state.run, item, optionId);
  state.run = update.run;
  state.served = null;
  if (update.completed) {
    state.autoResults = [...state.autoResults.filter((r) => r.section !== update.run.section), summarizeAutoRun(update.run)];
  }
  await save(id, state);
  return { update, item };
}

export async function placementSkip(body: Record<string, unknown>) {
  const user = await caller();
  const { id, state } = await load(body.runId, user);
  const section = String(body.section ?? "");
  if (!optional(state.track, section)) throw new PlacementError("SECTION_REQUIRED");
  if (!state.skipped.includes(section)) state.skipped.push(section);
  await save(id, state);
  return { ok: true };
}

export async function placementScoreWriting(body: Record<string, unknown>) {
  const user = await caller();
  const { id, state } = await load(body.runId, user);
  const { prompts } = await bank();
  const prompt = prompts.find((p) => p.id === body.promptId && p.kind === "writing");
  const text = String(body.text ?? "").trim();
  if (!prompt) throw new PlacementError("PROMPT_INVALID");
  const words = countWords(text);
  if (words < 40 || words > 120) throw new PlacementError("WRITING_LENGTH");
  const response = await parleAssessmentService({ action: "score_writing", response_text: text, prompt_text: prompt.text, cefr_level: prompt.cefr_level });
  const assessment = validateWritingAssessment(response, prompt, text);
  state.writing = assessment;
  await save(id, state);
  return { assessment };
}

export async function placementFinish(body: Record<string, unknown>) {
  const user = await caller();
  const { id, state } = await load(body.runId, user);
  for (const section of AUTO) {
    if (!state.autoResults.some((r) => r.section === section) && !state.skipped.includes(section)) throw new PlacementError("SECTIONS_INCOMPLETE");
  }
  if (!state.writing && !state.skipped.includes("writing")) throw new PlacementError("SECTIONS_INCOMPLETE");
  const snapshot = assemblePlacementResult({
    track: state.track,
    targetPerSkill: parseTargetPerSkill(state.targetPerSkill),
    autoSections: state.autoResults,
    writing: state.writing,
    skippedSections: state.skipped,
  });
  const grammarScore = snapshot.grammarScore ?? { correct: 0, total: 0 };
  const record = await (current().client.entities as any).placement_result.create({
    user_id: user.id,
    taken_at: new Date().toISOString(),
    level_per_skill: JSON.stringify(snapshot.levels),
    nclc_estimate_per_skill: JSON.stringify(snapshot.nclcEstimates),
    skill_state_per_skill: JSON.stringify(snapshot.states),
    score_per_skill: JSON.stringify(snapshot.scores),
    feedback_per_skill: JSON.stringify(snapshot.feedback),
    grammar_vocabulary_level: snapshot.grammarLevel ?? "",
    grammar_vocabulary_score: JSON.stringify(grammarScore),
    target_per_skill_at_test: JSON.stringify(snapshot.targetPerSkill),
    speaking_assessed: false,
    responses: JSON.stringify(snapshot.responses),
    status: "assessed",
    self_assessed_level: state.selfLevel,
    source: "placement_test",
    track: state.track,
  });
  await save(id, state, "finished");
  return { record, snapshot };
}
