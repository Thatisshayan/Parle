// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency, so its types are not visible here
import { readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret } from "../lib/secrets";
import { waitForMail } from "../buildy/agentmail";

/**
 * Sign-up on the private preview as a real visitor would (Plan 4 Task 9 Step 4): a fresh browser that carries only
 * Vercel's bypass cookie (no extra request headers), an agent mailbox address, the emailed code, then the first
 * signed-in page. Prints outcomes and console errors only; never the bypass secret or the code.
 */
const APP = process.argv[2] ?? "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const errors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(`${APP}/?x-vercel-protection-bypass=${readSecret("VERCEL_BYPASS")}&x-vercel-set-bypass-cookie=true`);
const email = `obsidianteamhq+preview${Date.now().toString(36)}@agentmail.to`;
const since = new Date(Date.now() - 5000).toISOString();
await page.goto(`${APP}/signup`);
await page.fill("input[type=text]", "Preview Check");
await page.fill("input[type=email]", email);
await page.fill("input[type=password]", `Preview-${crypto.randomUUID().slice(0, 8)}1`);
await page.check("input[type=checkbox]");
await page.click("button[type=submit]");
console.log(`signed up ${email}`);
const mail = await waitForMail(email, since);
const code = mail?.text.match(/\b(\d{6,10})\b/)?.[1] ?? "";
console.log(`mail from ${mail?.from.replace(/.*</, "").replace(/>.*/, "")}; code length ${code.length}`);
await page.fill("input[autocomplete=one-time-code]", code);
await page.getByRole("button", { name: "Verify" }).click();
await page.waitForTimeout(12000);
const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log(`landed on ${new URL(page.url()).pathname}: ${text.slice(0, 160)}`);
console.log(`setup error shown: ${/could not save|Try setup again/.test(text)}`);
console.log(`onboarding step counter: ${(text.match(/STEP \d+ OF \d+/i) ?? ["none"])[0]}; account step offered: ${/Create your learner account/.test(text)}`);
console.log(`console errors (${errors.length}): ${errors.join(" | ") || "none"}`);
await browser.close();
void readFileSync;
