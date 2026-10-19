import { parleAssessmentService } from "@/functions";

export type LearnerCoachNote =
  | { status: "generated"; text: string }
  | { status: "fallback"; text: "" };

const FALLBACK_NOTE: LearnerCoachNote = { status: "fallback", text: "" };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validGeneratedText(value: unknown): value is string {
  if (typeof value !== "string") return false;
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > 560) return false;
  const sentences = text.split(/[.!?؟。！？।]+(?=\s|$)/gu).map((part) => part.trim()).filter(Boolean);
  return sentences.length >= 2 && sentences.length <= 3 && /[.!?؟。！？।]$/.test(text);
}

export function normalizeLearnerCoachNoteResponse(response: unknown): LearnerCoachNote {
  if (!isObject(response)) return FALLBACK_NOTE;
  const root = isObject(response.data) ? response.data : response;
  const payload = isObject(root.result) ? root.result : root;
  if (payload.status !== "generated" || !validGeneratedText(payload.note)) return FALLBACK_NOTE;
  return { status: "generated", text: payload.note.replace(/\s+/g, " ").trim() };
}

/** Service failures and malformed responses become the Today screen's fixed translated fallback. */
export async function loadMyLearnerCoachNote(): Promise<LearnerCoachNote> {
  try {
    const response = await parleAssessmentService({ action: "learner_coach_note" });
    return normalizeLearnerCoachNoteResponse(response);
  } catch (error) {
    console.warn("Parle daily Coach note request could not be confirmed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return FALLBACK_NOTE;
  }
}
