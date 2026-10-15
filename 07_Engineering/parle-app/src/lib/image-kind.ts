export type ImageKind = { mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; ext: "png" | "jpg" | "webp" | "gif" };

/** The image type from a file's first bytes (its real type, not its name or the browser's label); null if not accepted. */
export function imageKind(head: Uint8Array): ImageKind | null {
  const at = (i: number, expected: number[]) => expected.every((b, k) => head[i + k] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (at(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return { mime: "image/gif", ext: "gif" };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { mime: "image/webp", ext: "webp" };
  return null;
}
