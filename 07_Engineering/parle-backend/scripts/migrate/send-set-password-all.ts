import { readFileSync } from "node:fs";
import { PROD_REF, serviceKey } from "../prod/management";
import { sendSetPasswordMail } from "./set-password-mail";
import type { ExportBundle } from "./types";

/**
 * Cut-over step 4 (Plan 4 Task 12): "Set your password for Parle" to every migrated person through Resend.
 * Without --send it only lists the recipients, so the founder can confirm the list first.
 * usage: bun send-set-password-all.ts <bundle.json> <app url> [--send]
 */
const [file, appUrl, send] = process.argv.slice(2);
if (!file || !appUrl) throw new Error("usage: bun send-set-password-all.ts <bundle.json> <app url> [--send]");
const people = (JSON.parse(readFileSync(file, "utf8")) as ExportBundle).people;
console.log(`recipients (${people.length}):\n${people.map((p) => `  ${p.email}`).join("\n")}`);
if (send !== "--send") {
  console.log("list only; add --send after the founder confirms it");
} else {
  const target = { url: `https://${PROD_REF}.supabase.co`, serviceKey: await serviceKey(PROD_REF) };
  for (const p of people) {
    try {
      await sendSetPasswordMail(target, p.email, appUrl, "resend");
      console.log(`sent ${p.email}`);
    } catch (e) {
      console.log(`FAILED ${p.email}: ${(e as Error).message}`);
    }
  }
}
