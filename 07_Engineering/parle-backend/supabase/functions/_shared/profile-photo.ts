import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { imageKind } from "../_app/src/lib/image-kind.ts";
import { allPages } from "./paging.ts";

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

/** True when the stored file really is a PNG, JPEG, WebP or GIF (its first bytes), whatever the upload claimed (R13). */
export async function photoIsImage(admin: SupabaseClient, path: string): Promise<boolean> {
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return false;
  return imageKind(new Uint8Array(await data.slice(0, 16).arrayBuffer())) !== null;
}

/** Every file in a person's folder, past the storage list's page of 100. */
export async function listPhotos(admin: SupabaseClient, ownerId: string): Promise<string[]> {
  const files = await allPages(async (offset, size) => {
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).list(ownerId, { limit: size, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    return data ?? [];
  }, 100);
  return files.map((f) => `${ownerId}/${f.name}`);
}

export async function removePhotos(admin: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Keeps one photo per person: the one just saved (or none). */
export async function removeOtherPhotos(admin: SupabaseClient, ownerId: string, keep: string | null): Promise<void> {
  await removePhotos(admin, (await listPhotos(admin, ownerId)).filter((p) => p !== keep));
}
