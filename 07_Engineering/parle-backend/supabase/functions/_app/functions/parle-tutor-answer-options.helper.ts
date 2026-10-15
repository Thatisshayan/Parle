// GENERATED from parle-app/functions/parle-tutor-answer-options.helper.ts by scripts/sync-app-code.ts. Do not edit.
export interface TutorAnswerOption {
  id: string;
  text: string;
  /** Original saved choice index, present only in a legacy projection. */
  originalIndex?: number;
}

export interface TutorAnswerItem {
  id: string;
  options: readonly TutorAnswerOption[];
  answer_option_id: string;
  /** Legacy items use the first original choice as the saved answer key. */
  legacy_option_identity?: boolean;
}

export type RandomIndex = (upperBound: number) => number;

export interface AssignTutorOptionIdsOptions {
  randomIndex?: RandomIndex;
  optionId?: (itemId: string, itemIndex: number, originalOptionIndex: number) => string;
}

function checkedIndex(randomIndex: RandomIndex, upperBound: number): number {
  const index = randomIndex(upperBound);
  if (!Number.isInteger(index) || index < 0 || index >= upperBound) {
    throw new RangeError("The answer-choice shuffle returned an invalid position.");
  }
  return index;
}

function shuffled<T>(values: readonly T[], randomIndex: RandomIndex): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = checkedIndex(randomIndex, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function secureRandomIndex(upperBound: number): number {
  if (!Number.isSafeInteger(upperBound) || upperBound < 1 || upperBound > 0x1_0000_0000) {
    throw new RangeError("The answer-choice shuffle requested an unsupported range.");
  }
  if (upperBound === 1) return 0;

  const range = 0x1_0000_0000;
  const acceptedRange = range - (range % upperBound);
  const sample = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(sample);
  } while (sample[0] >= acceptedRange);
  return sample[0] % upperBound;
}

function balancedCorrectPositions(optionCounts: readonly number[], randomIndex: RandomIndex): number[] {
  const positions = Array.from({ length: optionCounts.length }, () => 0);
  const groups = new Map<number, number[]>();

  optionCounts.forEach((count, itemIndex) => {
    if (!Number.isInteger(count) || count < 2 || count > 4) {
      throw new RangeError("Tutor lesson questions need two to four answer choices.");
    }
    const group = groups.get(count) ?? [];
    group.push(itemIndex);
    groups.set(count, group);
  });

  for (const [optionCount, itemIndexes] of groups) {
    const randomizedItems = shuffled(itemIndexes, randomIndex);
    const balancedSlots = Array.from({ length: itemIndexes.length }, (_, index) => index % optionCount);
    const randomizedSlots = shuffled(balancedSlots, randomIndex);
    randomizedItems.forEach((itemIndex, assignmentIndex) => {
      positions[itemIndex] = randomizedSlots[assignmentIndex];
    });
  }

  return positions;
}

/**
 * Replaces provider-created choice IDs and shuffles a lesson's choices before the lesson is saved.
 * Items with the same number of choices receive balanced correct-answer positions across the set.
 */
export function assignTutorServerOptionIds<T extends TutorAnswerItem>(
  items: readonly T[],
  options: AssignTutorOptionIdsOptions = {},
): T[] {
  const randomIndex = options.randomIndex ?? secureRandomIndex;
  const makeOptionId = options.optionId ?? (() => globalThis.crypto.randomUUID());
  const correctPositions = balancedCorrectPositions(items.map((item) => item.options.length), randomIndex);
  const assignedIds = new Set<string>();

  return items.map((item, itemIndex) => {
    const correctSourceIndex = item.options.findIndex((option) => option.id === item.answer_option_id);
    if (correctSourceIndex < 0) {
      throw new Error("A generated lesson answer did not match one of its choices.");
    }

    const serverOptions = item.options.map((option, optionIndex) => {
      const id = makeOptionId(item.id, itemIndex, optionIndex).trim();
      if (!id || id.length > 80 || assignedIds.has(id)) {
        throw new Error("The server could not assign unique IDs to every lesson choice.");
      }
      assignedIds.add(id);
      return { id, text: option.text };
    });
    const correctOption = serverOptions[correctSourceIndex];
    if (!correctOption) throw new Error("The correct lesson choice could not be prepared.");

    const shuffledDistractors = shuffled(
      serverOptions.filter((_, optionIndex) => optionIndex !== correctSourceIndex),
      randomIndex,
    );
    const displayOptions: TutorAnswerOption[] = [];
    let distractorIndex = 0;
    for (let position = 0; position < serverOptions.length; position += 1) {
      if (position === correctPositions[itemIndex]) displayOptions.push(correctOption);
      else {
        const distractor = shuffledDistractors[distractorIndex];
        if (!distractor) throw new Error("The lesson choices could not be shuffled.");
        displayOptions.push(distractor);
        distractorIndex += 1;
      }
    }

    return {
      ...item,
      options: displayOptions,
      answer_option_id: correctOption.id,
    } as T;
  });
}

