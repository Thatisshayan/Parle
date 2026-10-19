import { itemStemIsMalformed } from "../../../parle-app/functions/parle-item-stem.helper.ts";

/**
 * The question bank's rules (B6, D3), shared by scripts/checks/bank-audit.ts (reports problems) and
 * scripts/migrate/import-lesson-bank.ts (refuses to write a row that breaks one) (Plan 13).
 */
export type Row = Record<string, any>;
export type Option = { id: string; text: string };
export const plain = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export function optionsOf(q: Row): Option[] {
  let raw = q.options;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  return (Array.isArray(raw) ? raw : []).map((o: any) => (typeof o === "string" ? { id: o, text: o } : { id: String(o?.id ?? ""), text: String(o?.text ?? "") }));
}
export function questionProblems(q: Row): string[] {
  const p: string[] = [];
  if (typeof q.prompt !== "string" || !q.prompt.trim()) p.push("no prompt");
  if (!["listening", "reading", "grammar_vocabulary"].includes(String(q.skill))) p.push(`skill "${q.skill}"`);
  if (!["A1", "A2", "B1", "B2"].includes(String(q.cefr_level))) p.push(`level "${q.cefr_level}"`);
  if (q.format !== "multiple_choice") p.push(`format "${q.format}", expected multiple_choice`);
  const options = optionsOf(q);
  let rawOptions: unknown = q.options;
  if (typeof rawOptions === "string") { try { rawOptions = JSON.parse(rawOptions); } catch { rawOptions = null; } }
  if (!Array.isArray(rawOptions)) p.push("options must be a JSON array");
  else if (rawOptions.some((option) => !option || typeof option !== "object" || Array.isArray(option) || typeof option.id !== "string" || typeof option.text !== "string")) p.push("options must contain object ids and texts");
  const ids = options.map((o) => o.id);
  const correct = options.find((o) => o.id === q.answer_option_id);
  if (options.length < 2 || options.length > 4) p.push(`${options.length} options (2 to 4 expected)`);
  if (new Set(ids).size !== ids.length) p.push("duplicate option ids");
  if (new Set(options.map((o) => plain(o.text))).size !== options.length) p.push("duplicate option texts");
  if (options.some((o) => !o.id.trim() || o.id.trim() !== o.id || !o.text.trim())) p.push("an empty or untrimmed option");
  if (!correct) p.push("the answer id is not one of the options");
  if (correct && q.answer && plain(q.answer) !== plain(correct.text)) p.push("saved answer text differs from the correct option");
  if (typeof q.explanation !== "string" || !q.explanation.trim()) p.push("no explanation");
  if (typeof q.answer_option_id !== "string" || !q.answer_option_id.trim() || q.answer_option_id.trim() !== q.answer_option_id) p.push("answer option id must be non-empty trimmed text");
  if (typeof q.answer !== "string") p.push("answer must be text");
  for (const field of ["passage", "transcript", "audio_url"] as const) {
    if (q[field] !== undefined && typeof q[field] !== "string") p.push(`${field} must be text when supplied`);
  }
  if (q.skill === "listening" && !String(q.transcript ?? "").trim()) p.push("listening item without a transcript");
  if (correct && itemStemIsMalformed({ prompt: String(q.prompt ?? ""), options, answer_option_id: q.answer_option_id })) p.push("the stem already holds the answer's subject");
  const stem = plain(`${q.prompt ?? ""}`);
  // plain() strips accents, so "où" is "ou"; the conjunction "ou" can also match, and the founder reads every flagged row
  if (correct && /(^|[\s,«"])ou\s/.test(stem) && stem.includes("?") && !/^(a|au|aux|dans|chez|en|sur|sous|pres|devant|derriere|par|vers)\b/.test(plain(correct.text))) p.push("a where-question whose answer is not a place");
  if (correct && /\bpourquoi\b/.test(stem) && !/^(parce|pour|a cause|car)\b/.test(plain(correct.text))) p.push("a why-question whose answer gives no reason");
  return p;
}
export function promptProblems(r: Row): string[] {
  const p: string[] = [];
  if (typeof r.text !== "string" || !r.text.trim()) p.push("no text");
  if (r.kind !== "writing" && r.kind !== "speaking") p.push(`kind "${r.kind}"`);
  if (!["A1", "A2", "B1", "B2"].includes(String(r.cefr_level))) p.push(`level "${r.cefr_level}"`);
  if (r.track !== "all") p.push(`track "${r.track}", expected all`);
  return p;
}
