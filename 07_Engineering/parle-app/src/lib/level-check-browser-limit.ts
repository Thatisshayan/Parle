export interface TimestampStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BrowserLimitStatus {
  allowed: boolean;
  startsInWindow: number;
  nextAllowedAt: number | null;
  storageAvailable: boolean;
}

export const LEVEL_CHECK_BROWSER_LIMIT = 5;
export const LEVEL_CHECK_WINDOW_MS = 60 * 60 * 1000;
export const LEVEL_CHECK_START_TIMESTAMPS_KEY = "parle-public-level-check-starts-v1";

function statusFor(timestamps: number[], now: number, storageAvailable: boolean): BrowserLimitStatus {
  const startsInWindow = timestamps.length;
  const allowed = startsInWindow < LEVEL_CHECK_BROWSER_LIMIT;
  const nextAllowedAt = allowed || startsInWindow === 0
    ? null
    : timestamps[0] + LEVEL_CHECK_WINDOW_MS;
  return { allowed, startsInWindow, nextAllowedAt, storageAvailable };
}

function readRecentStarts(storage: TimestampStorage | null | undefined, now: number): {
  timestamps: number[];
  storageAvailable: boolean;
} {
  if (!storage) return { timestamps: [], storageAvailable: false };
  try {
    const stored = storage.getItem(LEVEL_CHECK_START_TIMESTAMPS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const timestamps = Array.isArray(parsed)
      ? parsed.filter((value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value <= now && value > now - LEVEL_CHECK_WINDOW_MS,
        ).sort((left, right) => left - right)
      : [];
    return { timestamps, storageAvailable: true };
  } catch {
    return { timestamps: [], storageAvailable: false };
  }
}

/**
 * Best-effort visitor-browser reminder only. It is bypassable by clearing browser storage,
 * using another browser, or calling the public endpoint directly. Store timestamps only.
 */
export function checkLevelCheckBrowserLimit(
  storage: TimestampStorage | null | undefined,
  now = Date.now(),
): BrowserLimitStatus {
  const current = readRecentStarts(storage, now);
  return statusFor(current.timestamps, now, current.storageAvailable);
}

/** Records one successful start. Answers, question sets, and scores never enter this storage. */
export function recordLevelCheckBrowserStart(
  storage: TimestampStorage | null | undefined,
  startedAt = Date.now(),
): BrowserLimitStatus {
  const current = readRecentStarts(storage, startedAt);
  if (!current.storageAvailable || !storage) {
    return { allowed: true, startsInWindow: current.timestamps.length, nextAllowedAt: null, storageAvailable: false };
  }

  const timestamps = [...current.timestamps, startedAt].sort((left, right) => left - right);
  try {
    storage.setItem(LEVEL_CHECK_START_TIMESTAMPS_KEY, JSON.stringify(timestamps));
    return statusFor(timestamps, startedAt, true);
  } catch {
    return { allowed: true, startsInWindow: current.timestamps.length, nextAllowedAt: null, storageAvailable: false };
  }
}
