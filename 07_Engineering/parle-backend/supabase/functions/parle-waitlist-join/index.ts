import { serviceClient } from "../_shared/db.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { clientIp, takeRateLimit } from "../_shared/rate-limit.ts";
import { serveWithLimitedBody, type Guard } from "../_shared/serve.ts";

const limited = () => fail("RATE_LIMITED", 429, "Too many requests. Try again later.");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const GOALS = new Set(["immigration", "citizenship", "work", "conversation", "travel", "other"]);

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const requestLimit: Guard = async (req) => {
  if (req.method !== "POST") return null;
  const db = serviceClient();
  const ip = clientIp(req);
  if (ip !== "unknown" && !(await takeRateLimit(db, `waitlist-join:ip:${ip}`, 3600, 20))) return limited();
  // Also bound total additions if callers rotate addresses or the gateway does not provide an address header.
  if (!(await takeRateLimit(db, "waitlist-join:all", 3600, 1000))) return limited();
  return null;
};

serveWithLimitedBody(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().includes("application/json")) {
    return fail("INVALID_INPUT", 400);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("INVALID_INPUT", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("INVALID_INPUT", 400);
  }

  // Preserve the static form's honeypot behavior at the server boundary as well.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  if (body.consent !== true) return fail("CONSENT_REQUIRED", 400);

  const email = typeof body.p_email === "string" ? body.p_email.trim().toLowerCase() : "";
  const role = body.p_role === "tutor" ? "tutor" : body.p_role === "learner" ? "learner" : "";
  const goal = body.p_goal === null || body.p_goal === "" ? null : body.p_goal;
  if (!EMAIL.test(email) || email.length > 254) return json({ ok: false, error: "invalid_email" });
  if (!role || (goal !== null && (typeof goal !== "string" || !GOALS.has(goal)))) return fail("INVALID_INPUT", 400);

  const addressKey = await digest(email);
  const db = serviceClient();
  if (!(await takeRateLimit(db, `waitlist-join:email:${addressKey}`, 3600, 3))) return limited();

  const { data, error } = await db.rpc("join_waitlist", {
    p_email: email,
    p_role: role,
    p_goal: goal,
    p_locale: typeof body.p_locale === "string" ? body.p_locale.slice(0, 20) : null,
    p_source: typeof body.p_source === "string" ? body.p_source.slice(0, 100) : null,
  });
  if (error) throw error;
  return json(data);
}, 2048, requestLimit);
