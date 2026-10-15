import { readFileSync } from "node:fs";
import { chromium, type Page } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";

/**
 * The COO's click-through of the private preview against production (Plan 4 Task 11 Step 2): migrated learner,
 * migrated tutor, signed-out level check. A clean browser per role with only Vercel's bypass cookie.
 * Prints what each page shows and every console error; never passwords or the bypass secret. Run with Node (tsx).
 */
const APP = process.argv[2] ?? "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
const browser = await chromium.launch({ headless: true });

async function session(label: string, fn: (page: Page, show: (path: string, wait?: number) => Promise<string>) => Promise<void>) {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await page.goto(`${APP}/?x-vercel-protection-bypass=${readSecret("VERCEL_BYPASS")}&x-vercel-set-bypass-cookie=true`);
  const show = async (path: string, wait = 8000) => {
    await page.goto(`${APP}${path}`);
    await page.waitForTimeout(wait);
    const main = (await page.locator("main").first().innerText().catch(() => page.locator("body").innerText())).replace(/\s+/g, " ");
    return `${new URL(page.url()).pathname}: ${main}`;
  };
  console.log(`\n=== ${label}`);
  await fn(page, show);
  console.log(`console errors (${errors.length}): ${errors.join(" | ") || "none"}`);
  await page.context().close();
}

async function signIn(page: Page, email: string) {
  await page.goto(`${APP}/login`);
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", passwords[email]);
  await page.press("input[type=password]", "Enter");
  await page.waitForTimeout(8000);
}

const pick = (text: string, re: RegExp, n = 140) => { const i = text.search(re); return i < 0 ? `(no match for ${re})` : text.slice(i, i + n); };

await session("m3imm, migrated Premium learner", async (page, show) => {
  await signIn(page, "obsidianteamhq+m3imm@agentmail.to");
  console.log(`after sign-in: ${new URL(page.url()).pathname}`);
  const today = await show("/learner");
  console.log(`Today: ${pick(today, /Current level/)} | ${pick(today, /YOUR NEXT SESSION|Today’s Plan/)}`);
  console.log(`Your plan: ${pick(await show("/learner/plan"), /YOUR CURRENT PLAN/)}`);
  console.log(`Progress: ${pick(await show("/learner/progress"), /COMPLETED MINUTES|STUDY STREAK/)}`);
  console.log(`Weekly check-in: ${pick(await show("/learner/check-in"), /check-in/i)}`);
  await show("/learner/ai-tutor", 6000);
  await page.getByRole("button", { name: /^Free chat$/i }).first().click().catch(() => console.log("no Free chat button"));
  const t0 = Date.now();
  await page.locator("textarea").first().waitFor({ timeout: 60000 }).catch(() => {});
  console.log(`chat opened after ${Math.round((Date.now() - t0) / 1000)} s`);
  let tutor = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log(`AI tutor opened: ${/could not open/i.test(tutor) ? "COULD NOT OPEN" : "yes"} | ${pick(tutor, /PREMIUM PLAN|FREE PLAN/i, 120)}`);
  const box = page.locator("textarea").first();
  if (await box.count()) {
    const before = tutor.length;
    await box.fill("Bonjour ! Comment dit-on « I am learning French » en français ?");
    await page.getByRole("button", { name: /Send to tutor/i }).first().click();
    await page.waitForTimeout(40000);
    tutor = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(`AI reply arrived: ${tutor.length > before + 40} | ${/could not|try again|unavailable/i.test(tutor) ? "an error message is shown" : "no error message"} | ${pick(tutor, /messages? (used|remaining)|of 300/i, 100)}`);
  } else console.log("no message box");
});

await session("m5tut1, migrated approved tutor", async (page, show) => {
  await signIn(page, "obsidianteamhq+m5tut1@agentmail.to");
  console.log(`after sign-in: ${new URL(page.url()).pathname}`);
  console.log(`Dashboard: ${pick(await show("/tutor"), /APPLICATION STATUS/, 180)}`);
  console.log(`Availability: ${pick(await show("/tutor/availability"), /Monday/, 200)}`);
});

await session("signed out, public level check", async (page, show) => {
  const lc = await show("/level-check", 6000);
  console.log(`Level check: ${lc.slice(0, 200)}`);
  const start = page.getByRole("button", { name: /start/i }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(8000);
    const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(`after Start: ${/unavailable|could not|error/i.test(after) ? "ERROR: " : ""}${pick(after, /Question|question 1|1 of|1\//i, 160)}`);
  } else console.log("no Start button found");
});

await browser.close();
