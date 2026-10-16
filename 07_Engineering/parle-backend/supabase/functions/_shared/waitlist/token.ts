import { sameSecret } from "../secret.ts";

/**
 * Unsubscribe tokens (spec 4.5, ruling 10): base64url(lower-case address) "." base64url(HMAC-SHA256(secret,
 * "unsubscribe:" + address)). No login needed; a token for another address cannot be made without the secret. Pure.
 */
const enc = new TextEncoder();
export const normalEmail = (email: string) => email.trim().toLowerCase();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function mac(secret: string, email: string): Promise<string> {
  if (secret.length < 32) throw new Error("WAITLIST_UNSUBSCRIBE_SECRET is missing or too short");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`unsubscribe:${email}`))));
}

export async function unsubscribeToken(secret: string, email: string): Promise<string> {
  const e = normalEmail(email);
  return `${b64url(enc.encode(e))}.${await mac(secret, e)}`;
}

/** The address a token was made for, or null (forged, damaged, or made with another secret). */
export async function emailFromToken(secret: string, token: string): Promise<string | null> {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 1000) return null;
  const bytes = fromB64url(parts[0]);
  if (!bytes) return null;
  let email: string;
  try { email = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
  if (email !== normalEmail(email) || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return sameSecret(await mac(secret, email), parts[1]) ? email : null;
}
