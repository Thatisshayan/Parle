import { serviceClient } from "../_shared/db.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { serveWith } from "../_shared/serve.ts";
import { clientIp, takeRateLimit } from "../_shared/rate-limit.ts";
import { recordUnsubscribe } from "../_shared/waitlist/unsubscribe.ts";

const INVALID = () => fail("TOKEN_INVALID", 400, "This unsubscribe link is not valid.");

/**
 * Public, no login (spec 4.5). The unsubscribe page POSTs JSON { token }; a mail app's one-click button POSTs
 * "List-Unsubscribe=One-Click" to the URL in the List-Unsubscribe header (RFC 8058), token in ?t=.
 */
serveWith(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405, "Open the link in the email.");
  const db = serviceClient();
  if (!(await takeRateLimit(db, `unsubscribe:${clientIp(req)}`, 3600, 60))) return fail("RATE_LIMITED", 429, "Too many requests. Try again later.");
  let token = new URL(req.url).searchParams.get("t") ?? "";
  let source: "link" | "header" = "header";
  if ((req.headers.get("Content-Type") ?? "").includes("application/json")) {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
    token = typeof body.token === "string" ? body.token : "";
    source = "link";
  } else if (!/List-Unsubscribe=One-Click/i.test(await req.text())) {
    return fail("INVALID_INPUT", 400);
  }
  if (!token || token.length > 1000) return INVALID();
  try {
    const result = await recordUnsubscribe(db, token, source);
    if (!result) return INVALID();
    return json(source === "link" ? { status: "unsubscribed", email: result.email } : { status: "unsubscribed" });
  } catch (e) {
    console.error("parle-waitlist-unsubscribe", (e as Error).message);
    return fail("REQUEST_FAILED", 500, "Something went wrong. Please try again in a minute.");
  }
});
