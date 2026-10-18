import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPublicLevelCheckRunId,
  parsePublicLevelCheckRunId,
  parsePublicLevelCheckSubmissions,
  scorePublicLevelCheck,
  scorePublicLevelCheckRun,
  selectPublicLevelCheckQuestions,
  type PublicLevelCheckRunStore,
  type PublicQuestionSet,
} from "../../functions/parle-public-level-check.helper.ts";
import {
  checkLevelCheckBrowserLimit,
  LEVEL_CHECK_BROWSER_LIMIT,
  LEVEL_CHECK_START_TIMESTAMPS_KEY,
  LEVEL_CHECK_WINDOW_MS,
  recordLevelCheckBrowserStart,
  type TimestampStorage,
} from "./level-check-browser-limit";

/** Plan 13: prepared audio for every listening row (the public check serves only listening items with audio). */
const allAudio = (rows: unknown[]) => new Map(rows.filter((r) => r.skill === "listening").map((r) => [r.id, `https://audio.test/${r.id}.mp3`]));

type Skill = "reading" | "listening";
type Level = "A1" | "A2" | "B1" | "B2";

const levels: Level[] = ["A1", "A1", "A2", "B1", "B2"];

function bankQuestion(
  id: string,
  skill: Skill | "grammar_vocabulary" = "reading",
  level: Level = "A1",
  isTestData = true,
  status = "approved",
  audioUrl = "",
) {
  return {
    id,
    demo_code: id,
    skill,
    cefr_level: level,
    format: "multiple_choice",
    prompt: `Question ${id}`,
    passage: skill === "reading" ? `Reading passage ${id}` : "",
    transcript: skill === "listening" ? `Écoutez le message ${id}` : "",
    audio_url: audioUrl,
    options: [
      { id: "correct", text: `Choice one for ${id}`, is_correct: true },
      { id: "other", text: `Choice two for ${id}`, is_correct: false },
    ],
    answer_option_id: "correct",
    answer: `Choice one for ${id}`,
    explanation: `Private explanation for ${id}`,
    status,
    is_test_data: isTestData,
  };
}

function bankFor(isTestData = true, countPerSkill = 5) {
  const rows: ReturnType<typeof bankQuestion>[] = [];
  for (const skill of ["reading", "listening"] as const) {
    for (let index = 0; index < countPerSkill; index += 1) {
      rows.push(bankQuestion(`${isTestData ? "demo" : "prod"}-${skill}-${index}`, skill, levels[index % levels.length], isTestData));
    }
  }
  return rows;
}

function correctSubmissions(set: PublicQuestionSet) {
  return set.privateMapping.questions.map((question) => ({
    questionId: question.questionId,
    choiceId: question.options.find((option) => option.isCorrect)!.choiceId,
  }));
}

