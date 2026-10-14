import {
  ADMIN_CONTENT_CATEGORIES,
  ADMIN_CONTENT_LEVELS,
  validateMergedContent,
  type AdminContentCategory,
  type AdminContentEditorOption,
  type AdminContentLevel,
  type AdminContentSource,
} from "./parle-admin-content.helper.ts";
import {
  AdminActionError,
  assertAdministrator,
  writeAdminAudit,
  type AdminActor,
} from "./parle-admin-settings.helper.ts";

export const ADMIN_DRAFT_REVIEW_NOTE = "AI-generated - review before approving";
export const ADMIN_DRAFT_MAX_COUNT = 5;

export interface AdminDraftAIProvider {
  complete(prompt: string, schema: Record<string, unknown>, mode?: "fast" | "standard"): Promise<unknown>;
}

interface DraftRequest {
  category: AdminContentCategory;
  level: AdminContentLevel;
  count: number;
  source: AdminContentSource;
}

type DraftContentEntity = {
  create: (record: Record<string, unknown>) => Promise<unknown>;
};

const QUESTION_CATEGORIES = new Set<AdminContentCategory>(["listening", "reading", "grammar_vocabulary"]);
const CATEGORY_SET = new Set<string>(ADMIN_CONTENT_CATEGORIES);
const LEVEL_SET = new Set<string>(ADMIN_CONTENT_LEVELS);
const INVALID_CONTENT_CODE = "CONTENT_DRAFT_GENERATION_FAILED";
const REQUEST_INVALID_CODE = "CONTENT_DRAFT_REQUEST_INVALID";
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const LEVEL_GUIDANCE: Record<AdminContentLevel, string> = {
  A1: "Use familiar words, short sentences, and one clear idea at a time.",
  A2: "Use everyday language, simple connected sentences, and predictable situations.",
  B1: "Use connected language about familiar situations, with enough detail to support a short inference.",
  B2: "Use fluent, varied French with a clear purpose, nuance, and realistic detail.",
};

const CATEGORY_GUIDANCE: Record<AdminContentCategory, string> = {
  listening: "LISTENING: write a natural spoken-French transcript in the transcript field, then ask one comprehension question about something the learner would hear. Leave passage empty. The transcript and question must agree, and the correct choice must be supported by the transcript.",
  reading: "READING: write a short French passage in the passage field, then ask one comprehension question grounded in that passage. Leave transcript empty. The passage and question must agree, and the correct choice must be supported by the passage.",
  grammar_vocabulary: "GRAMMAR AND VOCABULARY: write one clear French sentence-completion or usage question. Leave passage and transcript empty. Keep every option plausible, with exactly one correct choice and an explanation grounded in French usage.",
  writing_prompts: "WRITING PROMPT: give the learner a specific French writing task, its audience or situation, and a useful direction for what to include. Keep the task suitable for the selected CEFR level.",
  speaking_prompts: "SPEAKING PROMPT: give the learner a specific oral French task in a realistic situation. Invite a spoken response with a clear purpose and enough detail to start speaking at the selected CEFR level.",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidGeneration(): never {
  throw new AdminActionError(INVALID_CONTENT_CODE, 502);
}

function parseRequest(body: Record<string, unknown>): DraftRequest {
  if (typeof body.category !== "string" || !CATEGORY_SET.has(body.category)
    || typeof body.level !== "string" || !LEVEL_SET.has(body.level)
    || typeof body.count !== "number" || !Number.isSafeInteger(body.count)
    || body.count < 1 || body.count > ADMIN_DRAFT_MAX_COUNT) {
    throw new AdminActionError(REQUEST_INVALID_CODE, 400);
  }
  const category = body.category as AdminContentCategory;
  return {
    category,
    level: body.level as AdminContentLevel,
    count: body.count,
    source: QUESTION_CATEGORIES.has(category) ? "question" : "prompt",
  };
}

function modelText(value: unknown, maxLength: number, minLength = 1, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maxLength || CONTROL_CHARACTERS.test(value)) return invalidGeneration();
  const clean = value.replace(/\r\n?/g, "\n").trim();
  if ((!allowEmpty && clean.length < minLength) || (allowEmpty && clean.length > 0 && clean.length < minLength)) return invalidGeneration();
  return clean;
}

function unwrapModelPayload(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return invalidGeneration();
      }
    }
    if (isObject(current) && Object.prototype.hasOwnProperty.call(current, "result")) {
      current = current.result;
      continue;
    }
    if (isObject(current)) return current;
    return invalidGeneration();
  }
  return isObject(current) ? current : invalidGeneration();
}

