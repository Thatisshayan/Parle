import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readyAudioPaths, signAudioPaths } from "./listening.ts";

/**
 * Plan 13: audio for the signed-out public level check. ready() finds which listening items can be played (a real
 * recording, or audio already made from the transcript) without signing anything; sign() makes playable addresses for
 * the few questions actually shown. A lookup failure means "nothing ready", never an error.
 */
export function publicAudioHooks(db: SupabaseClient) {
  return {
    async ready(rows: Array<Record<string, unknown>>): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      const withoutRecording: Array<{ id: string; script: unknown }> = [];
      for (const row of rows) {
        const id = String(row.id ?? "");
        const recording = typeof row.audio_url === "string" ? row.audio_url.trim() : "";
        if (recording) out.set(id, recording); else withoutRecording.push({ id, script: row.transcript });
      }
      try {
        for (const [id, path] of await readyAudioPaths(db, "question_item", withoutRecording)) out.set(id, path);
      } catch (e) {
        console.warn("public check audio lookup failed", (e as Error)?.name ?? "unknown");
      }
      return out;
    },
    /** Recording addresses are kept; stored files are signed. */
    async sign(chosen: Map<string, string>): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      const files = new Map<string, string>();
      for (const [id, value] of chosen) {
        if (/^https?:\/\//.test(value)) out.set(id, value); else files.set(id, value);
      }
      try {
        for (const [id, url] of await signAudioPaths(db, files)) out.set(id, url);
      } catch (e) {
        console.warn("public check audio signing failed", (e as Error)?.name ?? "unknown");
      }
      return out;
    },
  };
}