function submissionsFor(set: PublicQuestionSet, chooseCorrect: (questionId: string, level: Level, skill: Skill) => boolean) {
  return set.privateMapping.questions.map((question) => {
    const option = question.options.find((candidate) => candidate.isCorrect === chooseCorrect(question.questionId, question.level, question.skill));
    assert.ok(option);
    return { questionId: question.questionId, choiceId: option.choiceId };
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

class MemoryStorage implements TimestampStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface TestRunRow {
  id: string;
  run_id: string;
  question_mapping_json: string;
  expires_at: string;
}

class MemoryRunStore implements PublicLevelCheckRunStore {
  private rows = new Map<string, TestRunRow>();

  constructor(row?: TestRunRow) {
    if (row) this.rows.set(row.run_id, row);
  }

  async findByRunId(runId: string): Promise<unknown | null> {
    return this.rows.get(runId) ?? null;
  }

  async deleteById(recordId: string): Promise<void> {
    const match = [...this.rows.entries()].find(([, row]) => row.id === recordId);
    if (!match) throw new Error("Record is already absent.");
    this.rows.delete(match[0]);
  }

  has(runId: string): boolean {
    return this.rows.has(runId);
  }
}

function runRow(set: PublicQuestionSet, runId: string, expiresAt: number): TestRunRow {
  return {
    id: `stored-${runId}`,
    run_id: runId,
    question_mapping_json: JSON.stringify(set.privateMapping),
    expires_at: new Date(expiresAt).toISOString(),
  };
}

describe("public French level check question selection", () => {
  it("prefers an approved non-demo pool with five questions for each skill", () => {
    const rows = [...bankFor(false), ...bankFor(true)];
    rows.push(bankQuestion("draft-reading", "reading", "B2", false, "draft"));
    rows.push(bankQuestion("grammar-extra", "grammar_vocabulary", "B2", false));

    const set = selectPublicLevelCheckQuestions(rows, seededRandom(11), undefined, allAudio(rows));
    assert.ok(set);
    assert.equal(set.publicProjection.isDemo, false);
    assert.equal(set.publicProjection.questions.length, 10);
    assert.equal(set.publicProjection.questions.filter((question) => question.skill === "reading").length, 5);
    assert.equal(set.publicProjection.questions.filter((question) => question.skill === "listening").length, 5);
    assert.equal(new Set(set.publicProjection.questions.map((question) => question.id)).size, 10);
    assert.ok(set.publicProjection.questions.every((question) => question.id.startsWith("prod-")));
  });

  it("falls back to approved demo questions when the non-demo pool is unbalanced", () => {
    const rows = [
      ...bankFor(true),
      ...bankFor(false).filter((row) => row.skill !== "reading" || row.id.endsWith("-0") || row.id.endsWith("-1") || row.id.endsWith("-2") || row.id.endsWith("-3")),
    ];
    const set = selectPublicLevelCheckQuestions(rows, seededRandom(23), undefined, allAudio(rows));
    assert.ok(set);
    assert.equal(set.publicProjection.isDemo, true);
    assert.ok(set.publicProjection.questions.every((question) => question.id.startsWith("demo-")));
    assert.equal(set.publicProjection.questions.filter((question) => question.skill === "reading").length, 5);
    assert.equal(set.publicProjection.questions.filter((question) => question.skill === "listening").length, 5);
  });

  it("returns no set when there is no approved balanced reading/listening pool", () => {
    assert.equal(selectPublicLevelCheckQuestions(bankFor(true).slice(0, 9), seededRandom(1), undefined, allAudio(bankFor(true).slice(0, 9))), null);
  });

  it("returns only allowlisted public questions and a text-free private score mapping", () => {
    const rows = bankFor(true).map((row) => row.skill === "listening"
      ? { ...row, audio_url: "https://private.example/listening.mp3" }
      : row);
    const set = selectPublicLevelCheckQuestions(rows, seededRandom(8), undefined, allAudio(rows));
    assert.ok(set);
    const serializedPublic = JSON.stringify(set.publicProjection);
    assert.doesNotMatch(serializedPublic, /answer_option_id|explanation|audio_url|private\.example|is_test_data|is_correct|cefr_level|Private explanation|correct/);
    for (const question of set.publicProjection.questions) {
      const allowedQuestionKeys = question.skill === "reading"
        ? ["id", "skill", "prompt", "options", ...(question.passage ? ["passage"] : [])].sort()
        : ["id", "skill", "prompt", "options", "audioUrl"].sort();
      assert.deepEqual(Object.keys(question).sort(), allowedQuestionKeys);
      assert.ok(question.options.every((option) => Object.keys(option).sort().join(",") === "id,text"));
      assert.ok(question.options.every((option) => /^opt_[0-9a-f]{32}$/.test(option.id)));
      assert.ok(question.options.every((option) => option.id !== "correct" && option.id !== "other"));
    }

    assert.deepEqual(Object.keys(set.privateMapping).sort(), ["isDemo", "questions"]);
    for (const question of set.privateMapping.questions) {
      assert.deepEqual(Object.keys(question).sort(), ["level", "options", "questionId", "skill"]);
      for (const option of question.options) {
        assert.deepEqual(Object.keys(option).sort(), ["choiceId", "isCorrect"]);
      }
    }
  });

  it("draws fresh randomized question sets from a larger approved pool", () => {
    const rows = bankFor(false, 12);
    const first = selectPublicLevelCheckQuestions(rows, seededRandom(101), undefined, allAudio(rows));
    const second = selectPublicLevelCheckQuestions(rows, seededRandom(202), undefined, allAudio(rows));
    assert.ok(first && second);
    assert.notDeepEqual(
      first.publicProjection.questions.map((question) => question.id).sort(),
      second.publicProjection.questions.map((question) => question.id).sort(),
    );
  });

  it("assigns new cryptographic IDs to the same correct text at the same position across 20 runs", () => {
    const rows = bankFor(true);
    let stableDisplay: unknown = null;
    const correctChoiceIds = new Map<string, string[]>();

    for (let run = 0; run < 20; run += 1) {
      const set = selectPublicLevelCheckQuestions(rows, seededRandom(4821), undefined, allAudio(rows));
      assert.ok(set);
      const displayWithoutIds = set.publicProjection.questions.map((question) => ({
        id: question.id,
        skill: question.skill,
        prompt: question.prompt,
        passage: question.passage,
        audioUrl: question.audioUrl,
        options: question.options.map((option) => option.text),
      }));
      if (stableDisplay === null) stableDisplay = displayWithoutIds;
      else assert.deepEqual(displayWithoutIds, stableDisplay);

      const runChoiceIds = set.publicProjection.questions.flatMap((question) => question.options.map((option) => option.id));
      assert.equal(new Set(runChoiceIds).size, runChoiceIds.length);
      assert.ok(runChoiceIds.every((id) => /^opt_[0-9a-f]{32}$/.test(id) && !/^choice-\d+$/.test(id)));

      for (const question of set.publicProjection.questions) {
        const bankItem = rows.find((row) => row.id === question.id)!;
        const correctText = bankItem.answer;
        const position = question.options.findIndex((option) => option.text === correctText);
        assert.notEqual(position, -1);
        const key = `${question.id}|${correctText}|${position}`;
        const ids = correctChoiceIds.get(key) ?? [];
        ids.push(question.options[position].id);
        correctChoiceIds.set(key, ids);
      }

      assert.deepEqual(scorePublicLevelCheck(set.privateMapping, correctSubmissions(set)), {
        reading: "B2",
        listening: "B2",
        isDemo: true,
      });
    }

    assert.equal(correctChoiceIds.size, 10);
    for (const ids of correctChoiceIds.values()) {
      assert.equal(ids.length, 20);
      assert.equal(new Set(ids).size, 20);
    }
  });
});

describe("public level-check scoring and submission validation", () => {
  it("scores each skill independently and returns only two estimates plus the demo flag", () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(88), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const before = JSON.stringify(set.privateMapping);
    const score = scorePublicLevelCheck(set.privateMapping, correctSubmissions(set));
    assert.deepEqual(score, { reading: "B2", listening: "B2", isDemo: true });
    assert.deepEqual(Object.keys(score ?? {}).sort(), ["isDemo", "listening", "reading"]);
    assert.doesNotMatch(JSON.stringify(score), /answer|explanation|is_correct|choiceId|questionId|correct/);
    assert.equal(JSON.stringify(set.privateMapping), before);
  });

  it("uses the A1 floor and two A1 misses before reporting Below A1", () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(89), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const answers = submissionsFor(set, (_questionId, level, skill) => !(skill === "reading" && level === "A1"));
    const score = scorePublicLevelCheck(set.privateMapping, answers);
    assert.equal(score?.reading, "Below A1");
    assert.equal(score?.listening, "B2");
  });

  it("stops at the last supported level when a level's answers fall below the placement threshold", () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(90), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const answers = submissionsFor(set, (_questionId, level, skill) => !(skill === "reading" && level === "A2"));
    assert.equal(scorePublicLevelCheck(set.privateMapping, answers)?.reading, "A1");
  });

  it("requires exactly ten unique question IDs and opaque, distinct choice IDs", () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(91), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const valid = correctSubmissions(set);
    assert.equal(parsePublicLevelCheckSubmissions(valid)?.length, 10);
    assert.equal(parsePublicLevelCheckSubmissions(valid.slice(0, 9)), null);
    assert.equal(parsePublicLevelCheckSubmissions([...valid, valid[0]]), null);
    assert.equal(parsePublicLevelCheckSubmissions(valid.map((answer, index) => index === 9 ? valid[8] : answer)), null);
    assert.equal(parsePublicLevelCheckSubmissions(valid.map((answer, index) => index === 0 ? { ...answer, choiceId: " " } : answer)), null);
    assert.equal(parsePublicLevelCheckSubmissions(valid.map((answer, index) => index === 0 ? { ...answer, choiceId: "choice-1" } : answer)), null);
    assert.equal(parsePublicLevelCheckSubmissions("not an answer list"), null);
    assert.equal(scorePublicLevelCheck(set.privateMapping, valid.map((answer, index) => index === 0 ? { ...answer, choiceId: "choice-1" } : answer)), null);
    assert.equal(scorePublicLevelCheck(set.privateMapping, valid.map((answer, index) => index === 0 ? { ...answer, choiceId: `opt_${"0".repeat(32)}` } : answer)), null);
  });

  it("rejects malformed private mappings and question IDs that are not in the saved run", () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(92), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const valid = correctSubmissions(set);
    const duplicateQuestionMapping = {
      ...set.privateMapping,
      questions: [...set.privateMapping.questions.slice(0, 9), set.privateMapping.questions[0]],
    };
    assert.equal(scorePublicLevelCheck(duplicateQuestionMapping, valid), null);
    assert.equal(scorePublicLevelCheck(set.privateMapping, valid.map((answer, index) => index === 0 ? { ...answer, questionId: "unknown-question" } : answer)), null);
  });
});

