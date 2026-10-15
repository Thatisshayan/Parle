export const PHOTO_BUCKET = "profile-photos";
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

/** The addresses the browser uses for our storage: production's SUPABASE_URL, and PUBLIC_SUPABASE_URL when set. */
export function photoOrigins(): string[] {
  const out: string[] = [];
  for (const value of [Deno.env.get("SUPABASE_URL"), Deno.env.get("PUBLIC_SUPABASE_URL")]) {
    try { if (value) out.push(new URL(value).origin); } catch { /* not an address */ }
  }
  return out;
}

/** The storage path of a photo in the caller's own folder of our public bucket, or null for any other address (R10). */
export function ownPhotoPath(url: unknown, ownerId: string, origins = photoOrigins()): string | null {
  if (typeof url !== "string" || !url || url.length > 500) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!origins.includes(u.origin) || u.search || u.hash) return null;
  const prefix = `/storage/v1/object/public/${PHOTO_BUCKET}/${ownerId}/`;
  if (!u.pathname.startsWith(prefix)) return null;
  const file = u.pathname.slice(prefix.length);
  return FILE.test(file) ? `${ownerId}/${file}` : null;
}
