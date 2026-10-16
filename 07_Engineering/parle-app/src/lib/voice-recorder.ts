import { mixToMono, pickRecordingType, resample, UPLOAD_RATE } from "./voice-audio";

/** The microphone is asked for only when Record is pressed (spec 5). */
export class MicrophoneError extends Error {
  code: "denied" | "unsupported" | "no_device";
  constructor(code: "denied" | "unsupported" | "no_device") {
    super(code);
    this.code = code;
  }
}
export type Recording = { stop(): Promise<Blob>; cancel(): void };

export async function startRecording(maxMs: number, onTick: (ms: number) => void, onAutoStop: () => void): Promise<Recording> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new MicrophoneError("unsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    throw new MicrophoneError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "no_device" : "unsupported");
  }
  const type = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const started = Date.now();
  const timer = setInterval(() => {
    const ms = Date.now() - started;
    onTick(Math.min(ms, maxMs));
    if (ms >= maxMs) onAutoStop();
  }, 250);
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }));
    };
  });
  recorder.start(1000);
  const halt = () => { if (recorder.state !== "inactive") recorder.stop(); };
  return { stop: () => { halt(); return finished; }, cancel: halt };
}

/** Decodes the browser's own recording (WebM/Opus or MP4/AAC) to 16 kHz mono samples. */
export async function blobToSamples(blob: Blob): Promise<Float32Array> {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Context();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    return resample(mixToMono(channels), audio.sampleRate, UPLOAD_RATE);
  } finally {
    void context.close();
  }
}