describe("private level-check run lifecycle", () => {
  it("rejects invalid, unknown, expired, and replayed runs, then deletes a successfully scored mapping", async () => {
    const set = selectPublicLevelCheckQuestions(bankFor(true), seededRandom(501), undefined, allAudio(bankFor(true)));
    assert.ok(set);
    const now = 1_900_000_000_000;
    const runId = createPublicLevelCheckRunId();
    assert.ok(parsePublicLevelCheckRunId(runId));
    assert.match(runId, /^run_[0-9a-f]{32}$/);

    const store = new MemoryRunStore(runRow(set, runId, now + 60_000));
    const valid = correctSubmissions(set);
    const invalid = valid.map((answer, index) => index === 0 ? { ...answer, choiceId: "choice-1" } : answer);
    assert.equal(await scorePublicLevelCheckRun(runId, invalid, store, now), null);
    assert.equal(store.has(runId), true);

    const unknownRunId = createPublicLevelCheckRunId();
    assert.equal(await scorePublicLevelCheckRun(unknownRunId, valid, store, now), null);
    assert.equal(await scorePublicLevelCheckRun("unknown", valid, store, now), null);

    const expiredRunId = createPublicLevelCheckRunId();
    const expiredStore = new MemoryRunStore(runRow(set, expiredRunId, now));
    assert.equal(await scorePublicLevelCheckRun(expiredRunId, valid, expiredStore, now), null);
    assert.equal(expiredStore.has(expiredRunId), true);

    assert.deepEqual(await scorePublicLevelCheckRun(runId, valid, store, now), {
      reading: "B2",
      listening: "B2",
      isDemo: true,
    });
    assert.equal(store.has(runId), false);
    assert.equal(await scorePublicLevelCheckRun(runId, valid, store, now), null);
  });
});

