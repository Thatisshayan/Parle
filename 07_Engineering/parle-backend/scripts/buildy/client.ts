export const BUILDY_API = "https://www.buildy.ai/api";
export const BUILDY_APP_ID = "yuircx1jlz5bpg1jbv2th";
export const BUILDY_ORIGIN = "https://yuircx1jlz5bpg1jbv2th.buildy.show";

export type BuildySession = { accessToken: string; userId: string; email: string };
export type ReadResult =
  | { readable: true; rows: Record<string, unknown>[] }
  | { readable: false; status: number; error: string };

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Origin: BUILDY_ORIGIN, "X-App-ID": BUILDY_APP_ID };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function buildyPost(path: string, body: Record<string, unknown>, token?: string): Promise<Response> {
  return fetch(`${BUILDY_API}${path}`, { method: "POST", headers: headers(token), body: JSON.stringify({ ...body, appId: BUILDY_APP_ID, inApp: true }) });
}

export async function signIn(email: string, password: string): Promise<BuildySession> {
  const res = await buildyPost("/auth/app-login", { email, password });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Buildy sign-in failed for ${email}: ${res.status} ${data.error ?? ""}`);
  return { accessToken: data.accessToken, userId: data.user.id, email: data.user.email };
}

export async function listAll(session: BuildySession, entity: string, pageSize = 200): Promise<ReadResult> {
  const rows: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const qs = new URLSearchParams({ q: "{}", limit: String(pageSize), skip: String(skip) });
    const res = await fetch(`${BUILDY_API}/apps/${BUILDY_APP_ID}/entities/${entity}?${qs}`, { headers: headers(session.accessToken) });
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return { readable: false, status: res.status, error: data.error ?? data.message ?? res.statusText };
    }
    const page = (await res.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { readable: true, rows };
}
