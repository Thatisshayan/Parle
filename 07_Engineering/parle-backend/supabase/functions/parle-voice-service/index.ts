import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/caller.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { serveWith } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";
import { sameSecret, usableRelaySecret } from "../_shared/secret.ts";
import { VoiceError } from "../_shared/voice/context.ts";
import { runVoiceAction } from "../_shared/voice/actions.ts";

/**
 * Plan 9: voice limits, transcripts, speaking scores and listening audio. The relay (Vercel) calls with the
 * learner's token and the shared secret; the app calls with the learner's token. getCaller() refuses bad tokens,
 * unconfirmed emails and paused accounts, so the relay never reaches NVIDIA for them.
 */
serveWith(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const caller = await getCaller(req, db);
  if (!caller) return fail("AUTH_REQUIRED", 401, "Authentication required");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  const relaySecret = Deno.env.get("VOICE_RELAY_SECRET") ?? "";
  // Never allow a missing/placeholder/weak deployment setting to grant relay-only cache mutations.
  const relay = usableRelaySecret(relaySecret) && sameSecret(req.headers.get("x-voice-secret") ?? "", relaySecret);
  try {
    return json({ status: "complete", ...(await runVoiceAction({ db, caller, body, now: new Date(), relay })) });
  } catch (e) {
    if (e instanceof VoiceError) return json({ error: e.code, error_code: e.code, message: e.message, ...e.extra }, e.status);
    console.error("parle-voice-service", body.action, e instanceof Error ? e.name : "unknown");
    return fail("REQUEST_FAILED", 500, "Something went wrong. Please try again.");
  }
}, aiActionLimit);
