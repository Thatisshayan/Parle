import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sameSecret } from "./secret.ts";
import { applyBuildyQuery } from "../_app/src/lib/backend/query.ts";
import RULES from "./entity-rules.json" with { type: "json" };
import { ruleAllows, ruleToFilter, type BuildyUser, type Rule } from "./rules.ts";
import { completeJson } from "./ai.ts";
import { sendMail } from "./email.ts";
import { pausedUser } from "./account-status.ts";

export type { BuildyUser };
type Op = "read" | "create" | "update" | "delete";
type Mode = { kind: "service" } | { kind: "caller"; user: BuildyUser };
const ENTITY_RULES = RULES as Record<string, Record<Op, Rule>>;
const PROTECTED = ["id", "owner_id", "created_by", "created_at", "updated_at"];

export class CompatError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = "CompatError"; }
}

function fullRights(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in, email-confirmed user behind a token, in Buildy's `User.me()` shape; null otherwise. */
export async function buildyUserFromToken(db: SupabaseClient, token: string): Promise<BuildyUser | null> {
  const { data, error } = await db.auth.getUser(token);
  const u = data?.user;
  if (error || !u?.email || !u.email_confirmed_at || pausedUser(u)) return null; // a paused account (Plan 8)
  const name = (u.user_metadata as Record<string, unknown> | undefined)?.full_name;
  return {
    id: u.id,
    email: u.email,
    full_name: typeof name === "string" && name.trim() ? name : null,
    role: (u.app_metadata as Record<string, unknown> | undefined)?.role === "admin" ? "administrator" : "user",
  };
}

const rulesFor = (name: string) => {
  const r = ENTITY_RULES[name];
  if (!r) throw new CompatError(`API request failed: Unknown entity ${name}`, 400);
  return r;
};
const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !PROTECTED.includes(k)));
const failed = (e: { message: string }, status = 400): never => { throw new CompatError(`API request failed: ${e.message}`, status); };

