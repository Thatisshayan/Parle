import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_CONTENT_CATEGORIES,
  ADMIN_CONTENT_LEVELS,
  ADMIN_CONTENT_PAGE_SIZE,
  ADMIN_CONTENT_STATUSES,
  adminContentCoverageAction,
  adminGetContentItemAction,
  adminSaveContentItemAction,
  AdminContentReadError,
  buildAdminContentCoverage,
  filterAdminContentItems,
  normalizeAdminContentInventory,
  readAdminContentInventory,
  readAdminContentInventoryResult,
} from "../../functions/parle-admin-content.helper.ts";
import {
  ADMIN_DRAFT_MAX_COUNT,
  ADMIN_DRAFT_REVIEW_NOTE,
  adminGenerateContentDraftsAction,
} from "../../functions/parle-admin-draft-generation.helper.ts";
import { dispatchWithAdminAccess } from "../../functions/parle-admin-access.helper.ts";
import { AdminActionError, type AdminActor } from "../../functions/parle-admin-settings.helper.ts";

type Fixture = Record<string, unknown>;

function question(id: string, overrides: Fixture = {}): Fixture {
  return {
    id,
    demo_code: id.toUpperCase(),
    skill: "listening",
    cefr_level: "A1",
    status: "approved",
    is_test_data: false,
    format: "multiple_choice",
    prompt: `Question text for ${id}`,
    passage: "",
    transcript: "",
    options: [
      { id: "choice_a", text: "Option A" },
      { id: "choice_b", text: "Option B" },
    ],
    answer_option_id: "choice_a",
    answer: "Option A",
    explanation: "Option A matches the question.",
    ...overrides,
  };
}

function prompt(id: string, overrides: Fixture = {}): Fixture {
  return {
    id,
    demo_code: id.toUpperCase(),
    kind: "writing",
    cefr_level: "A1",
    status: "approved",
    is_test_data: false,
    text: `Prompt text for ${id}`,
    ...overrides,
  };
}

function modelQuestion(overrides: Fixture = {}): Fixture {
  return {
    prompt: "Quelle information la personne donne-t-elle ?",
    passage: "",
    transcript: "",
    options: [
      { id: "choice_a", text: "Elle arrive demain." },
      { id: "choice_b", text: "Elle arrive ce soir." },
    ],
    answer_option_id: "choice_b",
    explanation: "Le texte indique clairement une arrivée ce soir.",
    ...overrides,
  };
}

function modelPrompt(overrides: Fixture = {}): Fixture {
  return {
    text: "Rédigez un message à une amie pour décrire un lieu que vous aimez visiter, puis expliquez pourquoi vous y retournez.",
    ...overrides,
  };
}

function modelContent(category: string, overrides: Fixture = {}): Fixture {
  if (category === "writing_prompts" || category === "speaking_prompts") return modelPrompt(overrides);
  const categoryContent: Fixture = category === "listening"
    ? { transcript: "Bonjour, le cours commence à dix heures dans la salle du premier étage." }
    : category === "reading"
      ? { passage: "À la bibliothèque du quartier, Léa emprunte un roman après son travail." }
      : {};
  return modelQuestion({ ...categoryContent, ...overrides });
}

function coverageFor(questions: Fixture[] = [], prompts: Fixture[] = []) {
  return buildAdminContentCoverage(normalizeAdminContentInventory(questions, prompts));
}

const ADMIN: AdminActor = {
  id: "admin-content-test",
  email: "admin@parle.test",
  role: "administrator",
};

async function callProtectedCoverage(client: unknown, view: "coverage" | "items" = "coverage") {
  return await dispatchWithAdminAccess("admin_content_coverage", ADMIN, () =>
    adminContentCoverageAction(client, ADMIN, { view }),
  );
}

function rawArrayEntity(rows: Fixture[], onRead?: (skip: number, fields: string[]) => void) {
  return {
    filter: async (_filters: Record<string, unknown>, _sort: string, requestedLimit: number, skip = 0, fields: string[] = []) => {
      onRead?.(skip, fields);
      return structuredClone(rows.slice(skip, skip + requestedLimit));
    },
  };
}

type MutableContentOperations = {
  reads: number;
  updates: Array<{ entity: string; id: string; data: Fixture }>;
  contentCreates: Array<{ entity: string; data: Fixture }>;
  contentCreateAttempts: number;
  audits: Fixture[];
  auditAttempts: number;
};

