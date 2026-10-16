// @ts-nocheck -- run with Node (npx tsx): one NVIDIA call makes a French sample for the browser's fake microphone
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { nvidiaProvider } from "../../../parle-app/api/_voice/nvidia.ts";
import { pcmWav } from "../../../parle-app/api/_voice/wav.ts";
import { resample } from "../../../parle-app/src/lib/voice-audio.ts";
import { readSecret } from "../lib/secrets";

/** Writes parle-voice-sample-22k.wav (fake microphone) and parle-voice-sample-16k.wav (relay checks) to the temp folder. */
const TEXT = "Le week-end dernier, je suis allé au marché avec ma sœur. Nous avons acheté des légumes frais et du pain. Ensuite, nous avons pris un café sur la terrasse parce qu'il faisait très beau. J'aime beaucoup ces moments en famille.";
const speech = await nvidiaProvider(readSecret("NVIDIA_API_KEY")).synthesize(TEXT);
const padded = new Int16Array(speech.length + 2 * 22050);
padded.set(speech, 22050); // one second of silence before and after
writeFileSync(`${tmpdir()}/parle-voice-sample-22k.wav`, pcmWav(padded, 22050));
const low = resample(Float32Array.from(padded, (v) => v / 32768), 22050, 16000);
writeFileSync(`${tmpdir()}/parle-voice-sample-16k.wav`, pcmWav(Int16Array.from(low, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)), 16000));
console.log(`sample: ${(speech.length / 22050).toFixed(1)} s of speech written to the temp folder`);
process.exit(0);