describe("browser-only five-start reminder", () => {
  it("allows five successful starts, blocks the sixth, and stores only timestamps", () => {
    const storage = new MemoryStorage();
    const firstStart = 1_000_000;

    for (let index = 0; index < LEVEL_CHECK_BROWSER_LIMIT; index += 1) {
      const before = checkLevelCheckBrowserLimit(storage, firstStart + index * 1000);
      assert.equal(before.allowed, true);
      const recorded = recordLevelCheckBrowserStart(storage, firstStart + index * 1000);
      assert.equal(recorded.startsInWindow, index + 1);
    }

    const sixth = checkLevelCheckBrowserLimit(storage, firstStart + 5000);
    assert.equal(sixth.allowed, false);
    assert.equal(sixth.startsInWindow, 5);
    assert.equal(sixth.nextAllowedAt, firstStart + LEVEL_CHECK_WINDOW_MS);

    const storedValue = storage.getItem(LEVEL_CHECK_START_TIMESTAMPS_KEY);
    assert.ok(storedValue);
    const saved = JSON.parse(storedValue) as unknown;
    assert.deepEqual(saved, Array.from({ length: 5 }, (_, index) => firstStart + index * 1000));
    assert.ok(Array.isArray(saved) && saved.every((timestamp) => typeof timestamp === "number"));
    assert.doesNotMatch(storedValue, /question|answer|score|result|choice/i);
  });

  it("restores availability at the exact one-hour expiry boundary", () => {
    const storage = new MemoryStorage();
    const firstStart = 5_000_000;
    for (let index = 0; index < LEVEL_CHECK_BROWSER_LIMIT; index += 1) {
      recordLevelCheckBrowserStart(storage, firstStart + index * 1000);
    }

    const justBefore = checkLevelCheckBrowserLimit(storage, firstStart + LEVEL_CHECK_WINDOW_MS - 1);
    const atExpiry = checkLevelCheckBrowserLimit(storage, firstStart + LEVEL_CHECK_WINDOW_MS);
    assert.equal(justBefore.allowed, false);
    assert.equal(atExpiry.allowed, true);
    assert.equal(atExpiry.startsInWindow, 4);
    assert.equal(atExpiry.nextAllowedAt, null);
  });

  it("fails open when browser storage is unavailable", () => {
    const unavailable: TimestampStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    assert.deepEqual(checkLevelCheckBrowserLimit(unavailable, 100), {
      allowed: true,
      startsInWindow: 0,
      nextAllowedAt: null,
      storageAvailable: false,
    });
    assert.equal(recordLevelCheckBrowserStart(unavailable, 100).allowed, true);
  });
});