function modelSchema(request: DraftRequest): Record<string, unknown> {
  const itemSchema = request.source === "prompt"
    ? {
      type: "object",
      properties: { text: { type: "string", minLength: 30, maxLength: 5000 } },
      required: ["text"],
    }
    : {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 3, maxLength: 1200 },
        passage: { type: "string", maxLength: 7000 },
        transcript: { type: "string", maxLength: 7000 },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1, maxLength: 80 },
              text: { type: "string", minLength: 1, maxLength: 500 },
            },
            required: ["id", "text"],
          },
        },
        answer_option_id: { type: "string", minLength: 1, maxLength: 80 },
        explanation: { type: "string", minLength: 8, maxLength: 3000 },
      },
      required: ["prompt", "passage", "transcript", "options", "answer_option_id", "explanation"],
    };
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: request.count,
        maxItems: request.count,
        items: itemSchema,
      },
    },
    required: ["items"],
  };
}

function generationPrompt(request: DraftRequest): string {
  const levelGuidance = LEVEL_GUIDANCE[request.level];
  const categoryGuidance = CATEGORY_GUIDANCE[request.category];
  const expectedFields = request.source === "question"
    ? "Each item must contain prompt, passage, transcript, options, answer_option_id, and explanation. Each option has an id and text."
    : "Each item must contain a text field only.";
  return [
    "Create candidate French-learning content for Parle's administrator-reviewed question bank.",
    "Return only structured JSON that matches the supplied schema. Do not include markdown or commentary.",
    `Category: ${request.category}. CEFR level: ${request.level}. Generate exactly ${request.count} distinct items.`,
    `Level guidance: ${levelGuidance}`,
    categoryGuidance,
    "Write all learner-facing content in French. Use natural, accurate French and keep the task clear for the stated level.",
    request.source === "question"
      ? "For every multiple-choice question, provide two to four plausible choices, exactly one correct option ID, and a short explanation. The explanation must match the correct option. Do not use status, test-data, author, provenance, or review fields."
      : "Write a complete task the learner can act on. Do not add an answer key, status, test-data, author, provenance, or review fields.",
    expectedFields,
  ].join("\n\n");
}

