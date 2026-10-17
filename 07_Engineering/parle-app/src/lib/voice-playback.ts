import { frenchChunks } from "./voice-text";
import { speakChunk, VoiceRequestError } from "./voice-client";

export type PlayOutcome = "natural" | "browser" | "browser_limit" | "local" | "none" | "unavailable" | "stopped" | "needs_tap";

/** A reply saved on the server has a UUID; a message that exists only in the page (an opening line, an error) does not (A91). */
export const isSavedReplyId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** A very short silent WAV: played inside a tap, it lets phones (iPhone Safari) play this element later without a tap. */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
let silenceBlobUrl: string | null = null;
/**
 * The tap's silent unlock clip as a blob: address, made once: the app's media policy (vercel.json media-src) allows
 * blob: but not data:, so Safari refused the data: clip and replies could not play after the tap (Plan 12, found by
 * the iPhone emulation). Falls back to the data: clip where blob addresses do not exist.
 */
export function silenceUrl(): string {
  if (silenceBlobUrl) return silenceBlobUrl;
  try {
    const bytes = Uint8Array.from(atob(SILENCE.slice(SILENCE.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    silenceBlobUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    return silenceBlobUrl;
  } catch {
    return SILENCE;
  }
}

/**
 * Spec 5: the French sentences of a reply, spoken in order in the natural voice; Stop at any time; if the voice is
 * unavailable (limit reached or provider down) the browser's own voice reads, with a note.
 */
export class ReplyPlayer {
  private audio: HTMLAudioElement | null = null;
  private urls: string[] = [];
  private run = 0;

  /** One element for every reply (Plan 9 final review, Important 3): phones allow it to play once a tap unlocked it. */
  constructor(private readonly makeAudio: () => HTMLAudioElement = () => new Audio()) {}

  private element(): HTMLAudioElement {
    this.audio ??= this.makeAudio();
    return this.audio;
  }

  /** Call synchronously inside the tap (Listen, or switching read-aloud on). */
  unlock(): void {
    try {
      const audio = this.element();
      audio.src = silenceUrl();
      void audio.play().then(() => audio.pause(), () => undefined);
    } catch {
      // a browser without audio: the browser voice still reads
    }
  }

  stop(): void {
    this.run++;
    this.audio?.pause();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  async play(text: string, replyId: string, rate = 1): Promise<PlayOutcome> {
    this.stop();
    const run = this.run;
    const chunks = frenchChunks(text);
    if (!chunks.length) return "none";
    let index = 0;
    // Plan 11 (A91, R99): only saved replies can be read by the relay; page-only messages use the browser voice
    if (!isSavedReplyId(replyId)) return this.browser(chunks, rate, "local");
    try {
      for (; index < chunks.length; index++) {
        const blob = await speakChunk(chunks[index], replyId);
        if (run !== this.run) return "stopped";
        await this.playBlob(blob, rate);
        if (run !== this.run) return "stopped";
      }
      return "natural";
    } catch (error) {
      if (run !== this.run) return "stopped";
      // the phone refused to play without a tap: the reply is ready, the learner taps Listen (no browser voice either)
      if (error instanceof VoiceRequestError && error.code === "NEEDS_TAP") return "needs_tap";
      return this.browser(chunks.slice(index), rate, error instanceof VoiceRequestError && error.code === "LIMIT_REACHED" ? "browser_limit" : "browser");
    }
  }

  private playBlob(blob: Blob, rate: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      this.urls.push(url);
      const audio = this.element();
      audio.src = url;
      audio.playbackRate = rate;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new VoiceRequestError("VOICE_BUSY"));
      void audio.play().catch((error: unknown) => reject(error instanceof Error && error.name === "NotAllowedError" ? new VoiceRequestError("NEEDS_TAP") : error));
    });
  }

  private browser(chunks: string[], rate: number, outcome: "browser" | "browser_limit" | "local"): PlayOutcome {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return "unavailable";
    const voice = window.speechSynthesis.getVoices().find((v) => /^fr(?:[-_]|$)/i.test(v.lang));
    if (!voice) return "unavailable";
    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voice;
      utterance.lang = voice.lang || "fr-FR";
      utterance.rate = rate === 1 ? 1 : 0.72;
      window.speechSynthesis.speak(utterance);
    }
    return outcome;
  }
}
