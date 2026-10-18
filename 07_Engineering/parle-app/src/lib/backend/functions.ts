export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** functions.someName(payload) -> POST /functions/v1/some-name, with Buildy's error format ("API request failed: CODE", err.status). */
export function makeFunctions(baseUrl: string, publishableKey: string, token: () => Promise<string | null>) {
  return new Proxy({} as Record<string, (payload?: Record<string, unknown>) => Promise<Record<string, unknown>>>, {
    get: (_t, name) => typeof name !== "string" || name === "then" ? undefined : async (payload: Record<string, unknown> = {}) => {
      const t = await token();
      const res = await fetch(`${baseUrl}/functions/v1/${kebab(name)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: publishableKey, ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) });
      const parsedBody: unknown = await res.json().catch(() => ({}));
      const body = isRecord(parsedBody) ? parsedBody : {};
      if (!res.ok) {
        const err = new Error(`API request failed: ${body.error_code ?? body.error ?? res.status}`) as Error & { status: number; body: Record<string, unknown> };
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return body;
    },
  });
}