function mutableContentClient(
  questions: Fixture[] = [],
  prompts: Fixture[] = [],
  options: { failAudit?: boolean; failContentCreateAt?: number } = {},
) {
  const questionRows = structuredClone(questions);
  const promptRows = structuredClone(prompts);
  const operations: MutableContentOperations = { reads: 0, updates: [], contentCreates: [], contentCreateAttempts: 0, audits: [], auditAttempts: 0 };
  const createEntity = (name: string, sourceRows: Fixture[]) => ({
    filter: async (filters: Record<string, unknown> = {}, _sort = "id", limit = 200, skip = 0) => {
      operations.reads += 1;
      const matching = sourceRows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
      return structuredClone(matching.slice(skip, skip + limit));
    },
    create: async (data: Fixture) => {
      operations.contentCreateAttempts += 1;
      const attempt = operations.contentCreateAttempts;
      operations.contentCreates.push({ entity: name, data: structuredClone(data) });
      if (options.failContentCreateAt === attempt) throw new Error("content write unavailable");
      const created = { ...structuredClone(data), id: `${name}-created-${attempt}` };
      sourceRows.push(created);
      return structuredClone(created);
    },
    update: async (id: string, data: Fixture) => {
      operations.updates.push({ entity: name, id, data: structuredClone(data) });
      const row = sourceRows.find((item) => item.id === id);
      if (!row) throw new Error("record missing");
      Object.assign(row, structuredClone(data));
    },
  });
  const client = {
    entities: {
      question_item: createEntity("question_item", questionRows),
      prompt_item: createEntity("prompt_item", promptRows),
      admin_audit_log: {
        create: async (entry: Fixture) => {
          operations.auditAttempts += 1;
          if (options.failAudit) throw new Error("audit write unavailable");
          operations.audits.push(structuredClone(entry));
          return { id: `audit-${operations.auditAttempts}` };
        },
      },
    },
  };
  return { client, operations, questionRows, promptRows };
}

function pagedEntity(rows: Fixture[], onRead?: (skip: number, fields: string[]) => void) {
  return {
    filter: async (_filters: Record<string, unknown>, _sort: string, requestedLimit: number, skip: number, fields: string[]) => {
      onRead?.(skip, fields);
      const limit = Math.min(requestedLimit, ADMIN_CONTENT_PAGE_SIZE);
      return {
        data: structuredClone(rows.slice(skip, skip + limit)),
        total: rows.length,
        limit,
        skip,
      };
    },
  };
}