function entityApi(db: SupabaseClient, name: string, mode: () => Promise<Mode>) {
  const readScope = async () => {
    const m = await mode();
    rulesFor(name);
    if (m.kind === "service" || m.user.role === "administrator") return { kind: "all" } as const; // admin reads with full rights (spec 4)
    return ruleToFilter(rulesFor(name).read, m.user);
  };
  async function filter(query: Record<string, unknown> = {}, sort?: string, limit?: number, skip?: number): Promise<Record<string, any>[]> {
    const scope = await readScope();
    if (scope.kind === "none") return [];
    const run = (s?: string) => {
      let q: any = db.from(name).select("*");
      if (scope.kind === "where") q = q.or(scope.expr);
      return applyBuildyQuery(q, query ?? {}, s, limit, skip);
    };
    let { data, error } = await run(sort);
    if (error && sort && /column|could not find|does not exist/i.test(error.message)) ({ data, error } = await run(undefined)); // Buildy ignored unknown sort fields
    if (error) failed(error);
    return (data ?? []) as Record<string, any>[];
  }
  async function stored(id: string): Promise<Record<string, any>> {
    const { data, error } = await db.from(name).select("*").eq("id", id).maybeSingle();
    if (error) failed(error);
    const m = await mode();
    // A row the caller may not even read answers exactly like a missing one, so ids do not reveal what exists (R25).
    const hidden = data && m.kind === "caller" && m.user.role !== "administrator" && !ruleAllows(rulesFor(name).read, m.user, data);
    if (!data || hidden) throw new CompatError("API request failed: Not found", 404);
    return data;
  }
  async function guard(op: Op, row: Record<string, unknown>) {
    const m = await mode();
    if (m.kind === "caller" && !ruleAllows(rulesFor(name)[op], m.user, row)) throw new CompatError("API request failed: Permission denied", 403);
    return m;
  }
  async function prepareCreate(row: Record<string, unknown>) {
    const m = await mode();
    const values = m.kind === "caller"
      ? { ...strip(row), created_by: m.user.email, owner_id: m.user.id }
      : Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)));
    await guard("create", values);
    return values;
  }
  return {
    filter,
    async list(sort?: string, limit?: number) { return filter({}, sort, limit); },
    async get(id: string) {
      const [row] = await filter({ id }, undefined, 1);
      if (!row) throw new CompatError("API request failed: Not found", 404);
      return row;
    },
    async create(row: Record<string, unknown>) {
      const { data, error } = await db.from(name).insert(await prepareCreate(row)).select("*").single();
      if (error) failed(error);
      return data;
    },
    async bulkCreate(rows: Record<string, unknown>[]) {
      const values = [];
      for (const r of rows ?? []) values.push(await prepareCreate(r));
      if (!values.length) return [];
      const { data, error } = await db.from(name).insert(values).select("*");
      if (error) failed(error);
      return data ?? [];
    },
    /** With `match`, a compare-and-set: the write happens only while those columns still hold those values (null = no longer matched). */
    async update(id: string, row: Record<string, unknown>, match?: Record<string, unknown>) {
      const before = await stored(id);
      const changes = strip(row);
      await guard("update", before);
      await guard("update", { ...before, ...changes }); // a write may not move the row out of the caller's reach
      let q: any = db.from(name).update(changes).eq("id", id);
      for (const [k, v] of Object.entries(match ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
      const { data, error } = await (match ? q.select("*").maybeSingle() : q.select("*").single());
      if (error) failed(error);
      return data ?? null;
    },
    async delete(id: string) {
      await guard("delete", await stored(id));
      const { error } = await db.from(name).delete().eq("id", id);
      if (error) failed(error);
      return { success: true };
    },
  };
}

async function listUsers(db: SupabaseClient) {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) failed(error, 500);
    for (const u of data.users) {
      const name = (u.user_metadata as any)?.full_name;
      out.push({ id: u.id, email: u.email ?? "", full_name: typeof name === "string" ? name : null, role: (u.app_metadata as any)?.role === "admin" ? "administrator" : "user", created_at: u.created_at });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** Drop-in for Buildy's createSuperdevClient on the server (spec section 6: only the data-client calls change). */
export function createSuperdevClient(_opts: { appId?: string } = {}) {
  return buildClient(null);
}

/**
 * For server jobs only (Stripe webhook, billing re-check): act as one user, with that user's Buildy rules and
 * ownership, exactly as the code ran on Buildy when that learner was the caller. Never built from request input.
 */
export function createSuperdevClientAs(user: BuildyUser) {
  return buildClient(user);
}

function buildClient(actAs: BuildyUser | null) {
  const db = fullRights();
  let token = "";
  let resolved: Promise<Mode> | null = actAs ? Promise.resolve({ kind: "caller", user: actAs } as const) : null;
  const mode = (): Promise<Mode> => {
    resolved ??= (async () => {
      if (sameSecret(token, Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "")) return { kind: "service" } as const;
      const user = token ? await buildyUserFromToken(db, token) : null;
      if (!user) throw new CompatError("API request failed: Authentication required", 401);
      return { kind: "caller", user } as const;
    })();
    return resolved;
  };
  const callerOnly = async () => {
    const m = await mode();
    if (m.kind !== "caller") throw new CompatError("API request failed: Authentication required", 401);
    return m.user;
  };
  const apis = new Map<string, ReturnType<typeof entityApi>>();
  const entity = (name: string) => {
    if (!apis.has(name)) apis.set(name, entityApi(db, name, mode));
    return apis.get(name)!;
  };
  return {
    auth: {
      setToken(next: string) { if (actAs) return; token = next ?? ""; resolved = null; },
      me: callerOnly,
      async list() {
        const m = await mode();
        if (m.kind === "caller" && m.user.role !== "administrator") throw new CompatError("API request failed: Permission denied", 403);
        return listUsers(db);
      },
    },
    entities: new Proxy({} as Record<string, ReturnType<typeof entityApi>>, {
      get: (_t, name) => (typeof name === "string" && name !== "then" ? entity(name) : undefined),
    }),
    entity,
    integrations: {
      core: {
        async invokeLLM(params: { prompt: string; mode?: string; response_json_schema?: Record<string, unknown>; signal?: AbortSignal }) {
          await mode();
          return completeJson(db, { prompt: params.prompt, schema: params.response_json_schema, mode: params.mode === "fast" ? "fast" : "standard", signal: params.signal });
        },
        async sendEmail(params: { to: string; subject: string; body_html: string; from_name?: string }) {
          await mode();
          return sendMail({ to: params.to, subject: params.subject, html: params.body_html, fromName: params.from_name, from: "automatic" });
        },
      },
    },
    usage: {
      async increment(input: { userId: string; period: string; periodKey: string; limit: number }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { data, error } = await db.rpc("increment_usage", {
          p_user_id: user.id, p_period: input.period, p_period_key: input.periodKey, p_owner: user.id, p_amount: 1, p_limit: input.limit, p_created_by: user.email,
        });
        if (error) failed(error, 500);
        return data as { ok: boolean; used: number };
      },
      /** R128: one AI reply at a time per learner; returns the claim's token, or null while another reply holds it. A
       * claim left by a stopped worker frees itself after 150 s (the worker's own limit; a reply can take 85 s). */
      async claimReply(input: { userId: string }): Promise<string | null> {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { data, error } = await db.rpc("tutor_reply_claim", { p_user: user.id, p_seconds: 150 });
        if (error) failed(error, 500);
        return typeof data === "string" && data ? data : null;
      },
      /** Releases only the claim this request took (its token), never a later one. */
      async releaseReply(input: { userId: string; token: string }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { error } = await db.rpc("tutor_reply_release", { p_user: user.id, p_token: input.token });
        if (error) failed(error, 500);
      },
      /** Gives back one message counted for a reply that then failed (final review 4). */
      async release(input: { userId: string; period: string; periodKey: string }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { error } = await db.rpc("release_usage", { p_user_id: user.id, p_period: input.period, p_period_key: input.periodKey, p_amount: 1 });
        if (error) failed(error, 500);
      },
    },
    atomic: {
      /** A setting and its audit row in one transaction (S24); administrators only. */
      async saveSettingWithAudit(input: { key: string; value: string; updatedBy: string; audit: Record<string, unknown> }) {
        const user = await callerOnly();
        if (user.role !== "administrator") throw new CompatError("API request failed: Permission denied", 403);
        const { error } = await db.rpc("save_setting_with_audit", {
          p_key: input.key, p_value: input.value, p_updated_by: input.updatedBy, p_owner: user.id, p_created_by: user.email, p_audit: input.audit,
        });
        if (error) failed(error, 500);
      },
    },
    serviceDb: () => db,
  };
}
