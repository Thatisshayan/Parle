import { t, type TranslationKey } from "@/lib/i18n";
import type { SpeakingResult } from "@/lib/voice-client";

const ROWS: Array<[keyof SpeakingResult["criteria"], TranslationKey]> = [
  ["task_completion", "voice.result.taskCompletion"],
  ["vocabulary", "voice.result.vocabulary"],
  ["grammar", "voice.result.grammar"],
  ["coherence_fluency", "voice.result.coherence"],
];

/** Spec 4.2: what we heard, four criteria, the practice estimate with NCLC, up to three corrections, one tip. */
export function SpeakingResultCard({ result }: { result: SpeakingResult }) {
  return (
    <section aria-label={t("voice.result.estimate")} className="min-w-0 space-y-4 rounded-2xl border border-[#B9D9CB] bg-[#F0F8F4] p-4 sm:p-5">
      {result.mode === "typed" && <p className="rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#205D45]">{t("voice.result.typed")}</p>}
      <div>
        <h4 className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#287252]">{t("voice.result.heard")}</h4>
        <p lang="fr" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{result.transcript}</p>
      </div>
      <div>
        <h4 className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#287252]">{t("voice.result.criteria")}</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ROWS.map(([key, label]) => (
            <div key={key} className="min-w-0 rounded-xl border border-[#B9D9CB]/70 bg-white p-3">
              <p className="break-words text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{t(label)}</p>
              <p className="mt-1 font-display text-xl font-extrabold text-primary">{result.criteria[key]}<span className="ml-1 text-xs font-bold text-muted-foreground">/ 4</span></p>
              {key === "coherence_fluency" && result.wordsPerMinute !== null && <p className="mt-1 text-[11px] text-muted-foreground">{t("voice.result.rate", { wpm: result.wordsPerMinute })}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white p-3">
        <p className="font-display text-lg font-extrabold text-primary">{t("voice.result.level", { level: result.level, nclc: result.nclc })}</p>
        <p className="mt-1 text-xs font-bold text-[#8D342D]">{t("voice.result.estimate")}</p>
      </div>
      {result.corrections.length > 0 && (
        <div>
          <h4 className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#287252]">{t("voice.result.corrections")}</h4>
          <ul className="mt-2 space-y-2">
            {result.corrections.map((c, i) => (
              <li key={i} className="break-words rounded-xl bg-white px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]">
                <p lang="fr">{t("voice.result.correction", { said: c.said, better: c.better })}</p>
                {c.reason && <p dir="auto" className="text-xs text-muted-foreground">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#287252]">{t("voice.result.tip")}</h4>
        <p dir="auto" className="mt-1 break-words text-sm leading-6 text-foreground">{result.tip}</p>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">{t("voice.result.pronunciation")}</p>
    </section>
  );
}
