import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { VoiceRecorder } from "@/components/parle/VoiceRecorder";
import { SpeakingResultCard } from "@/components/parle/SpeakingResultCard";
import { t, type TranslationKey } from "@/lib/i18n";
import type { LearnerTaskView } from "@/lib/learner-plan-remote";
import { ANSWER_MAX_MS } from "@/lib/voice-audio";
import { afterScoreError, loadTaskSpeakingResult, scoreSpokenAnswer, scoreTypedAnswer, voiceErrorFrom, voiceErrorKey, type ScoreOutcome, type SpeakingResult } from "@/lib/voice-client";

/** Spec 4.1: the speaking task card shows the prompt (above), Record, a timer, Stop, Re-record, Send, then the result. */
export function SpeakingTaskPanel({ task, onScored, disabled }: { task: LearnerTaskView; onScored: () => void; disabled: boolean }) {
  const [result, setResult] = useState<SpeakingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TranslationKey | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  // a recording whose scoring failed: "Try again" scores it again without a new recording or a new use
  const [retryTicket, setRetryTicket] = useState<string | null>(null);
  const open = task.status === "planned" || task.status === "rolled";

  useEffect(() => {
    let active = true;
    if (!open && !result) void loadTaskSpeakingResult(task.id).then((saved) => { if (active) setResult(saved); }).catch(() => undefined);
    return () => { active = false; };
  }, [task.id, open, result]);

  async function score(run: () => Promise<ScoreOutcome>, typedAnswer: boolean, ticketId: string | null = null) {
    setBusy(true);
    setProblem(null);
    setRetryTicket(null);
    try {
      const outcome = await run();
      if (outcome.status === "scored") { setResult(outcome.result); onScored(); }
      else setProblem(outcome.status === "not_french" ? "voice.notFrench" : typedAnswer ? "voice.task.typedTooShort" : "voice.tooQuiet");
    } catch (error) {
      const failure = voiceErrorFrom(error);
      const next = afterScoreError(failure);
      if (next === "load_result") {
        const saved = await loadTaskSpeakingResult(task.id).catch(() => null);
        if (saved) { setResult(saved); onScored(); return; }
      }
      if (next === "retry_score" && ticketId) setRetryTicket(ticketId);
      setProblem(voiceErrorKey(failure, "answer"));
    } finally {
      setBusy(false);
    }
  }

  if (result) return <div className="mt-4"><SpeakingResultCard result={result} /></div>;
  if (!open) return null;
  return (
    <section aria-labelledby={`speak-${task.id}`} className="mt-4 min-w-0 rounded-2xl border border-primary/10 bg-white p-4">
      <h4 id={`speak-${task.id}`} className="font-display text-sm font-extrabold text-primary">{t("voice.task.title")}</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("voice.task.intro")}</p>
      <div className="mt-3">
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-primary"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("voice.task.scoring")}</p>
        ) : typing ? (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); void score(() => scoreTypedAnswer(task.id, typed), true); }} className="space-y-2">
            <label htmlFor={`typed-${task.id}`} className="block text-xs font-bold text-foreground">{t("voice.task.typedLabel")}</label>
            <textarea id={`typed-${task.id}`} lang="fr" rows={5} maxLength={4000} value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <button type="submit" disabled={disabled || !typed.trim()} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60">{t("voice.task.typedSubmit")}</button>
          </form>
        ) : (
          <VoiceRecorder purpose="answer" refId={task.id} maxMs={ANSWER_MAX_MS} disabled={disabled} onTranscribed={(r) => void score(() => scoreSpokenAnswer(r.ticketId, task.id), false, r.ticketId)} onTypeInstead={() => setTyping(true)} />
        )}
      </div>
      {problem && <p role="alert" className="mt-3 rounded-xl border border-[#F2CDC7] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D]">{t(problem)}</p>}
      {retryTicket && !busy && (
        <button type="button" onClick={() => { const ticket = retryTicket; void score(() => scoreSpokenAnswer(ticket, task.id), false, ticket); }} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white">{t("voice.task.retryScore")}</button>
      )}
    </section>
  );
}
