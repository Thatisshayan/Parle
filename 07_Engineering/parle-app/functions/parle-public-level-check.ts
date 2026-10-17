import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";
import {
  createPublicLevelCheckRunId,
  parsePublicLevelCheckRunId,
  parsePublicLevelCheckSubmissions,
  scorePublicLevelCheckRun,
  selectPublicLevelCheckQuestions,
  type PublicLevelCheckSubmission,
} from "./parle-public-level-check.helper.ts";

const appId = Deno.env.get("SUPERDEV_APP_ID");
const RUN_LIFETIME_MS = 60 * 60 * 1000;
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers(jsonHeaders);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function recordsFromResponse(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isRecord) as Row[];
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord) as Row[];
  throw new Error("An approved level-check record could not be read.");
}

function serviceEntityClient(serviceRoleKey: string): any {
  if (!appId) throw new Error("The public level-check service is not configured.");
  const client = createSuperdevClient({ appId }) as any;
  client.auth.setToken(serviceRoleKey);
  return client;
}

function entityFor(client: any, name: string, requiredMethods: string[]): any {
  const entity = client.entities?.[name];
  if (!entity || requiredMethods.some((method) => typeof entity[method] !== "function")) {
    throw new Error("A required level-check record type is unavailable.");
  }
  return entity;
}

/**
 * Plan 13: prepared audio for listening items, by item id. The check is used signed out, so it can only play audio
 * that already exists; the server entry (parle-backend) supplies the lookup. Without one, no listening item qualifies.
 */
type PreparedAudioLookup = {
  /** Which listening items can be played (by item id), without signing anything. */
  ready: (rows: Row[]) => Promise<Map<string, string>>;
  /** Playable addresses for the questions actually shown. */
  sign: (chosen: Map<string, string>) => Promise<Map<string, string>>;
};
let preparedAudio: PreparedAudioLookup = { ready: async () => new Map(), sign: async () => new Map() };
export function setPreparedAudioLookup(lookup: PreparedAudioLookup): void {
  preparedAudio = lookup;
}

/** The bank the question_bank_source switch names (bank readers fix, R94); a missing setting reads as "real". */
async function bankSource(client: any): Promise<"demo" | "real"> {
  const entity = entityFor(client, "app_setting", ["filter"]);
  const rows = recordsFromResponse(await entity.filter({ key: "question_bank_source" }, "-updated_at", 1));
  return rows[0]?.value === "demo" ? "demo" : "real";
}

/** Approved questions of one bank, read in pages of 1,000 (the API's row cap), up to 2,000. */
async function loadApprovedQuestionRows(client: any, source: "demo" | "real"): Promise<Row[]> {
  const entity = entityFor(client, "question_item", ["filter"]);
  const rows: Row[] = [];
  for (let skip = 0; skip < 2000; skip += 1000) {
    const page = recordsFromResponse(await entity.filter({ status: "approved", is_test_data: source === "demo" }, "id", 1000, skip));
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    });
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Vary", "Origin");
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, origin);

  let body: unknown;
  try {
    const bodyText = await request.text();
    if (bodyText.length > 32_000) return jsonResponse({ error: "REQUEST_TOO_LARGE" }, 413, origin);
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "REQUEST_INVALID" }, 400, origin);
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return jsonResponse({ error: "REQUEST_INVALID" }, 400, origin);
  }
  if (body.action !== "start" && body.action !== "score") {
    return jsonResponse({ error: "ACTION_INVALID" }, 400, origin);
  }

  let submissions: PublicLevelCheckSubmission[] | null = null;
  let runId: string | null = null;
  if (body.action === "start") {
    if (!hasExactKeys(body, ["action"])) return jsonResponse({ error: "REQUEST_INVALID" }, 400, origin);
  } else {
    if (!hasExactKeys(body, ["action", "runId", "answers"])) {
      return jsonResponse({ error: "REQUEST_INVALID" }, 400, origin);
    }
    runId = parsePublicLevelCheckRunId(body.runId);
    if (!runId) return jsonResponse({ error: "RUN_INVALID" }, 400, origin);
    submissions = parsePublicLevelCheckSubmissions(body.answers);
    if (!submissions) return jsonResponse({ error: "SUBMISSIONS_INVALID" }, 400, origin);
  }

  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
  if (!appId || !serviceRoleKey) return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503, origin);

  try {
    const client = serviceEntityClient(serviceRoleKey);
    if (body.action === "start") {
      const source = await bankSource(client);
      const rows = await loadApprovedQuestionRows(client, source);
      const ready = await preparedAudio.ready(rows.filter((row) => row.skill === "listening"));
      const questionSet = selectPublicLevelCheckQuestions(rows, Math.random, source, ready);
      if (questionSet) {
        // sign only the listening questions shown; a question whose file cannot be signed makes the set unavailable
        const shown = questionSet.publicProjection.questions.filter((q) => q.skill === "listening");
        const signed = await preparedAudio.sign(new Map(shown.map((q) => [q.id, ready.get(q.id) ?? ""])));
        for (const q of shown) q.audioUrl = signed.get(q.id) ?? "";
        if (shown.some((q) => !q.audioUrl)) return jsonResponse({ error: "QUESTION_BANK_UNAVAILABLE" }, 503, origin);
      }
      if (!questionSet) return jsonResponse({ error: "QUESTION_BANK_UNAVAILABLE" }, 503, origin);

      const opaqueRunId = createPublicLevelCheckRunId();
      const runEntity = entityFor(client, "ParlePublicLevelCheckRun", ["create"]);
      await runEntity.create({
        run_id: opaqueRunId,
        question_mapping_json: JSON.stringify(questionSet.privateMapping),
        expires_at: new Date(Date.now() + RUN_LIFETIME_MS).toISOString(),
      });

      // The allowlisted projection omits the private option map and all bank answer metadata.
      return jsonResponse({ ...questionSet.publicProjection, runId: opaqueRunId }, 200, origin);
    }

    const runEntity = entityFor(client, "ParlePublicLevelCheckRun", ["filter", "delete"]);
    const score = await scorePublicLevelCheckRun(runId, submissions, {
      findByRunId: async (requestedRunId) => {
        const matchingRows = recordsFromResponse(await runEntity.filter({ run_id: requestedRunId }, "-created_at", 2));
        return matchingRows.length === 1 ? matchingRows[0] : null;
      },
      deleteById: async (recordId) => {
        await runEntity.delete(recordId);
      },
    });
    if (!score) return jsonResponse({ error: "RUN_INVALID" }, 400, origin);
    return jsonResponse(score, 200, origin);
  } catch (error) {
    // Never log request bodies, run IDs, mappings, submitted choices, or score data.
    console.error("Parle public level check request failed", error instanceof Error ? error.name : "unknown");
    return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }
});
