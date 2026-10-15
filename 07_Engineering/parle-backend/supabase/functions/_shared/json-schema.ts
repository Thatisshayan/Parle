type Schema = Record<string, any>;
const typeOk = (t: string, v: unknown) =>
  t === "null" ? v === null : t === "array" ? Array.isArray(v) : t === "integer" ? Number.isInteger(v)
  : t === "object" ? typeof v === "object" && v !== null && !Array.isArray(v) : typeof v === t;

/** Problems found in `value` against a JSON-schema subset (type, enum, required, properties, items, min/maxItems). */
export function validateJson(value: unknown, schema: Schema, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const out: string[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t: string) => typeOk(t, value))) return [`${path}: expected ${types.join(" or ")}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) out.push(`${path}: not one of ${schema.enum.join(", ")}`);
  if (typeOk("object", value)) {
    const obj = value as Record<string, unknown>;
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in obj) out.push(...validateJson(obj[k], sub as Schema, `${path}.${k}`));
    for (const k of schema.required ?? []) if (!(k in obj)) out.push(`${path}.${k}: required`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => out.push(...validateJson(v, schema.items, `${path}[${i}]`)));
  }
  return out;
}