describe("listening as audio in the public level check (Plan 13)", () => {
  it("listening questions carry their prepared audio, never the transcript", () => {
    const rows = bankFor(true);
    const audio = new Map(rows.filter((r) => r.skill === "listening").map((r) => [r.id, `https://audio.test/${r.id}.mp3`]));
    const set = selectPublicLevelCheckQuestions(rows, () => 0.3, "demo", audio)!;
    const listening = set.publicProjection.questions.filter((q) => q.skill === "listening");
    assert.equal(listening.length, 5);
    for (const q of listening) {
      assert.equal("transcript" in q, false);
      assert.equal(q.audioUrl, `https://audio.test/${q.id}.mp3`);
    }
  });
  it("only items with prepared audio can be listening questions; too few and there is no set", () => {
    const rows = bankFor(true, 6);
    const ids = rows.filter((r) => r.skill === "listening").map((r) => r.id);
    const five = new Map(ids.slice(0, 5).map((id) => [id, `https://audio.test/${id}.mp3`]));
    const set = selectPublicLevelCheckQuestions(rows, () => 0.3, "demo", five)!;
    assert.deepEqual(set.publicProjection.questions.filter((q) => q.skill === "listening").map((q) => q.id).sort(), ids.slice(0, 5).sort());
    assert.equal(selectPublicLevelCheckQuestions(rows, () => 0.3, "demo", new Map(ids.slice(0, 4).map((id) => [id, "u"]))), null);
  });
});
