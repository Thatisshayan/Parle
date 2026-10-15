// GENERATED from parle-app/functions/parle-practice-content.helper.ts by scripts/sync-app-code.ts. Do not edit.
/**
 * Whether AI practice content is worth showing for its task. Same rules as before per task type, plus one (R42): an AI
 * lesson whose questions were all dropped as malformed would show a passage with no questions, so it is not useful and
 * the approved bank is used instead (as for listening and vocabulary).
 */
export function practiceContentIsUseful(
  taskType: string,
  content: { text: string; vocabulary: unknown[]; questions: unknown[]; steps: unknown[] },
  askedQuestions: number,
): boolean {
  const longText = content.text.trim().length >= 40;
  const hasQuestions = content.questions.length > 0;
  if (taskType === "ai_lesson" && askedQuestions > 0 && !hasQuestions) return false;
  if (taskType === "vocabulary_drill") return content.vocabulary.length > 0 || hasQuestions;
  if (taskType === "listening_exercise") return longText && hasQuestions;
  if (taskType === "speaking_practice" || taskType === "speaking_check" || taskType === "writing") return longText;
  return longText || content.steps.length > 0 || content.vocabulary.length > 0 || hasQuestions;
}
