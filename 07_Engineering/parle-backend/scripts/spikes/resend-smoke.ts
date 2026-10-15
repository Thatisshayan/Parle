import { readSecret } from "../lib/secrets";

const key = readSecret("RESEND_API_KEY");
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: "Parle <hello@parle.buzz>", to: ["obsidianteamhq+resend@agentmail.to"], subject: "Parle sending test", text: "Test from the Parle backend set-up (Plan 2, Task 8). No action needed." }),
});
const body: any = await res.json().catch(() => ({}));
console.log(res.ok ? `sent, id ${String(body.id).slice(0, 8)}...` : `failed ${res.status} ${body.name ?? ""} ${body.message ?? ""}`);
