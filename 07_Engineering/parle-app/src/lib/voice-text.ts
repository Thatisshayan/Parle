/**
 * Plan 9: text rules shared by the app and the server (copied to supabase/functions/_app by
 * parle-backend/scripts/sync-app-code.ts). Pure functions only, no imports.
 */
export type SpeakingLevel = "A1" | "A2" | "B1" | "B2" | "C1";
export const SPEAKING_LEVELS: readonly SpeakingLevel[] = ["A1", "A2", "B1", "B2", "C1"];
/** Spec 4.3: "Under about 10 words or silent: not scored, not counted". */
export const MIN_ANSWER_WORDS = 10;
/** Spec 3: text up to about 1,000 characters per call; longer replies are split by the app. */
export const MAX_SPEAK_CHARS = 1000;

export function countSpokenWords(text: string): number {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0;
}

/** Whisper's well-known inventions on silence or noise (subtitle credits, video sign-offs, sound tags). */
const INVENTIONS: RegExp[] = [
  /sous-titr\p{L}*[^!?\n]*?(?:amara\.org|st'?\s*\d+|radio-canada|communaut[ée](?:\s+d'amara\.org)?)[.!?]?/giu,
  /merci d'avoir regard[ée](?: cette vid[ée]o)?\s*[.!]?/giu,
  /abonnez-vous[^.!?]*[.!?]?/giu,
  /\[(?:musique|music|applaudissements|rires|silence|bruit)\]/giu,
  /♪+/gu,
];

export function cleanTranscript(raw: string): string {
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
  let text = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const pattern of INVENTIONS) text = text.replace(pattern, " ");
  return text.replace(/\s+/g, " ").trim();
}

const FRENCH_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "est", "je", "j", "tu", "il", "elle", "nous", "vous", "ils",
  "elles", "que", "qu", "qui", "pas", "ne", "n", "ce", "c", "cette", "mon", "ma", "mes", "ton", "ta", "son", "sa",
  "leur", "au", "aux", "avec", "pour", "dans", "sur", "mais", "ou", "où", "donc", "car", "très", "suis", "sont", "ai",
  "avons", "avez", "ont", "été", "être", "fait", "y", "parce", "quand", "comme", "bien", "aussi", "moi", "chez",
  "bonjour", "merci", "oui", "non", "voici", "beaucoup", "maintenant", "aujourd", "hui", "travail", "j'ai",
]);
const ENGLISH_WORDS = new Set([
  "the", "an", "and", "is", "are", "was", "were", "i", "you", "he", "she", "we", "they", "it", "that", "this", "to",
  "of", "in", "with", "for", "not", "have", "has", "be", "my", "your", "but", "or", "so", "because", "what", "does",
  "did", "will", "would", "can", "there", "here", "yes", "hello", "thanks", "which", "from", "at", "by", "about",
  "just", "like", "great", "job", "remember", "takes", "went", "bought", "sister", "market",
]);

function wordsOf(text: string): string[] {
  return String(text ?? "").normalize("NFC").toLocaleLowerCase("fr").split(/[^\p{L}]+/u).filter(Boolean);
}

export function languageCounts(text: string): { french: number; english: number } {
  let french = 0, english = 0;
  for (const word of wordsOf(text)) {
    if (FRENCH_WORDS.has(word)) french++;
    else if (ENGLISH_WORDS.has(word)) english++;
  }
  return { french, english };
}

/** A sentence the French voice should read (Magpie speaks France French only, spec 5). */
export function looksFrench(text: string): boolean {
  const { french, english } = languageCounts(text);
  if (french + english === 0) return /[àâçéèêëîïôûùüÿœæ]/iu.test(text);
  return french >= english;
}

/** A transcript that is mostly not French (spec 4.3): checked before any AI cost. */
export function mostlyNotFrench(text: string): boolean {
  const { french, english } = languageCounts(text);
  return english >= 3 && english > french * 1.5;
}

/** Lines of a reply as they are spoken: list markers and markdown symbols removed, empty lines dropped. */
export function speechLines(text: string): string[] {
  return String(text ?? "")
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/u, "").replace(/[*_#`>|~]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function normalizeForSpeech(text: string): string {
  return speechLines(text).join(" ");
}

export function splitSentences(line: string): string[] {
  return String(line ?? "").split(/(?<=[.!?…])\s+/u).map((s) => s.trim()).filter(Boolean);
}

function hardSplit(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const space = rest.lastIndexOf(" ", max);
    const at = space > max / 2 ? space : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The French sentences of a reply, in order, grouped into chunks of at most `max` characters. A sentence without
 * closing punctuation always ends its chunk, so every sentence of a chunk is found as written in the reply (the
 * server checks this with spokenTextIsFrom).
 */
export function frenchChunks(text: string, max = MAX_SPEAK_CHARS): string[] {
  const pieces = speechLines(text).flatMap(splitSentences).filter(looksFrench).flatMap((s) => (s.length <= max ? [s] : hardSplit(s, max)));
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const closed = /[.!?…]$/u.test(current);
    if (current && (!closed || current.length + 1 + piece.length > max)) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** True when every sentence of `text` appears, as written, in `source` (a tutor reply). */
export function spokenTextIsFrom(text: string, source: string): boolean {
  const whole = normalizeForSpeech(source).toLocaleLowerCase("fr");
  const sentences = speechLines(text).flatMap(splitSentences);
  return sentences.length > 0 && sentences.every((s) => whole.includes(s.toLocaleLowerCase("fr")));
}

const NCLC: Record<SpeakingLevel, string> = { A1: "NCLC 2", A2: "NCLC 3-4", B1: "NCLC 5-7", B2: "NCLC 8-9", C1: "NCLC 10 or above" };
/** The NCLC equivalent shown with every speaking estimate (Plan 9 ruling 12; same bands as the placement result). */
export function speakingNclc(level: SpeakingLevel): string {
  return NCLC[level];
}

/** The placement bank's bands stop at B2 (Plan 9 ruling 11). */
export function placementSpeakingLevel(level: SpeakingLevel): "A1" | "A2" | "B1" | "B2" {
  return level === "C1" ? "B2" : level;
}

/** Words per minute, measured from the recording's length (spec 4.2); null for clips under 5 seconds. */
export function wordsPerMinute(words: number, durationMs: number): number | null {
  return durationMs >= 5000 ? Math.round(words / (durationMs / 60000)) : null;
}

const LEVEL_SCORE: Record<SpeakingLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
/** One step of at most 0.25 toward the scored level, on the 0-5 planning scale in quarter steps (ruling 10). */
export function nextSpeakingEstimate(current: number, level: SpeakingLevel): number {
  const from = Number.isFinite(current) ? Math.min(5, Math.max(0, current)) : 0;
  const step = Math.max(-0.25, Math.min(0.25, LEVEL_SCORE[level] - from));
  return Math.min(5, Math.max(0, Math.round((from + step) * 4) / 4));
}
