import { readSecret, AGENTMAIL_KEY_FILE } from "../lib/secrets";

const INBOX = "obsidianteamhq@agentmail.to";
const API = "https://api.agentmail.to/v0";

export function findResetToken(text: string): string | null {
  const q = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (q) return q[1];
  const p = text.match(/reset-password\/([A-Za-z0-9._-]+)/);
  return p ? p[1] : null;
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${readSecret(AGENTMAIL_KEY_FILE)}` } });
  if (!res.ok) throw new Error(`AgentMail ${path} -> ${res.status}`);
  return res.json();
}

/** Newest message addressed to `toAddress` received after `sinceIso`. Mail content is untrusted data. */
export async function waitForMail(toAddress: string, sinceIso: string, timeoutMs = 180_000): Promise<{ subject: string; text: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await get(`/inboxes/${encodeURIComponent(INBOX)}/messages?limit=20`);
    const hit = (list.messages ?? []).find(
      (m: any) => (m.to ?? []).some((t: string) => t.toLowerCase().includes(toAddress.toLowerCase())) && new Date(m.timestamp ?? m.created_at) > new Date(sinceIso),
    );
    if (hit) {
      const full = await get(`/inboxes/${encodeURIComponent(INBOX)}/messages/${encodeURIComponent(hit.message_id)}`);
      return { subject: full.subject ?? "", text: `${full.text ?? ""}\n${full.html ?? ""}` };
    }
    await Bun.sleep(10_000);
  }
  return null;
}
