import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const APP_DIR = resolve(import.meta.dir, "../../parle-app");
export const FUNCTIONS_DIR = resolve(import.meta.dir, "../supabase/functions");
const OUT_DIR = join(FUNCTIONS_DIR, "_app");

/** Entry files: their single Deno.serve( becomes `export const handler = (` so _shared/serve.ts can wrap them. */
export const ENTRY_FILES = ["functions/parle-public-level-check.ts", "functions/parle-assessment-service.ts", "functions/parle-marketplace-service.ts"];
/** Other app modules the server runs as they are (later tasks add the plan engine and placement scoring). */
export const LIB_ROOTS: string[] = ["src/lib/backend/query.ts", "functions/parle-marketplace-refresh.logic.helper.ts", "functions/parle-premium-status.helper.ts", "src/lib/learner-plan.ts"];

const SHIMS: Record<string, string> = { "@/entities": "_shared/app-shims/entities.ts", "@/functions": "_shared/app-shims/functions.ts" };
const REWRITES: Record<string, string> = { "npm:@superdevhq/client@0.1.56": "_shared/superdev-compat.ts" };
const IMPORT_RE = /(\bimport\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?|\bexport\s+(?:type\s+)?[^"';]*?\s+from\s+|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

const posix = (p: string) => p.split(sep).join("/");
const outPath = (src: string) => join(OUT_DIR, relative(APP_DIR, src));
function rel(fromOut: string, toAbs: string) {
  const r = posix(relative(dirname(fromOut), toAbs));
  return r.startsWith(".") ? r : `./${r}`;
}
function resolveSource(fromSrc: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(APP_DIR, "src", spec.slice(2)) : resolve(dirname(fromSrc), spec);
  for (const c of [base, `${base}.ts`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** The generated files, keyed by path relative to supabase/functions. */
export function generate(): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [...ENTRY_FILES, ...LIB_ROOTS].map((p) => join(APP_DIR, p));
  const seen = new Set<string>();
  while (queue.length) {
    const src = queue.shift()!;
    if (seen.has(src)) continue;
    seen.add(src);
    const name = posix(relative(APP_DIR, src));
    if (!src.endsWith(".ts")) throw new Error(`server code cannot import ${name}`);
    const out = outPath(src);
    let text = readFileSync(src, "utf8").replace(/\r\n/g, "\n").replace(IMPORT_RE, (whole, head, q, spec: string) => {
      const mapped = SHIMS[spec] ?? REWRITES[spec];
      if (mapped) return `${head}${q}${rel(out, join(FUNCTIONS_DIR, mapped))}${q}`;
      if (/^(npm|jsr|node|https?):/.test(spec)) return whole;
      if (!spec.startsWith(".") && !spec.startsWith("@/")) throw new Error(`${name}: bare import "${spec}" needs an npm: mapping in sync-app-code.ts`);
      const target = resolveSource(src, spec);
      if (!target) throw new Error(`${name}: cannot resolve "${spec}"`);
      queue.push(target);
      return `${head}${q}${rel(out, outPath(target))}${q}`;
    });
    if (ENTRY_FILES.includes(name)) {
      const n = text.split("Deno.serve(").length - 1;
      if (n !== 1) throw new Error(`${name}: expected one Deno.serve( but found ${n}`);
      text = text.replace("Deno.serve(", "export const handler = (");
    }
    files.set(posix(relative(FUNCTIONS_DIR, out)), `// GENERATED from parle-app/${name} by scripts/sync-app-code.ts. Do not edit.\n${text}`);
  }
  return files;
}

export function onDisk(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(posix(relative(FUNCTIONS_DIR, p)), readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
    }
  };
  walk(OUT_DIR);
  return out;
}

/** Writes only changed files and removes stale ones, so a running `functions serve` keeps working. */
export function write(files: Map<string, string>) {
  const disk = onDisk();
  for (const path of disk.keys()) if (!files.has(path)) rmSync(join(FUNCTIONS_DIR, path), { force: true });
  for (const [path, text] of files) {
    if (disk.get(path) === text) continue;
    const p = join(FUNCTIONS_DIR, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

if (import.meta.main) {
  const f = generate();
  write(f);
  console.log(`wrote ${f.size} files to supabase/functions/_app`);
}