function uniqueDemoCode(category: AdminContentCategory, level: AdminContentLevel, used: Set<string>): string {
  let candidate = "";
  do {
    candidate = `AI-${category.toUpperCase()}-${level}-${crypto.randomUUID().toUpperCase()}`;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

function questionDraftFromModel(
  value: unknown,
  request: DraftRequest,
  demoCode: string,
): Record<string, unknown> {
  if (!isObject(value) || !Array.isArray(value.options)) return invalidGeneration();
  const prompt = modelText(value.prompt, 1200, 3);
  const passage = modelText(value.passage, 7000, 30, true);
  const transcript = modelText(value.transcript, 7000, 20, true);
  const explanation = modelText(value.explanation, 3000, 8);
  const answerOptionId = modelText(value.answer_option_id, 80);
  const options: AdminContentEditorOption[] = value.options.map((option) => {
    if (!isObject(option)) return invalidGeneration();
    return {
      id: modelText(option.id, 80),
      text: modelText(option.text, 500),
    };
  });

  if (request.category === "listening" && (!transcript || passage)) return invalidGeneration();
  if (request.category === "reading" && (!passage || transcript)) return invalidGeneration();
  if (request.category === "grammar_vocabulary" && (passage || transcript)) return invalidGeneration();

  const record: Record<string, unknown> = {
    demo_code: demoCode,
    skill: request.category,
    cefr_level: request.level,
    format: "multiple_choice",
    prompt,
    passage,
    transcript,
    options,
    answer_option_id: answerOptionId,
    answer: options.find((option) => option.id === answerOptionId)?.text ?? "",
    explanation,
    status: "draft",
    is_test_data: true,
    created_by_type: "ai",
    reviewed_by: ADMIN_DRAFT_REVIEW_NOTE,
  };
  try {
    validateMergedContent("question", record, options, answerOptionId);
  } catch {
    return invalidGeneration();
  }
  return record;
}

function promptDraftFromModel(
  value: unknown,
  request: DraftRequest,
  demoCode: string,
): Record<string, unknown> {
  if (!isObject(value)) return invalidGeneration();
  const text = modelText(value.text, 5000, 30);
  const kind = request.category === "writing_prompts" ? "writing" : "speaking";
  const record: Record<string, unknown> = {
    demo_code: demoCode,
    kind,
    cefr_level: request.level,
    track: "all",
    text,
    status: "draft",
    is_test_data: true,
    created_by_type: "ai",
    reviewed_by: ADMIN_DRAFT_REVIEW_NOTE,
  };
  try {
    validateMergedContent("prompt", record, [], "");
  } catch {
    return invalidGeneration();
  }
  return record;
}

function recordsFromModel(value: unknown, request: DraftRequest): Record<string, unknown>[] {
  const result = unwrapModelPayload(value);
  if (!Array.isArray(result.items) || result.items.length !== request.count) return invalidGeneration();
  const usedCodes = new Set<string>();
  return result.items.map((item) => {
    const code = uniqueDemoCode(request.category, request.level, usedCodes);
    return request.source === "question"
      ? questionDraftFromModel(item, request, code)
      : promptDraftFromModel(item, request, code);
  });
}

function draftEntity(client: unknown, source: AdminContentSource): DraftContentEntity {
  const name = source === "question" ? "question_item" : "prompt_item";
  if (!isObject(client) || !isObject(client.entities)) {
    throw new AdminActionError("CONTENT_DRAFT_STORAGE_UNAVAILABLE", 503);
  }
  const entity = client.entities[name];
  if (!isObject(entity) || typeof entity.create !== "function") {
    throw new AdminActionError("CONTENT_DRAFT_STORAGE_UNAVAILABLE", 503);
  }
  return entity as DraftContentEntity;
}

function createdRecordId(value: unknown): string {
  if (!isObject(value)) return "";
  if (typeof value.id === "string") return value.id.trim();
  if (isObject(value.data) && typeof value.data.id === "string") return value.data.id.trim();
  if (isObject(value.result) && typeof value.result.id === "string") return value.result.id.trim();
  return "";
}

function partialResult(
  request: DraftRequest,
  savedCount: number,
  auditedCount: number,
  itemIds: string[],
  partialReason: "content_write_failed" | "audit_write_failed" | "created_without_id",
): Record<string, unknown> {
  return {
    status: "partial",
    category: request.category,
    level: request.level,
    requested_count: request.count,
    saved_count: savedCount,
    audited_count: auditedCount,
    item_ids: itemIds,
    partial_reason: partialReason,
  };
}

export async function adminGenerateContentDraftsAction(
  client: unknown,
  actor: AdminActor,
  provider: AdminDraftAIProvider,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertAdministrator(actor);
  const request = parseRequest(body);

  if (!provider || typeof provider.complete !== "function") {
    throw new AdminActionError(INVALID_CONTENT_CODE, 502);
  }

  let preparedRecords: Record<string, unknown>[];
  try {
    const rawResult = await provider.complete(
      generationPrompt(request),
      modelSchema(request),
      "standard",
    );
    preparedRecords = recordsFromModel(rawResult, request);
  } catch (error) {
    console.error("Parle administrator draft generation could not validate the full AI batch", {
      category: request.category,
      level: request.level,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw error instanceof AdminActionError && error.code === INVALID_CONTENT_CODE
      ? error
      : new AdminActionError(INVALID_CONTENT_CODE, 502);
  }

  const entity = draftEntity(client, request.source);
  const itemIds: string[] = [];
  let savedCount = 0;
  let auditedCount = 0;
  for (const record of preparedRecords) {
    let created: unknown;
    try {
      created = await entity.create(record);
    } catch (error) {
      console.error("Parle administrator AI draft write could not be confirmed", {
        category: request.category,
        level: request.level,
        savedCount,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return partialResult(request, savedCount, auditedCount, itemIds, "content_write_failed");
    }

    savedCount += 1;
    const itemId = createdRecordId(created);
    if (!itemId || itemId.length > 160 || CONTROL_CHARACTERS.test(itemId)) {
      console.error("Parle administrator AI draft was created without a usable item ID", {
        category: request.category,
        level: request.level,
        savedCount,
      });
      return partialResult(request, savedCount, auditedCount, itemIds, "created_without_id");
    }
    itemIds.push(itemId);

    try {
      await writeAdminAudit(client, actor, {
        action: "question_bank.ai_draft_created",
        target_type: request.source === "question" ? "question_item" : "prompt_item",
        target_id: itemId,
        old_value: null,
        new_value: {
          status: "draft",
          is_test_data: true,
          created_by_type: "ai",
          reviewed_by: ADMIN_DRAFT_REVIEW_NOTE,
        },
      });
      auditedCount += 1;
    } catch (error) {
      console.error("Parle AI draft was saved but its audit entry could not be confirmed", {
        itemId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return partialResult(request, savedCount, auditedCount, itemIds, "audit_write_failed");
    }
  }

  return {
    status: "complete",
    category: request.category,
    level: request.level,
    requested_count: request.count,
    saved_count: savedCount,
    audited_count: auditedCount,
    item_ids: itemIds,
  };
}
