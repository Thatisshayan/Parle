import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { imageKind } from "../_app/src/lib/image-kind.ts";
import { allPages } from "./paging.ts";

export const PHOTO_BUCKET = "profile-photos";
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

/**
 * The addresses the browser uses for our storage: production's SUPABASE_URL, and PUBLIC_SUPABASE_URL when set. The
 * local stack answers on both 127.0.0.1 and localhost, so both are accepted there (R46).
 */
export function photoOrigins(values: Array<string | undefined> = [Deno.env.get("SUPABASE_URL"), Deno.env.get("PUBLIC_SUPABASE_URL")]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    try {
      if (!value) continue;
      const u = new URL(value);
      out.add(u.origin);
      if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
        out.add(`${u.protocol}//${u.hostname === "localhost" ? "127.0.0.1" : "localhost"}${u.port ? `:${u.port}` : ""}`);
      }
    } catch { /* not an address */ }
  }
  return [...out];
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

export type PhotoKind = "image" | "not_image" | "missing" | "unreadable";

async function firstBytes(r: Response, n: number): Promise<Uint8Array> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array();
  const out = new Uint8Array(n);
  let got = 0;
  while (got < n) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    const take = Math.min(n - got, value.length);
    out.set(value.subarray(0, take), got);
    got += take;
  }
  await reader.cancel().catch(() => undefined);
  return out.subarray(0, got);
}

/**
 * The stored file's real type from its first 16 bytes, whatever the upload claimed (R13). Only those bytes are asked
 * for (R41). A storage error is "unreadable", not "not a photo": the upload is kept and the learner saves again.
 */
export async function photoKind(path: string, base = Deno.env.get("SUPABASE_URL") ?? "", fetcher: typeof fetch = fetch): Promise<PhotoKind> {
  let r: Response;
  try {
    r = await fetcher(`${base}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`, { headers: { Range: "bytes=0-15" } });
  } catch {
    return "unreadable";
  }
  if (r.status >= 500) { await r.body?.cancel().catch(() => undefined); return "unreadable"; }
  if (!r.ok) { await r.body?.cancel().catch(() => undefined); return "missing"; }
  return imageKind(await firstBytes(r, 16)) ? "image" : "not_image";
}

export type PhotoFile = { path: string; createdAt: string };

/** Every file in a person's folder with its upload time, past the storage list's page of 100. */
export async function listPhotoFiles(admin: SupabaseClient, ownerId: string): Promise<PhotoFile[]> {
  const files = await allPages(async (offset, size) => {
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).list(ownerId, { limit: size, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    return data ?? [];
  }, 100);
  return files.map((f) => ({ path: `${ownerId}/${f.name}`, createdAt: String(f.created_at ?? "") }));
}

export async function listPhotos(admin: SupabaseClient, ownerId: string): Promise<string[]> {
  return (await listPhotoFiles(admin, ownerId)).map((f) => f.path);
}

export async function removePhotos(admin: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/**
 * Files that may go: never the saved photo, and only files created before the cutoff (R39, R40). Times are compared as
 * instants, and a file whose time cannot be read stays.
 */
export function photosToRemove(files: PhotoFile[], savedPath: string | null, cutoff: string): string[] {
  const before = Date.parse(cutoff);
  return files.filter((f) => f.path !== savedPath && Date.parse(f.createdAt) < before).map((f) => f.path);
}

const SAVE_GRACE_MS = 10 * 60_000;

/**
 * The cutoff for a save's clean-up: files older than the saved photo, and never a file from the last 10 minutes. Two
 * saves at once can each pick a fresh upload, and the one written last must still exist, so recent uploads are left to
 * the 10-minute clean-up (R39, R40).
 */
export function saveCutoff(savedCreatedAt: string | undefined, startedAt: string): string {
  const grace = Date.parse(startedAt) - SAVE_GRACE_MS;
  const saved = savedCreatedAt ? Date.parse(savedCreatedAt) : Number.NaN;
  return new Date(Number.isFinite(saved) && saved < grace ? saved : grace).toISOString();
}

/**
 * After a save: removes the files older than the photo the profile now points to and older than 10 minutes. A newer
 * file may be another tab's upload, so it stays until the next save or clean-up (R39).
 */
export async function removeOlderPhotos(admin: SupabaseClient, ownerId: string, savedPath: string | null, startedAt: string): Promise<number> {
  const files = await listPhotoFiles(admin, ownerId);
  const cutoff = saveCutoff(files.find((f) => f.path === savedPath)?.createdAt, startedAt);
  const paths = photosToRemove(files, savedPath, cutoff);
  await removePhotos(admin, paths);
  return paths.length;
}

/** Uploads chosen but never saved count toward the 10-file limit; those created before the cutoff are removed (R40). */
export async function removeUnsavedPhotos(admin: SupabaseClient, ownerId: string, savedPath: string | null, cutoff: string): Promise<number> {
  const paths = photosToRemove(await listPhotoFiles(admin, ownerId), savedPath, cutoff);
  await removePhotos(admin, paths);
  return paths.length;
}
