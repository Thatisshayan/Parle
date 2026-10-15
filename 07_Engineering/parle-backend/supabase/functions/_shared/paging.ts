/** Reads every page of a list (by offset) until a short page; for lists that can pass one page (R17, R24). */
export async function allPages<T>(page: (offset: number, size: number) => Promise<T[]>, size = 500, maxPages = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let n = 0; n < maxPages; n++) {
    const rows = await page(n * size, size);
    out.push(...rows);
    if (rows.length < size) return out;
  }
  throw new Error(`allPages: more than ${maxPages} pages`);
}