function stableHash(value: string): string {
  const mask = (1n << 64n) - 1n;
  let hash = 14_695_981_039_346_656_037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1_099_511_628_211n) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function seededIndex(seed: string): RandomIndex {
  let state = Number(BigInt(`0x${stableHash(seed)}`) & 0xffff_ffffn) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return (upperBound) => {
    if (!Number.isSafeInteger(upperBound) || upperBound < 1) {
      throw new RangeError("The legacy answer-choice shuffle requested an unsupported range.");
    }
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % upperBound;
  };
}

export interface LegacyTutorOptionProjection {
  options: Array<TutorAnswerOption & { originalIndex: number }>;
  answerOptionId: string;
}

export function legacyTutorItemId(lessonId: string, collection: string, itemIndex: number): string {
  return `legacy-item-${stableHash(JSON.stringify([lessonId, collection, itemIndex]))}`;
}

export function legacyTutorOptionId(
  lessonId: string,
  collection: string,
  itemId: string,
  itemIndex: number,
  originalOptionIndex: number,
): string {
  const itemKey = stableHash(JSON.stringify([lessonId, collection, itemId, itemIndex]));
  return `legacy-${itemKey}-${originalOptionIndex.toString(36)}`;
}

/**
 * Adds deterministic, lesson-keyed identities to an old item and shuffles only its display projection.
 * The original index is retained internally so the server can map a submitted ID back to choice one.
 */
export function projectLegacyTutorOptions(
  lessonId: string,
  collection: string,
  itemId: string,
  itemIndex: number,
  optionTexts: readonly string[],
): LegacyTutorOptionProjection {
  if (!lessonId || !collection || !itemId || !Number.isInteger(itemIndex) || itemIndex < 0) {
    throw new Error("A persistent lesson and item identity are required for legacy choices.");
  }
  if (optionTexts.length < 2 || optionTexts.length > 4 || optionTexts.some((text) => !text.trim())) {
    throw new RangeError("Legacy tutor questions need two to four readable answer choices.");
  }

  const originalOptions = optionTexts.map((text, originalIndex) => ({
    id: legacyTutorOptionId(lessonId, collection, itemId, itemIndex, originalIndex),
    text,
    originalIndex,
  }));
  const displayOptions = shuffled(
    originalOptions,
    seededIndex(JSON.stringify([lessonId, collection, itemId, itemIndex, "display-order"])),
  );

  return {
    options: displayOptions,
    answerOptionId: originalOptions[0]!.id,
  };
}

export function correctTutorOption(item: TutorAnswerItem): TutorAnswerOption | null {
  if (item.legacy_option_identity === true) {
    const firstOriginalChoice = item.options.find((option) => option.originalIndex === 0);
    return firstOriginalChoice?.id === item.answer_option_id ? firstOriginalChoice : null;
  }
  return item.options.find((option) => option.id === item.answer_option_id) ?? null;
}

/** Scores a server-validated selection by stable option ID, never by display position or text. */
export function isTutorOptionCorrect(item: TutorAnswerItem, submittedOptionId: string): boolean {
  const selected = item.options.find((option) => option.id === submittedOptionId);
  const answer = correctTutorOption(item);
  return Boolean(selected && answer && selected.id === answer.id);
}
