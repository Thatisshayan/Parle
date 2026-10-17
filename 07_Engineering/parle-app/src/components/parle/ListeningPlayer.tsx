import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { ListeningAudioButton } from "@/components/parle/ListeningAudioButton";

/**
 * Plan 13: a listening question's audio. A prepared file plays directly; if it will not play (its link expired after
 * an hour, or the file is missing), a signed-in learner gets the Listen button, which asks for a fresh link and then
 * offers "Try again" and "Skip this question" (onGiveUp). The signed-out level check (no item id) offers "Try again".
 * Without a prepared file, the Listen button is shown at once.
 */
export function ListeningPlayer({ audioUrl, itemId, onGiveUp }: { audioUrl?: string; itemId?: string; onGiveUp?: () => void }) {
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setBroken(false); setAttempt(0); }, [audioUrl, itemId]);
  if (audioUrl && !broken) {
    return <audio key={attempt} controls preload="none" src={audioUrl} onError={() => setBroken(true)} className="mt-2 w-full">{t("voice.listening.unavailable")}</audio>;
  }
  if (itemId) return <ListeningAudioButton kind="question_item" id={itemId} onGiveUp={onGiveUp} />;
  return (
    <div className="mt-2">
      <p role="status" className="text-xs leading-5 text-muted-foreground">{t("voice.listening.retry")}</p>
      <button type="button" onClick={() => { setBroken(false); setAttempt((n) => n + 1); }} className="mt-2 inline-flex min-h-10 items-center rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {t("voice.listening.play")}
      </button>
    </div>
  );
}
