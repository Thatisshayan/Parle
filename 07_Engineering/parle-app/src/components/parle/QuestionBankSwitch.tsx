import { useEffect, useState } from "react";
import { Database, LoaderCircle } from "lucide-react";
import { adminErrorKey, loadBankStatus, setBankSource, type BankCounts, type BankSourceName, type BankStatus } from "@/lib/parle-admin";
import { t, type TranslationKey } from "@/lib/i18n";

const LEVELS = ["A1", "A2", "B1", "B2"] as const;
const SKILL_KEYS: Record<string, TranslationKey> = { listening: "learner.skill.listening", reading: "learner.skill.reading", grammar_vocabulary: "adminBankSwitch.grammar" };
const KIND_KEYS: Record<string, TranslationKey> = { writing: "learner.skill.writing", speaking: "learner.skill.speaking" };
const QUESTION_MINIMUM = 10;
const PROMPT_MINIMUM = 2;

function Grid({ rows, minimum, labels }: { rows: Record<string, Record<string, number>>; minimum: number; labels: Record<string, TranslationKey> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] text-left text-xs">
        <thead><tr><th className="py-1 pr-2 font-bold text-[#5B667C]" />{LEVELS.map((l) => <th key={l} className="px-2 py-1 font-bold text-[#5B667C]">{l}</th>)}</tr></thead>
        <tbody>
          {Object.entries(rows).map(([key, counts]) => (
            <tr key={key} className="border-t border-[#EEF1F5]">
              <th scope="row" className="py-1 pr-2 font-semibold text-[#1E315C]">{t(labels[key])}</th>
              {LEVELS.map((l) => <td key={l} className={`px-2 py-1 tabular-nums ${counts[l] < minimum ? "font-extrabold text-[#B64C42]" : "text-[#1E315C]"}`}>{counts[l]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankCard({ name, counts, active }: { name: BankSourceName; counts: BankCounts; active: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${active ? "border-primary/30 bg-[#F5F8FD]" : "border-[#E1E5EC] bg-white"}`}>
      <p className="text-sm font-extrabold text-primary">{t(name === "demo" ? "adminBankSwitch.demo" : "adminBankSwitch.real")}{active ? ` · ${t("adminBankSwitch.inUse")}` : ""}</p>
      <p className={`mt-1 text-xs font-bold ${counts.ready ? "text-[#2F6B3F]" : "text-[#B64C42]"}`}>{t(counts.ready ? "adminBankSwitch.ready" : "adminBankSwitch.notReady")}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#5B667C]">{t("adminBankSwitch.questions")}</p>
      <Grid rows={counts.questions} minimum={QUESTION_MINIMUM} labels={SKILL_KEYS} />
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#5B667C]">{t("adminBankSwitch.prompts")}</p>
      <Grid rows={counts.prompts} minimum={PROMPT_MINIMUM} labels={KIND_KEYS} />
    </div>
  );
}

/** Admin Content: which question bank placement, check-ins and the public level check serve (bank readers fix). */
export default function QuestionBankSwitch() {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => loadBankStatus().then((s) => { setStatus(s); setError(null); }, (e) => setError(adminErrorKey(e)));
  useEffect(() => { void refresh(); }, []);
  if (!status) return error ? <p role="alert" className="text-sm text-[#8D342D]">{t(error)}</p> : null;
  const next: BankSourceName = status.source === "demo" ? "real" : "demo";
  const blocked = next === "real" && !status.real.ready;
  async function change() {
    setBusy(true);
    try { await setBankSource(next); setConfirming(false); await refresh(); } catch (e) { setError(adminErrorKey(e)); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="admin-bank-heading" className="min-w-0 rounded-[1.35rem] border border-[#E2E6EE] bg-white p-4 sm:p-5">
      <h3 id="admin-bank-heading" className="inline-flex items-center gap-2 font-display text-lg font-extrabold text-primary"><Database aria-hidden="true" className="h-4 w-4" />{t("adminBankSwitch.heading")}</h3>
      <p className="mt-1 text-sm leading-6 text-[#5B667C]">{t("adminBankSwitch.intro")}</p>
      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
        <BankCard name="demo" counts={status.demo} active={status.source === "demo"} />
        <BankCard name="real" counts={status.real} active={status.source === "real"} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[#8D342D]">{t(error)}</p>}
      {blocked ? <p className="mt-4 text-sm text-[#805916]">{t("adminBankSwitch.blocked")}</p> : confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#1E315C]">{t(next === "real" ? "adminBankSwitch.confirmReal" : "adminBankSwitch.confirmDemo")}</p>
          <button type="button" disabled={busy} onClick={() => void change()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white disabled:opacity-60">{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t("adminBankSwitch.yesSwitch")}</button>
          <button type="button" onClick={() => setConfirming(false)} className="inline-flex min-h-10 items-center rounded-full border border-[#D9DEE7] px-4 text-xs font-extrabold">{t("adminBankSwitch.cancel")}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-4 inline-flex min-h-10 items-center rounded-full border border-primary/30 px-4 text-xs font-extrabold text-primary">{t(next === "real" ? "adminBankSwitch.switchReal" : "adminBankSwitch.switchDemo")}</button>
      )}
    </section>
  );
}
