export type Mail = { to: string; subject: string; html: string; fromName?: string; from?: "people" | "automatic" };
const ADDRESS = { people: "hello@parle.buzz", automatic: "no-reply@parle.buzz" } as const;

/** App email (spec section 7): Resend in production, the local mail catcher (Mailpit) on staging. */
export async function sendMail(mail: Mail): Promise<{ id: string }> {
  const address = ADDRESS[mail.from ?? "automatic"];
  const name = mail.fromName ?? "Parle";
  if ((Deno.env.get("EMAIL_TRANSPORT") ?? "resend") === "mailpit") {
    const r = await fetch(`${Deno.env.get("MAILPIT_URL")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: address, Name: name }, To: [{ Email: mail.to }], Subject: mail.subject, HTML: mail.html }),
    });
    if (!r.ok) throw new Error(`EMAIL_SEND_FAILED ${r.status}`);
    return { id: String((await r.json().catch(() => ({}))).ID ?? "") };
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("EMAIL_NOT_CONFIGURED");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${name} <${address}>`, to: [mail.to], subject: mail.subject, html: mail.html }),
  });
  if (!r.ok) throw new Error(`EMAIL_SEND_FAILED ${r.status}`);
  return { id: String((await r.json().catch(() => ({}))).id ?? "") };
}
