import { frenchChunks } from "./voice-text";
import { speakChunk, VoiceRequestError } from "./voice-client";

export type PlayOutcome = "natural" | "browser" | "browser_limit" | "none" | "unavailable" | "stopped";

/**
 * Spec 5: the French sentences of a reply, spoken in order in the natural voice; Stop at any time; if the voice is
 * unavailable (limit reached or provider down) the browser's own voice reads, with a note.
 */
export class ReplyPlayer {
  private audio: HTMLAudioElement | null = null;
  private urls: string[] = [];
  private run = 0;

  stop(): void {
    this.run++;
    this.audio?.pause();
    this.audio = null;
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
    if (replyId) {
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
        return this.browser(chunks.slice(index), rate, error instanceof VoiceRequestError && error.code === "LIMIT_REACHED" ? "browser_limit" : "browser");
      }
    }
    return this.browser(chunks, rate, "browser");
  }

  private playBlob(blob: Blob, rate: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      this.urls.push(url);
      const audio = new Audio(url);
      audio.playbackRate = rate;
      this.audio = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new VoiceRequestError("VOICE_BUSY"));
      void audio.play().catch(reject);
    });
  }

  private browser(chunks: string[], rate: number, outcome: "browser" | "browser_limit"): PlayOutcome {
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