describe("Parle administrator content coverage", () => {
  it("creates every category, CEFR level, and review-status cell", () => {
    const coverage = coverageFor();
    assert.deepEqual(ADMIN_CONTENT_CATEGORIES, ["listening", "reading", "writing_prompts", "speaking_prompts", "grammar_vocabulary"]);
    assert.deepEqual(ADMIN_CONTENT_LEVELS, ["A1", "A2", "B1", "B2"]);
    assert.deepEqual(ADMIN_CONTENT_STATUSES, ["approved", "draft", "retired"]);
    assert.equal(coverage.cell_count, 20);
    assert.equal(coverage.matrix.listening.A1.approved.total_count, 0);
    assert.equal(coverage.matrix.grammar_vocabulary.B2.retired.total_count, 0);
  });

  it("maps both bank shapes and groups all three statuses by level", () => {
    const coverage = coverageFor([
      question("listen-a1", { skill: "listening", cefr_level: "A1" }),
      question("read-b1-draft", { skill: "reading", cefr_level: "B1", status: "draft", is_test_data: true }),
      question("grammar-b2-retired", { skill: "grammar_vocabulary", cefr_level: "B2", status: "retired" }),
    ], [
      prompt("writing-a2", { kind: "writing", cefr_level: "A2" }),
      prompt("speaking-b1-retired", { kind: "speaking", cefr_level: "B1", status: "retired" }),
    ]);

    assert.equal(coverage.launch_ready_count, 2);
    assert.equal(coverage.matrix.listening.A1.approved.launch_ready_count, 1);
    assert.equal(coverage.matrix.reading.B1.draft.demo_count, 1);
    assert.equal(coverage.matrix.reading.B1.approved.total_count, 0);
    assert.equal(coverage.matrix.writing_prompts.A2.approved.launch_ready_count, 1);
    assert.equal(coverage.matrix.speaking_prompts.B1.retired.non_demo_count, 1);
    assert.equal(coverage.matrix.grammar_vocabulary.B2.retired.non_demo_count, 1);
  });

  it("keeps demo items and missing test-data flags separate from launch-ready inventory", () => {
    const questions = [
      question("launch", { is_test_data: false }),
      question("demo", { is_test_data: true }),
      question("unverified", { is_test_data: undefined }),
    ];
    const coverage = coverageFor(questions);
    const cell = coverage.matrix.listening.A1.approved;

    assert.equal(coverage.launch_target, 360);
    assert.equal(coverage.launch_ready_count, 1);
    assert.equal(coverage.demo_test_count, 1);
    assert.equal(cell.total_count, 3);
    assert.equal(cell.non_demo_count, 1);
    assert.equal(cell.demo_count, 1);
    assert.equal(cell.unverified_count, 1);
    assert.equal(cell.launch_ready_count, 1);
  });

  it("flags approved cells below ten launch-ready items and clears the flag at ten", () => {
    const listening = Array.from({ length: 9 }, (_, index) => question(`listen-${index + 1}`, { demo_code: `L-${index + 1}` }));
    const reading = Array.from({ length: 10 }, (_, index) => question(`read-${index + 1}`, {
      demo_code: `R-${index + 1}`,
      skill: "reading",
    }));
    const coverage = coverageFor([...listening, ...reading]);

    assert.equal(coverage.matrix.listening.A1.approved.launch_ready_count, 9);
    assert.equal(coverage.matrix.listening.A1.approved.under_minimum, true);
    assert.equal(coverage.matrix.reading.A1.approved.launch_ready_count, 10);
    assert.equal(coverage.matrix.reading.A1.approved.under_minimum, false);
    assert.equal(coverage.matrix.reading.A2.approved.under_minimum, true);
    assert.equal(coverage.low_coverage_cell_count, 19);
  });

  it("surfaces unmapped and unverified records without counting them toward launch", () => {
    const coverage = coverageFor([
      question("bad-category", { skill: "unknown", is_test_data: undefined }),
      question("bad-level", { cefr_level: "C1" }),
      question("bad-status", { status: "pending", is_test_data: true }),
      question("missing-flag", { is_test_data: undefined }),
    ]);

    assert.equal(coverage.launch_ready_count, 0);
    assert.equal(coverage.demo_test_count, 1);
    assert.equal(coverage.unmapped_count, 3);
    assert.equal(coverage.unverified_count, 2);
    assert.equal(coverage.unmapped_or_unverified_count, 4);
    assert.equal(coverage.matrix.listening.A1.approved.total_count, 1);
    assert.equal(coverage.matrix.listening.A1.approved.unverified_count, 1);
  });

  it("filters a clicked cell precisely and returns no answer-key fields", () => {
    const inventory = normalizeAdminContentInventory([
      question("a-launch", { skill: "listening", cefr_level: "A1", status: "approved", is_test_data: false }),
      question("b-demo", { skill: "listening", cefr_level: "A1", status: "approved", is_test_data: true }),
      question("c-draft", { skill: "listening", cefr_level: "A1", status: "draft", is_test_data: false }),
      question("d-reading", { skill: "reading", cefr_level: "A1", status: "approved", is_test_data: false }),
      question("e-b2", { skill: "listening", cefr_level: "B2", status: "approved", is_test_data: false }),
      question("f-unmapped", { skill: "other", is_test_data: true }),
    ], [prompt("g-writing", { kind: "writing", cefr_level: "A1", status: "approved" })]);

    const selected = filterAdminContentItems(inventory, {
      type: "cell",
      category: "listening",
      level: "A1",
      status: "approved",
    });
    assert.deepEqual(selected.map((item) => item.code), ["A-LAUNCH", "B-DEMO"]);
    assert.equal(selected.some((item) => item.is_test_data === true), true);
    assert.equal(selected.some((item) => item.is_test_data === false), true);
    assert.equal(JSON.stringify(selected).includes("answer_option_id"), false);
    assert.equal(JSON.stringify(selected).includes("explanation"), false);
    assert.equal(JSON.stringify(selected).includes("options"), false);

    const flagged = filterAdminContentItems(inventory, { type: "unmapped" });
    assert.deepEqual(flagged.map((item) => item.code), ["F-UNMAPPED"]);
  });

  it("reads every page using the caller entity client and requests only safe display fields", async () => {
    const questions = Array.from({ length: ADMIN_CONTENT_PAGE_SIZE + 2 }, (_, index) => question(`question-${index + 1}`, {
      demo_code: `Q-${String(index + 1).padStart(3, "0")}`,
    }));
    const prompts = [prompt("prompt-1", { demo_code: "P-001" })];
    const questionCalls: number[] = [];
    const requestedFields: string[][] = [];
    const client = {
      entities: {
        question_item: pagedEntity(questions, (skip, fields) => { questionCalls.push(skip); requestedFields.push(fields); }),
        prompt_item: pagedEntity(prompts, (_skip, fields) => { requestedFields.push(fields); }),
      },
    };

    const inventory = await readAdminContentInventory(client);
    assert.equal(inventory.length, questions.length + prompts.length);
    assert.deepEqual(questionCalls, [0, ADMIN_CONTENT_PAGE_SIZE]);
    assert.equal(requestedFields.every((fields) => fields.includes("is_test_data") && fields.includes("status")), true);
    assert.equal(requestedFields.flat().some((field) => ["answer", "answer_option_id", "options", "explanation"].includes(field)), false);
  });

  it("accepts a data-list response without pagination metadata", async () => {
    const client = {
      entities: {
        question_item: { filter: async () => ({ data: [question("question-envelope")] }) },
        prompt_item: rawArrayEntity([]),
      },
    };

    const inventory = await readAdminContentInventory(client);
    assert.deepEqual(inventory.map((item) => item.id), ["question-envelope"]);
  });

  it("serves the protected coverage action for 120 demo questions and 16 demo prompts", async () => {
    const skills = ["listening", "reading", "grammar_vocabulary"] as const;
    const questions = Array.from({ length: 120 }, (_, index) => question(`demo-question-${index + 1}`, {
      skill: skills[Math.floor(index / 40)],
      cefr_level: ADMIN_CONTENT_LEVELS[Math.floor((index % 40) / 10)],
      is_test_data: true,
    }));
    const prompts = Array.from({ length: 16 }, (_, index) => prompt(`demo-prompt-${index + 1}`, {
      kind: index < 8 ? "writing" : "speaking",
      cefr_level: ADMIN_CONTENT_LEVELS[Math.floor((index % 8) / 2)],
      is_test_data: true,
    }));
    const client = { entities: {
      question_item: rawArrayEntity(questions),
      prompt_item: rawArrayEntity(prompts),
    } };

    const response = await callProtectedCoverage(client);
    assert.equal(response.status, "complete");
    assert.equal(response.view, "coverage");
    assert.equal(response.inventory_complete, true);
    assert.deepEqual(response.read_details, []);

    const coverage = response.coverage as ReturnType<typeof buildAdminContentCoverage>;
    assert.equal(coverage.total_record_count, 136);
    assert.equal(coverage.demo_test_count, 136);
    assert.equal(coverage.launch_ready_count, 0);
    assert.equal(coverage.launch_target, 360);
    assert.equal(coverage.matrix.listening.A1.approved.demo_count, 10);
    assert.equal(coverage.matrix.reading.B2.approved.total_count, 10);
    assert.equal(coverage.matrix.writing_prompts.A1.approved.demo_count, 2);
    assert.equal(coverage.matrix.speaking_prompts.B2.approved.demo_count, 2);
    assert.equal(JSON.stringify(response).includes("answer_option_id"), false);
    assert.equal(JSON.stringify(response).includes("explanation"), false);
  });

  it("recovers when one bank page request fails transiently", async () => {
    let questionReads = 0;
    const client = { entities: {
      question_item: {
        filter: async (_filters: Record<string, unknown>, _sort: string, limit: number, skip = 0) => {
          questionReads += 1;
          if (questionReads === 1) throw new Error("private request token must not be exposed");
          return [question("recovered-question", { is_test_data: true })].slice(skip, skip + limit);
        },
      },
      prompt_item: rawArrayEntity([]),
    } };

    const response = await callProtectedCoverage(client);
    assert.equal(questionReads, 2);
    assert.equal(response.status, "complete");
    assert.equal(response.inventory_complete, true);
    assert.deepEqual(response.read_details, []);
    const coverage = response.coverage as ReturnType<typeof buildAdminContentCoverage>;
    assert.equal(coverage.total_record_count, 1);
    assert.equal(coverage.matrix.listening.A1.approved.demo_count, 1);
  });

  it("keeps available coverage visible with a precise safe detail after a persistent read failure", async () => {
    let questionReads = 0;
    const client = { entities: {
      question_item: {
        filter: async () => {
          questionReads += 1;
          throw new Error("Bearer secret-test-token");
        },
      },
      prompt_item: rawArrayEntity([
        prompt("available-prompt", { kind: "writing", cefr_level: "A1", is_test_data: true }),
      ]),
    } };

    const response = await callProtectedCoverage(client);
    assert.equal(questionReads, 2);
    assert.equal(response.status, "complete");
    assert.equal(response.inventory_complete, false);
    const details = response.read_details as Array<Record<string, unknown>>;
    assert.equal(details.length, 1);
    assert.deepEqual(details[0], {
      entity: "question_item",
      page: 1,
      offset: 0,
      reason_code: "CONTENT_PAGE_REQUEST_FAILED",
      message: "The bank page request failed after one retry.",
    });
    assert.equal(JSON.stringify(response).includes("secret-test-token"), false);

    const coverage = response.coverage as ReturnType<typeof buildAdminContentCoverage>;
    assert.equal(coverage.total_record_count, 1);
    assert.equal(coverage.demo_test_count, 1);
    assert.equal(coverage.launch_ready_count, 0);
    assert.equal(coverage.matrix.writing_prompts.A1.approved.demo_count, 1);
  });

  it("returns structured detail when an item-list read remains unavailable", async () => {
    const client = { entities: {
      question_item: { filter: async () => { throw new Error("private details"); } },
      prompt_item: rawArrayEntity([]),
    } };

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_content_coverage", ADMIN, () => adminContentCoverageAction(client, ADMIN, {
        view: "items",
        filter: { type: "cell", category: "listening", level: "A1", status: "approved" },
      })),
      (error: unknown) => error instanceof AdminContentReadError
        && error.code === "CONTENT_READ_FAILED"
        && error.detail.entity === "question_item"
        && error.detail.page === 1
        && error.detail.offset === 0
        && error.detail.reason_code === "CONTENT_PAGE_REQUEST_FAILED",
    );
  });

  it("reads canonical question fields by record ID for the editor", async () => {
    const fixture = mutableContentClient([question("canonical-question")]);
    const response = await dispatchWithAdminAccess("admin_get_content_item", ADMIN, () =>
      adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "canonical-question" }));
    const item = response.item as Fixture;

    assert.equal(response.status, "complete");
    assert.equal(item.id, "canonical-question");
    assert.equal(item.category, "listening");
    assert.equal(item.level, "A1");
    assert.equal(item.text, "Question text for canonical-question");
    assert.equal(item.status, "approved");
    assert.equal(item.is_test_data, false);
    assert.deepEqual(item.options, [
      { id: "choice_a", text: "Option A" },
      { id: "choice_b", text: "Option B" },
    ]);
    assert.equal(item.answer_option_id, "choice_a");
    assert.equal(item.correct_answer_text, "Option A");
    assert.equal(typeof item.revision, "string");
    assert.equal(fixture.operations.reads, 1);
  });

  it("saves a question and audits changed content, status, and test-data state", async () => {
    const fixture = mutableContentClient([question("question-edit")]);
    const opened = await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "question-edit" });
    const item = opened.item as Fixture;
    const response = await dispatchWithAdminAccess("admin_save_content_item", ADMIN, () =>
      adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "question",
        item_id: "question-edit",
        expected_revision: item.revision,
        content: {
          prompt: "Which reply completes this conversation?",
          options: [
            { id: "choice_a", text: "Je viens demain." },
            { id: "choice_b", text: "Je viens ce soir." },
          ],
          answer_option_id: "choice_b",
          status: "draft",
          is_test_data: true,
        },
      }));

    assert.deepEqual(response, {
      status: "complete",
      changed: true,
      audit_status: "written",
      changed_fields: ["prompt", "status", "is_test_data", "options", "answer_option_id", "answer"],
    });
    assert.equal(fixture.questionRows[0].prompt, "Which reply completes this conversation?");
    assert.equal(fixture.questionRows[0].answer_option_id, "choice_b");
    assert.equal(fixture.questionRows[0].answer, "Je viens ce soir.");
    assert.deepEqual(fixture.questionRows[0].options, [
      { id: "choice_a", text: "Je viens demain." },
      { id: "choice_b", text: "Je viens ce soir." },
    ]);
    assert.equal(fixture.questionRows[0].status, "draft");
    assert.equal(fixture.questionRows[0].is_test_data, true);
    assert.equal(fixture.operations.updates.length, 1);
    assert.equal(fixture.operations.audits.length, 1);

    const audit = fixture.operations.audits[0];
    assert.equal(audit.action, "question_bank.content_updated");
    assert.equal(audit.target_type, "question_item");
    assert.equal(audit.target_id, "question-edit");
    assert.deepEqual(JSON.parse(String(audit.old_value)), {
      prompt: "Question text for question-edit",
      status: "approved",
      is_test_data: false,
      options: [
        { id: "choice_a", text: "Option A" },
        { id: "choice_b", text: "Option B" },
      ],
      answer_option_id: "choice_a",
      answer: "Option A",
    });
    assert.deepEqual(JSON.parse(String(audit.new_value)), {
      prompt: "Which reply completes this conversation?",
      status: "draft",
      is_test_data: true,
      options: [
        { id: "choice_a", text: "Je viens demain." },
        { id: "choice_b", text: "Je viens ce soir." },
      ],
      answer_option_id: "choice_b",
      answer: "Je viens ce soir.",
    });
  });

  it("saves a prompt and records its old and new values in the administrator audit", async () => {
    const fixture = mutableContentClient([], [prompt("prompt-edit")]);
    const opened = await adminGetContentItemAction(fixture.client, ADMIN, { source: "prompt", item_id: "prompt-edit" });
    const item = opened.item as Fixture;
    const response = await dispatchWithAdminAccess("admin_save_content_item", ADMIN, () =>
      adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "prompt",
        item_id: "prompt-edit",
        expected_revision: item.revision,
        content: { text: "Describe a place you enjoy visiting.", status: "draft", is_test_data: true },
      }));

    assert.equal(response.status, "complete");
    assert.equal(fixture.promptRows[0].text, "Describe a place you enjoy visiting.");
    assert.equal(fixture.promptRows[0].status, "draft");
    assert.equal(fixture.promptRows[0].is_test_data, true);
    assert.equal(fixture.operations.updates.length, 1);
    assert.equal(fixture.operations.audits.length, 1);
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].old_value)), {
      text: "Prompt text for prompt-edit",
      status: "approved",
      is_test_data: false,
    });
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), {
      text: "Describe a place you enjoy visiting.",
      status: "draft",
      is_test_data: true,
    });
  });

  it("rejects an invalid multiple-choice question before writing content or audit", async () => {
    const fixture = mutableContentClient([question("question-invalid")]);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "question-invalid" })).item as Fixture;

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "question",
        item_id: "question-invalid",
        expected_revision: item.revision,
        content: { options: [{ id: "choice_a", text: "Only one choice" }], answer_option_id: "choice_a" },
      })),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_OPTIONS_INVALID",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("preserves legacy text-only choices during an unrelated edit", async () => {
    const legacyOptions = ["Legacy answer A", "Legacy answer B"];
    const fixture = mutableContentClient([question("question-legacy", {
      options: legacyOptions,
      answer_option_id: undefined,
      answer: "Legacy answer B",
    })]);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "question-legacy" })).item as Fixture;

    assert.deepEqual(item.options, [
      { id: "legacy-option-1", text: "Legacy answer A" },
      { id: "legacy-option-2", text: "Legacy answer B" },
    ]);
    assert.equal(item.answer_option_id, "legacy-option-2");

    const response = await dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
      source: "question",
      item_id: "question-legacy",
      expected_revision: item.revision,
      content: { status: "draft" },
    }));

    assert.equal(response.status, "complete");
    assert.deepEqual(fixture.questionRows[0].options, legacyOptions);
    assert.equal(fixture.questionRows[0].answer_option_id, undefined);
    assert.equal(fixture.questionRows[0].answer, "Legacy answer B");
    assert.deepEqual(fixture.operations.updates[0].data, { status: "draft" });
  });

  it("rejects malformed stored choice identifiers before any write", async () => {
    const fixture = mutableContentClient([question("question-malformed-id", {
      options: [
        { id: " choice_a", text: "Option A" },
        { id: "choice_b", text: "Option B" },
      ],
      answer_option_id: " choice_a",
    })]);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "question-malformed-id" })).item as Fixture;

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "question",
        item_id: "question-malformed-id",
        expected_revision: item.revision,
        content: { status: "draft" },
      })),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_OPTIONS_INVALID",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("rejects a stale content revision before any item or audit write", async () => {
    const fixture = mutableContentClient([question("question-stale")]);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "question-stale" })).item as Fixture;
    fixture.questionRows[0].prompt = "A different editor saved this version.";

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "question",
        item_id: "question-stale",
        expected_revision: item.revision,
        content: { status: "draft" },
      })),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_STALE",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("denies learner item reads and saves before the protected handler reaches bank data", async () => {
    const fixture = mutableContentClient([question("protected-question")]);
    const learner: AdminActor = { id: "learner-content-test", email: "learner@parle.test", role: "user" };

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_get_content_item", learner, () =>
        adminGetContentItemAction(fixture.client, learner, { source: "question", item_id: "protected-question" })),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );
    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", learner, () =>
        adminSaveContentItemAction(fixture.client, learner, { source: "question", item_id: "protected-question", content: { status: "draft" } })),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );

    assert.equal(fixture.operations.reads, 0);
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("preserves the ten-item approved test-question minimum for each bucket", async () => {
    const testQuestions = Array.from({ length: 10 }, (_, index) => question(`floor-question-${index + 1}`, { is_test_data: true }));
    const fixture = mutableContentClient(testQuestions);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "floor-question-1" })).item as Fixture;

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "question",
        item_id: "floor-question-1",
        expected_revision: item.revision,
        content: { is_test_data: false },
      })),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_MINIMUM_QUESTION_FLOOR",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("preserves the two-item approved test-prompt minimum for each bucket", async () => {
    const testPrompts = Array.from({ length: 2 }, (_, index) => prompt(`floor-prompt-${index + 1}`, { is_test_data: true }));
    const fixture = mutableContentClient([], testPrompts);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "prompt", item_id: "floor-prompt-1" })).item as Fixture;

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
        source: "prompt",
        item_id: "floor-prompt-1",
        expected_revision: item.revision,
        content: { status: "retired" },
      })),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_MINIMUM_PROMPT_FLOOR",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("reflects a saved recognized approved non-demo item in refreshed coverage", async () => {
    const fixture = mutableContentClient([question("new-launch-item", { status: "draft", is_test_data: true })]);
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "new-launch-item" })).item as Fixture;
    const saved = await dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
      source: "question",
      item_id: "new-launch-item",
      expected_revision: item.revision,
      content: { status: "approved", is_test_data: false },
    }));
    const refreshed = await callProtectedCoverage(fixture.client);
    const coverage = refreshed.coverage as ReturnType<typeof buildAdminContentCoverage>;

    assert.equal(saved.status, "complete");
    assert.equal(coverage.launch_ready_count, 1);
    assert.equal(coverage.matrix.listening.A1.approved.launch_ready_count, 1);
    assert.equal(coverage.matrix.listening.A1.approved.under_minimum, true);
    assert.equal(coverage.demo_test_count, 0);
  });

  it("reports a saved item honestly when the separate audit write fails", async () => {
    const fixture = mutableContentClient([question("partial-audit-question")], [], { failAudit: true });
    const item = (await adminGetContentItemAction(fixture.client, ADMIN, { source: "question", item_id: "partial-audit-question" })).item as Fixture;
    const response = await dispatchWithAdminAccess("admin_save_content_item", ADMIN, () => adminSaveContentItemAction(fixture.client, ADMIN, {
      source: "question",
      item_id: "partial-audit-question",
      expected_revision: item.revision,
      content: { status: "draft" },
    }));

    assert.equal(response.status, "partial");
    assert.equal(response.audit_status, "failed");
    assert.equal(response.audit_error_code, "AUDIT_WRITE_FAILED");
    assert.equal(fixture.questionRows[0].status, "draft");
    assert.equal(fixture.operations.updates.length, 1);
    assert.equal(fixture.operations.auditAttempts, 1);
    assert.equal(fixture.operations.audits.length, 0);
  });

  it("maps all content categories and CEFR levels to the right stored draft type", async () => {
    const cases = [
      { category: "listening", level: "A1", source: "question", storageField: "skill", storageValue: "listening", guidance: "LISTENING:" },
      { category: "reading", level: "A2", source: "question", storageField: "skill", storageValue: "reading", guidance: "READING:" },
      { category: "grammar_vocabulary", level: "B1", source: "question", storageField: "skill", storageValue: "grammar_vocabulary", guidance: "GRAMMAR AND VOCABULARY:" },
      { category: "writing_prompts", level: "B2", source: "prompt", storageField: "kind", storageValue: "writing", guidance: "WRITING PROMPT:" },
      { category: "speaking_prompts", level: "A1", source: "prompt", storageField: "kind", storageValue: "speaking", guidance: "SPEAKING PROMPT:" },
    ] as const;

    for (const entry of cases) {
      const fixture = mutableContentClient();
      let capturedPrompt = "";
      const result = await dispatchWithAdminAccess("admin_generate_content_drafts", ADMIN, () =>
        adminGenerateContentDraftsAction(fixture.client, ADMIN, {
          complete: async (promptText) => {
            capturedPrompt = promptText;
            return { items: [modelContent(entry.category)] };
          },
        }, { category: entry.category, level: entry.level, count: 1 }));

      const row = entry.source === "question" ? fixture.questionRows[0] : fixture.promptRows[0];
      assert.equal(result.status, "complete");
      assert.equal(result.saved_count, 1);
      assert.deepEqual(result.item_ids, [row.id]);
      assert.equal(row[entry.storageField], entry.storageValue);
      assert.equal(row.cefr_level, entry.level);
      assert.equal(row.status, "draft");
      assert.equal(row.is_test_data, true);
      assert.equal(row.created_by_type, "ai");
      assert.equal(row.reviewed_by, ADMIN_DRAFT_REVIEW_NOTE);
      assert.ok(capturedPrompt.includes(`Category: ${entry.category}. CEFR level: ${entry.level}. Generate exactly 1 distinct items.`));
      assert.ok(capturedPrompt.includes(entry.guidance));
      assert.equal(fixture.operations.audits.length, 1);
      assert.equal(fixture.operations.audits[0].action, "question_bank.ai_draft_created");
      assert.equal(fixture.operations.audits[0].target_id, row.id);
      assert.equal(JSON.stringify(fixture.operations.audits[0]).includes("Elle arrive ce soir."), false);
      assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), {
        status: "draft",
        is_test_data: true,
        created_by_type: "ai",
        reviewed_by: ADMIN_DRAFT_REVIEW_NOTE,
      });
    }
  });

  it("accepts five drafts and rejects invalid categories, levels, and counts before provider access", async () => {
    assert.equal(ADMIN_DRAFT_MAX_COUNT, 5);
    const fiveFixture = mutableContentClient();
    const fiveItems = Array.from({ length: ADMIN_DRAFT_MAX_COUNT }, () => modelContent("grammar_vocabulary"));
    const fiveResult = await adminGenerateContentDraftsAction(fiveFixture.client, ADMIN, {
      complete: async () => ({ items: fiveItems }),
    }, { category: "grammar_vocabulary", level: "B2", count: ADMIN_DRAFT_MAX_COUNT });
    assert.equal(fiveResult.status, "complete");
    assert.equal(fiveResult.saved_count, ADMIN_DRAFT_MAX_COUNT);
    assert.equal(fiveFixture.questionRows.length, ADMIN_DRAFT_MAX_COUNT);
    assert.equal(fiveFixture.operations.audits.length, ADMIN_DRAFT_MAX_COUNT);

    const fixture = mutableContentClient();
    let providerCalls = 0;
    const provider = { complete: async () => { providerCalls += 1; return { items: [modelContent("listening")] }; } };
    const invalidRequests: Fixture[] = [
      { category: "listening", level: "A1", count: 0 },
      { category: "listening", level: "A1", count: 6 },
      { category: "listening", level: "A1", count: 1.5 },
      { category: "not-a-category", level: "A1", count: 1 },
      { category: "listening", level: "C1", count: 1 },
    ];
    for (const request of invalidRequests) {
      await assert.rejects(
        () => adminGenerateContentDraftsAction(fixture.client, ADMIN, provider, request),
        (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_DRAFT_REQUEST_INVALID" && error.status === 400,
      );
    }
    assert.equal(providerCalls, 0);
    assert.equal(fixture.operations.reads, 0);
    assert.equal(fixture.operations.contentCreateAttempts, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("validates every multiple-choice item before any generated row or audit is written", async () => {
    const fixture = mutableContentClient();
    const valid = modelContent("grammar_vocabulary");
    const invalid = modelContent("grammar_vocabulary", {
      options: [{ id: "only-choice", text: "Une seule réponse" }],
      answer_option_id: "only-choice",
    });

    await assert.rejects(
      () => adminGenerateContentDraftsAction(fixture.client, ADMIN, {
        complete: async () => ({ items: [valid, invalid] }),
      }, { category: "grammar_vocabulary", level: "A2", count: 2 }),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_DRAFT_GENERATION_FAILED" && error.status === 502,
    );
    assert.equal(fixture.questionRows.length, 0);
    assert.equal(fixture.operations.contentCreateAttempts, 0);
    assert.equal(fixture.operations.audits.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("turns a provider failure into a generation error without any content or audit writes", async () => {
    const fixture = mutableContentClient();
    await assert.rejects(
      () => adminGenerateContentDraftsAction(fixture.client, ADMIN, {
        complete: async () => { throw new Error("private provider details"); },
      }, { category: "listening", level: "A1", count: 1 }),
      (error: unknown) => error instanceof AdminActionError && error.code === "CONTENT_DRAFT_GENERATION_FAILED" && error.status === 502,
    );
    assert.equal(fixture.questionRows.length, 0);
    assert.equal(fixture.promptRows.length, 0);
    assert.equal(fixture.operations.contentCreateAttempts, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("rejects non-administrators before accessing the provider or content entities", async () => {
    let providerCalls = 0;
    let entityAccesses = 0;
    const client = Object.defineProperty({}, "entities", {
      get() {
        entityAccesses += 1;
        throw new Error("entity access should not happen");
      },
    });
    const learner: AdminActor = { id: "learner-content-test", email: "learner@parle.test", role: "user" };

    await assert.rejects(
      () => adminGenerateContentDraftsAction(client, learner, {
        complete: async () => { providerCalls += 1; return { items: [modelContent("listening")] }; },
      }, { category: "listening", level: "A1", count: 1 }),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );
    assert.equal(providerCalls, 0);
    assert.equal(entityAccesses, 0);
  });

  it("shows generated prompt drafts in Draft coverage and returns provenance to the editor", async () => {
    const fixture = mutableContentClient();
    const generated = await dispatchWithAdminAccess("admin_generate_content_drafts", ADMIN, () =>
      adminGenerateContentDraftsAction(fixture.client, ADMIN, {
        complete: async () => ({ items: [modelPrompt()] }),
      }, { category: "writing_prompts", level: "B2", count: 1 }));
    const itemId = String((generated.item_ids as string[])[0]);
    const coverageResponse = await dispatchWithAdminAccess("admin_content_coverage", ADMIN, () =>
      adminContentCoverageAction(fixture.client, ADMIN, { view: "coverage" }));
    const coverage = coverageResponse.coverage as ReturnType<typeof buildAdminContentCoverage>;
    const draftList = await dispatchWithAdminAccess("admin_content_coverage", ADMIN, () =>
      adminContentCoverageAction(fixture.client, ADMIN, {
        view: "items",
        filter: { type: "cell", category: "writing_prompts", level: "B2", status: "draft" },
      }));
    const editorResponse = await dispatchWithAdminAccess("admin_get_content_item", ADMIN, () =>
      adminGetContentItemAction(fixture.client, ADMIN, { source: "prompt", item_id: itemId }));
    const editorItem = editorResponse.item as Fixture;

    assert.equal(coverage.matrix.writing_prompts.B2.draft.total_count, 1);
    assert.equal(coverage.matrix.writing_prompts.B2.draft.demo_count, 1);
    assert.equal(draftList.count, 1);
    assert.equal((draftList.items as Fixture[])[0].id, itemId);
    assert.equal(editorItem.status, "draft");
    assert.equal(editorItem.is_test_data, true);
    assert.equal(editorItem.created_by_type, "ai");
    assert.equal(editorItem.reviewed_by, ADMIN_DRAFT_REVIEW_NOTE);
  });

  it("returns honest partial results when a content write or audit fails after saving begins", async () => {
    const failedContentFixture = mutableContentClient([], [], { failContentCreateAt: 2 });
    const contentResult = await adminGenerateContentDraftsAction(failedContentFixture.client, ADMIN, {
      complete: async () => ({ items: [modelContent("grammar_vocabulary"), modelContent("grammar_vocabulary")] }),
    }, { category: "grammar_vocabulary", level: "A1", count: 2 });
    assert.equal(contentResult.status, "partial");
    assert.equal(contentResult.partial_reason, "content_write_failed");
    assert.equal(contentResult.saved_count, 1);
    assert.equal(contentResult.audited_count, 1);
    assert.equal(failedContentFixture.questionRows.length, 1);
    assert.equal(failedContentFixture.operations.audits.length, 1);

    const failedAuditFixture = mutableContentClient([], [], { failAudit: true });
    const auditResult = await adminGenerateContentDraftsAction(failedAuditFixture.client, ADMIN, {
      complete: async () => ({ items: [modelContent("grammar_vocabulary"), modelContent("grammar_vocabulary")] }),
    }, { category: "grammar_vocabulary", level: "A1", count: 2 });
    assert.equal(auditResult.status, "partial");
    assert.equal(auditResult.partial_reason, "audit_write_failed");
    assert.equal(auditResult.saved_count, 1);
    assert.equal(auditResult.audited_count, 0);
    assert.equal(failedAuditFixture.questionRows.length, 1);
    assert.equal(failedAuditFixture.operations.auditAttempts, 1);
    assert.equal(failedAuditFixture.operations.audits.length, 0);
  });
});
