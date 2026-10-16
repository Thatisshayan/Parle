import { useEffect, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { listeningUrl, loadListeningMissing } from "@/lib/voice-client";

/** Spec 5: an admin "prepare audio" action fills the listening cache ahead of time (after the Lesson Bank import). */
export function AdminListeningAudio() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [missing, setMissing] = useState<Array<{ item_kind: "question_item" | "learner_task"; item_id: string }>>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState<{ done: number; failed: number; count: number } | null>(null);
  const [running, setRunning] = useState(false);

  async function load() {
    setState("loading");
    try {
      const r = await loadListeningMissing();
      setMissing(r.missing);
      setTotal(r.total);
      setState("ready");
    } catch {
      setState("error");
    }
  }
  useEffect(() => { void load(); }, []);

  async function prepare() {
    setRunning(true);
    let done = 0, failed = 0;
    const count = missing.length;
    setProgress({ done, failed, count });
    for (const item of missing) {
      try { await listeningUrl(item.item_kind, item.item_id); done++; } catch { failed++; }
      setProgress({ done, failed, count });
    }
    setRunning(false);
    await load();
  }

  return (
    <section aria-labelledby="admin-listening-title" className="min-w-0 rounded-[1.35rem] border border-[#E1E5EC] bg-white p-4 shadow-[0_14px_34px_-30px_rgba(23,43,91,0.45)] sm:p-5">
      <h3 id="admin-listening-title" className="flex items-center gap-2 font-display text-base font-extrabold text-[#1E315C]"><Volume2 aria-hidden="true" className="h-4 w-4" />{t("adminListening.title")}</h3>
      <p className="mt-1 text-sm leading-6 text-[#5B667C]">{t("adminListening.intro")}</p>
      {state === "loading" && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#5B667C]"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /></p>}
      {state === "error" && <p role="alert" className="mt-3 text-sm text-[#8D342D]">{t("adminListening.loadFailed")}</p>}
      {state === "ready" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-[#1E315C]">{missing.length ? t("adminListening.missing", { count: missing.length, total }) : t("adminListening.allReady")}</p>
          {missing.length > 0 && (
            <button type="button" onClick={() => void prepare()} disabled={running} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1E3A8A] px-4 text-sm font-bold text-white disabled:opacity-60">
              {running && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}{t("adminListening.prepare")}
            </button>
          )}
        </div>
      )}
      {progress && (
        <p role="status" className="mt-2 text-xs text-[#5B667C]">
          {t("adminListening.progress", { done: progress.done, count: progress.count })}
          {progress.failed > 0 && ` ${t("adminListening.failedCount", { count: progress.failed })}`}
        </p>
      )}
    </section>
  );
}
