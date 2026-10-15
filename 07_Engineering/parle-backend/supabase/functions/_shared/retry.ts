/** A unique-key conflict from Postgres (23505), as raised through supabase-js or the compat layer. */
export function isUniqueConflict(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = "code" in e ? String((e as { code: unknown }).code) : "";
  const message = "message" in e ? String((e as { message: unknown }).message) : "";
  return code === "23505" || /duplicate key value violates unique constraint/i.test(message);
}

/** Runs fn; after a unique-key conflict (a simultaneous writer won), runs it once more and lets a second failure through. */
export async function retryOnUniqueConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isUniqueConflict(e)) throw e;
    return await fn();
  }
}
