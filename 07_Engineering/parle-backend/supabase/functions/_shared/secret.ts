/** Compares two secrets in time that does not depend on where they differ; empty or different-length never match. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Relay secrets must be explicitly provisioned; legacy placeholders must never grant relay-only actions. */
export function usableRelaySecret(secret: string): boolean {
  return secret.length >= 32 && !/^(?:pending|change[-_ ]?me|placeholder)$/i.test(secret);
}
