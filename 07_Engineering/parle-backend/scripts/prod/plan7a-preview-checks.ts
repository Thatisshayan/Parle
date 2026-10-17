// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency
import { readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { openWithBypass } from "../lib/bypass";

/**
 * Plan 7A browser checks: pay a test Checkout page with Stripe's test card and come back to the preview; set m5tut1's
 * meeting link if it is empty; m5tut1's Lessons page with the brief. Outcomes only, never passwords or the bypass.
 * usage: npx tsx scripts/prod/plan7a-preview-checks.ts <pay a|pay b|meeting-link|tutor-lessons>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
// CHECK_STATE lets a later plan pay its own Checkout page (Plan 11)
const state = () => JSON.parse(readFileSync(process.env.CHECK_STATE ?? `${SECRETS_DIR}/plan7a-check-state.json`, "utf8"));
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8"));
const browser = await chromium.launch({ headless: true });
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function open() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await openWithBypass(page, APP);
  return { page, errors, close: () => context.close() };
}
async function signIn(page, email, password) {
  await page.goto(`${APP}/login`);
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.press("input[type=password]", "Enter");
  await page.waitForTimeout(8000);
}

const checks = {
  pay: async (key) => {
    const url = state().checkout?.[key];
    if (!url) throw new Error(`no Checkout page saved for ${key}`);
    const s = await open();
    try {
      await s.page.goto(url);
      await s.page.locator("#cardNumber").waitFor({ timeout: 30000 });
      await s.page.fill("#cardNumber", "4242424242424242");
      await s.page.fill("#cardExpiry", "12 / 34");
      await s.page.fill("#cardCvc", "123");
      await s.page.fill("#billingName", "Plan Seven Check");
      if (await s.page.locator("#billingPostalCode").count()) await s.page.fill("#billingPostalCode", "H2X 1Y4");
      await s.page.locator(".SubmitButton").click();
      await s.page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 90000 }).catch(() => undefined);
      const back = new URL(s.page.url());
      console.log(`pay ${key}: ${back.origin === APP ? `back on ${back.pathname} (checkout=${back.searchParams.get("checkout")})` : "still on Stripe's page"}`);
      await s.page.waitForTimeout(8000);
      console.log(`pay ${key}: page says ${/Your lesson is booked/.test(await bodyText(s.page)) ? "booked" : /Confirming your payment|still confirming/.test(await bodyText(s.page)) ? "confirming" : "something else"}`);
    } finally { await s.close(); }
  },
  "meeting-link": async () => {
    const s = await open();
    try {
      await signIn(s.page, TUTOR, passwords[TUTOR]);
      await s.page.goto(`${APP}/tutor/profile-pricing`);
      await s.page.waitForTimeout(8000);
      const input = s.page.getByLabel(/meeting link/i).first();
      if (await input.inputValue()) { console.log("meeting-link: already set, nothing changed"); return; }
      await input.fill("https://meet.google.com/plan-seven-check");
      await s.page.getByRole("button", { name: /save/i }).first().click();
      await s.page.waitForTimeout(6000);
      console.log(`meeting-link: ${/saved|pending/i.test(await bodyText(s.page)) ? "saved" : "NOT confirmed on screen"}`);
    } finally { await s.close(); }
  },
  "tutor-lessons": async () => {
    const s = await open();
    try {
      await signIn(s.page, TUTOR, passwords[TUTOR]);
      await s.page.goto(`${APP}/tutor/lessons?lesson=${state().b}`);
      await s.page.waitForTimeout(10000);
      const text = await bodyText(s.page);
      console.log(`tutor-lessons: upcoming lesson shown: ${/Upcoming/.test(text)}; brief open: ${/Lesson brief/i.test(text)}; console errors ${s.errors.length}`);
      await s.page.setViewportSize({ width: 375, height: 812 });
      await s.page.waitForTimeout(2000);
      console.log(`tutor-lessons 375 px: scrollWidth ${await s.page.evaluate(() => document.documentElement.scrollWidth)}`);
    } finally { await s.close(); }
  },
};

const [which, arg] = process.argv.slice(2);
if (!checks[which]) throw new Error(`usage: npx tsx scripts/prod/plan7a-preview-checks.ts <${Object.keys(checks).join("|")}>`);
try { await checks[which](arg); } finally { await browser.close(); }
