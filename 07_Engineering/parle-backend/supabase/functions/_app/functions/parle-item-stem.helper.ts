// GENERATED from parle-app/functions/parle-item-stem.helper.ts by scripts/sync-app-code.ts. Do not edit.
/**
 * AI lesson and practice items whose stem already holds what the answer adds, e.g. "Hier, je ___ avec mon patron."
 * with the answer "j'ai parlé" (D25 b). Such items are dropped before a learner sees them.
 */
const SUBJECT_PRONOUNS = new Set(["je", "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"]);

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").toLowerCase();

function wordBeforeBlank(stem: string): string {
  const at = stem.search(/_{2,}/);
  if (at < 0) return "";
  return /([a-z]+)'?\s*$/.exec(stem.slice(0, at))?.[1] ?? "";
}

function firstWord(answer: string): string {
  return /^\s*([a-z]+)(?:'|\s|$)/.exec(answer)?.[1] ?? "";
}

export function stemRepeatsAnswer(prompt: string, answerText: string): boolean {
  const before = wordBeforeBlank(plain(prompt));
  const answer = plain(answerText).trim();
  const first = firstWord(answer);
  if (!before || !first) return false;
  // A single pronoun is a valid object or reflexive answer ("Je ___ en prie" + "vous", "Nous ___ levons" + "nous");
  // only an answer that brings a subject plus more ("j'ai parlé", "elle va") repeats the stem (final review).
  if (!/^j'|\s/.test(answer)) return false;
  if (SUBJECT_PRONOUNS.has(before) && SUBJECT_PRONOUNS.has(first)) return true;
  return before === first;
}

export function itemStemIsMalformed(item: { prompt: string; options: Array<{ id: string; text: string }>; answer_option_id: string }): boolean {
  const correct = item.options.find((o) => o.id === item.answer_option_id);
  return Boolean(correct) && stemRepeatsAnswer(item.prompt, correct!.text);
}

export function usablePracticeQuestions<T extends { prompt: string; options: Array<{ id: string; text: string }>; answer_option_id: string }>(questions: T[]): T[] {
  return questions.filter((q) => !itemStemIsMalformed(q));
}
