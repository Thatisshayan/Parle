const MAILPIT = "http://127.0.0.1:54324/api/v1";

/** Newest message to `to` received at or after `sinceIso` in the local mail catcher. */
export async function latestMail(to: string, sinceIso: string, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const list = await (await fetch(`${MAILPIT}/messages?limit=50`)).json();
    const hit = (list.messages ?? []).find((m: any) => (m.To ?? []).some((t: any) => t.Address?.toLowerCase() === to.toLowerCase()) && new Date(m.Created) >= new Date(sinceIso));
    if (hit) {
      const m = await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json();
      return { subject: m.Subject as string, text: (m.Text ?? "") as string, html: (m.HTML ?? "") as string };
    }
    await Bun.sleep(500);
  }
  throw new Error(`No mail to ${to}`);
}
export const codeFrom = (text: string) => text.match(/\b(\d{6})\b/)![1];
export const tokenHashFrom = (html: string) => decodeURIComponent(html.replace(/&amp;/g, "&").match(/[?&]token=([^"&<\s]+)/)![1]);
