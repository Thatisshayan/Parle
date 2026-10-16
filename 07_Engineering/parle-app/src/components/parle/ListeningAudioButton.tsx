import { useEffect, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { listeningUrl } from "@/lib/voice-client";

/** Spec 5: listening items with a script get natural French audio, made once and reused; never counted. */
export function ListeningAudioButton({ kind, id }: { kind: "question_item" | "learner_task"; id: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUrl(""); setFailed(false); }, [kind, id]);
  if (url) return <audio controls autoPlay preload="auto" src={url} className="mt-2 w-full">{t("voice.listening.unavailable")}</audio>;
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try { setUrl(await listeningUrl(kind, id)); } catch { setFailed(true); } finally { setBusy(false); }
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
        {t(busy ? "voice.listening.loading" : "voice.listening.play")}
      </button>
      {failed && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{t("voice.listening.unavailable")}</p>}
    </div>
  );
}
