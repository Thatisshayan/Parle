import { useEffect, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { listeningUrl } from "@/lib/voice-client";
import { listeningFailureView } from "@/lib/listening-audio";

/**
 * Spec 5: listening items with a script get natural French audio, made once and reused; never counted.
 * Plan 13: with onGiveUp (a test question), a failure asks to try again, and a second failure offers "Skip this question".
 */
export function ListeningAudioButton({ kind, id, onGiveUp }: { kind: "question_item" | "learner_task"; id: string; onGiveUp?: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  useEffect(() => { setUrl(""); setFailures(0); }, [kind, id]);
  const view = listeningFailureView(failures, Boolean(onGiveUp));
  if (url) return <audio controls autoPlay preload="auto" src={url} className="mt-2 w-full">{t("voice.listening.unavailable")}</audio>;
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { setUrl(await listeningUrl(kind, id)); } catch { setFailures((n) => n + 1); } finally { setBusy(false); }
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
        {t(busy ? "voice.listening.loading" : "voice.listening.play")}
      </button>
      {view.messageKey && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{t(view.messageKey)}</p>}
      {view.canSkip && onGiveUp && (
        <button type="button" onClick={onGiveUp} className="mt-2 inline-flex min-h-10 items-center rounded-full border border-[#F2CDC7] bg-[#FFF5F2] px-4 text-xs font-extrabold text-[#8D342D] transition hover:bg-[#FFECE7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {t("voice.listening.skip")}
        </button>
      )}
    </div>
  );
}
