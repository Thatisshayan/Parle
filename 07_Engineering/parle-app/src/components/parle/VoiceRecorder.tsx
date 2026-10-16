import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Keyboard, LoaderCircle, Mic, RotateCcw, Send, Square } from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import { formatClock, isSilent } from "@/lib/voice-audio";
import { blobToSamples, MicrophoneError, startRecording, type Recording } from "@/lib/voice-recorder";
import { transcribe, voiceErrorKey, VoiceRequestError, type Transcription } from "@/lib/voice-client";

type Phase = "idle" | "asking" | "recording" | "preparing" | "recorded" | "sending";
type Problem = { key: TranslationKey; offerTyping: boolean; plan?: "free" | "premium"; limit?: number };

/** Record, a visible timer, Stop, Record again, Send (spec 4.1). Re-recording before sending is free (spec 4.3). */
export function VoiceRecorder({ purpose, refId, maxMs, disabled = false, onTranscribed, onTypeInstead }: {
  purpose: "answer" | "placement" | "message";
  refId: string;
  maxMs: number;
  disabled?: boolean;
  onTranscribed: (result: Transcription) => void;
  onTypeInstead?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const recording = useRef<Recording | null>(null);
  useEffect(() => () => recording.current?.cancel(), []);

  async function stop() {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setPhase("preparing");
    const blob = await current.stop();
    setAnnouncement(t("voice.recorder.stopped"));
    try {
      const pcm = await blobToSamples(blob);
      if (isSilent(pcm)) { setPhase("idle"); setProblem({ key: "voice.tooQuiet", offerTyping: false }); return; }
      setSamples(pcm);
      setPhase("recorded");
    } catch {
      setPhase("idle");
      setProblem({ key: "voice.decodeFailed", offerTyping: true });
    }
  }

  async function start() {
    setProblem(null);
    setSamples(null);
    setElapsed(0);
    setPhase("asking");
    try {
      recording.current = await startRecording(maxMs, setElapsed, () => void stop());
      setPhase("recording");
      setAnnouncement(t("voice.recorder.started"));
    } catch (error) {
      setPhase("idle");
      const code = error instanceof MicrophoneError ? error.code : "unsupported";
      setProblem({ key: code === "denied" ? "voice.micDenied" : code === "no_device" ? "voice.micMissing" : "voice.micUnsupported", offerTyping: true });
    }
  }

  async function send() {
    if (!samples) return;
    setPhase("sending");
    setProblem(null);
    try {
      const result = await transcribe(samples, purpose, refId);
      setSamples(null);
      setPhase("idle");
      onTranscribed(result);
    } catch (error) {
      setPhase("recorded");
      const limited = error instanceof VoiceRequestError && error.code === "LIMIT_REACHED";
      setProblem({ key: voiceErrorKey(error, purpose === "message" ? "message" : "answer"), offerTyping: limited, plan: limited ? error.info.plan : undefined, limit: limited ? error.info.limit : undefined });
    }
  }

  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div className="min-w-0 space-y-3">
      {phase === "idle" && <p className="text-xs leading-5 text-muted-foreground">{t("voice.recorder.permissionNote")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {(phase === "idle" || phase === "asking") && (
          <button type="button" onClick={() => void start()} disabled={disabled || phase === "asking"} aria-label={t("voice.recorder.recordLabel")} className={`${button} bg-primary text-white hover:bg-[#172E70]`}>
            {phase === "asking" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Mic aria-hidden="true" className="h-4 w-4" />}{t("voice.recorder.record")}
          </button>
        )}
        {phase === "recording" && (
          <button type="button" onClick={() => void stop()} className={`${button} bg-[#A13F36] text-white hover:bg-[#8D342D]`}>
            <Square aria-hidden="true" className="h-4 w-4" />{t("voice.recorder.stop")}
          </button>
        )}
        {(phase === "recorded" || phase === "sending") && (
          <>
            <button type="button" onClick={() => void send()} disabled={disabled || phase === "sending"} className={`${button} bg-primary text-white hover:bg-[#172E70]`}>
              {phase === "sending" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
              {t(phase === "sending" ? "voice.recorder.sending" : purpose === "message" ? "voice.recorder.useRecording" : "voice.recorder.send")}
            </button>
            <button type="button" onClick={() => void start()} disabled={phase === "sending"} className={`${button} border border-primary/15 bg-white text-primary hover:bg-[#F7F8FB]`}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />{t("voice.recorder.rerecord")}
            </button>
          </>
        )}
        {phase === "preparing" && <span role="status" className="inline-flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("voice.recorder.preparing")}</span>}
      </div>
      {phase === "recording" && (
        <p role="timer" aria-live="off" className="flex items-center gap-2 text-sm font-bold text-[#A13F36]">
          <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#C64D43]" />
          {t("voice.recorder.recording", { time: formatClock(elapsed), max: formatClock(maxMs) })}
        </p>
      )}
      {phase === "recorded" && <p className="text-xs leading-5 text-muted-foreground">{t("voice.recorder.recorded", { time: formatClock(elapsed) })}</p>}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {problem && (
        <div role="alert" className="break-words rounded-xl border border-[#F2CDC7] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D]">
          <p>{t(problem.key)}</p>
          {problem.plan === "premium" && typeof problem.limit === "number" && <p className="mt-1">{t("voice.limit.premiumNote", { limit: problem.limit })}</p>}
          {problem.plan === "free" && <p className="mt-1">{t("voice.limit.upgrade")} <Link to="/learner/plan" className="font-extrabold underline underline-offset-2">{t("voice.limit.upgradeLink")}</Link></p>}
          {problem.offerTyping && onTypeInstead && (
            <button type="button" onClick={onTypeInstead} className={`${button} mt-2 border border-[#E9BDB6] bg-white text-[#8D342D]`}>
              <Keyboard aria-hidden="true" className="h-4 w-4" />{t("voice.typeInstead")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
