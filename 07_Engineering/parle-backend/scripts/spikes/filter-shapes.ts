import { readFileSync } from "node:fs";
import { Glob } from "bun";

export function scanShapes(source: string) {
  const operators: Record<string, number> = {};
  const sorts: Record<string, number> = {};
  let withLimit = 0, withSkip = 0;
  const callRe = /\.filter\(\s*(\{[\s\S]*?\})\s*(?:,\s*("[^"]*"|'[^']*'|[A-Za-z_][\w.]*)\s*)?(?:,\s*([^,)]+)\s*)?(?:,\s*([^,)]+)\s*)?\)/g;
  for (const m of source.matchAll(callRe)) {
    for (const op of m[1].matchAll(/\$(ne|gt|gte|lt|lte|in|nin|or|and|exists|regex)\b/g)) operators["$" + op[1]] = (operators["$" + op[1]] ?? 0) + 1;
    if (m[2] && /^["']/.test(m[2])) { const s = m[2].slice(1, -1); sorts[s] = (sorts[s] ?? 0) + 1; }
    if (m[3]) withLimit++;
    if (m[4]) withSkip++;
  }
  return { operators, sorts, withLimit, withSkip };
}

if (import.meta.main) {
  const root = "D:/AgentDevWork/repos/Parle/07_Engineering/parle-app";
  let all = "";
  for (const dir of ["src", "functions"]) for (const f of new Glob("**/*.{ts,tsx}").scanSync(`${root}/${dir}`)) if (!f.includes(".test.")) all += readFileSync(`${root}/${dir}/${f}`, "utf8") + "\n";
  console.log(JSON.stringify(scanShapes(all), null, 2));
}
