/**
 * The weekly check-in as the browser receives it: no answer keys or explanations, and (Plan 13) a listening question
 * carries the address of its prepared audio instead of its transcript; an item without prepared audio gets "" and the
 * page's Listen button has it made from the server's copy.
 */
export type AudioLookup = (ids: string[]) => Promise<Map<string, string>>;

export async function checkInForBrowser<T>(session: T, audioFor: AudioLookup): Promise<T> {
  const s = session as Record<string, any>;
  if (!s || !Array.isArray(s.questions)) return session;
  const listeningIds = s.questions.filter((q: any) => q?.kind === "listening").map((q: any) => String(q.id));
  const audio = listeningIds.length ? await audioFor(listeningIds) : new Map<string, string>();
  const questions = s.questions.map(({ answerOptionId: _a, explanation: _e, ...question }: Record<string, any>) =>
    question.kind === "listening" ? { ...question, text: "", audioUrl: audio.get(String(question.id)) ?? "" } : question);
  return { ...s, questions } as T;
}
