// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency
import { readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";

/**
 * Plan 7B browser checks on the private preview: pay a Checkout page with Stripe's test card; set the payout delay as
 * the test administrator; release a held payout on the Payouts screen; m5tut1's Earnings page. Outcomes only.
 * usage: npx tsx scripts/prod/plan7b-preview-checks.ts <pay c|pay d|delay <hours>|release d|earnings>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const state = () => JSON.parse(readFileSync(`${SECRETS_DIR}/plan7b-check-state.json`, "utf8"));
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8"));
const browser = await chromium.launch({ headless: true });
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function open() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await page.goto(`${APP}/?x-vercel-protection-bypass=${readSecret("VERCEL_BYPASS")}&x-vercel-set-bypass-cookie=true`);
  return { page, errors, close: () => context.close() };
}
async function signIn(page, email, password, path = "/login") {
  await page.goto(`${APP}${path}`);
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
      console.log(`pay ${key}: ${new URL(s.page.url()).origin === APP ? "back on the preview" : "still on Stripe's page"}`);
    } finally { await s.close(); }
  },
  delay: async (hours) => {
    if (!/^\d+$/.test(hours ?? "")) throw new Error("usage: delay <hours>");
    const s = await open();
    try {
      await signIn(s.page, ADMIN, passwords[ADMIN], "/admin/login");
      await s.page.goto(`${APP}/admin/settings`);
      await s.page.waitForTimeout(8000);
      await s.page.fill("#setting-payout_delay_hours", hours);
      await s.page.getByRole("button", { name: /^Save settings$/ }).click();
      await s.page.waitForTimeout(6000);
      console.log(`delay ${hours}: ${(await bodyText(s.page)).includes("Settings saved.") ? "saved" : "NOT confirmed on screen"}`);
    } finally { await s.close(); }
  },
  release: async (key) => {
    const id = state()[key];
    if (!id) throw new Error(`no lesson ${key}`);
    const s = await open();
    try {
      await signIn(s.page, ADMIN, passwords[ADMIN], "/admin/login");
      await s.page.goto(`${APP}/admin/payouts`);
      await s.page.waitForTimeout(10000);
      const card = s.page.locator("li", { hasText: id });
      if (!(await card.count())) { console.log(`release ${key}: the held payout is NOT on the Payouts screen`); return; }
      await card.getByRole("button", { name: "Release payment" }).click();
      await card.getByRole("button", { name: "Confirm" }).click();
      await s.page.waitForTimeout(10000);
      console.log(`release ${key}: screen says ${(await bodyText(s.page)).includes("Done. The list is up to date.") ? "done" : "something else"}; still held on screen: ${(await s.page.locator("li", { hasText: id }).count()) > 0}; console errors ${s.errors.length}`);
      await s.page.setViewportSize({ width: 375, height: 812 });
      await s.page.waitForTimeout(2000);
      console.log(`payouts screen 375 px: scrollWidth ${await s.page.evaluate(() => document.documentElement.scrollWidth)}`);
    } finally { await s.close(); }
  },
  earnings: async () => {
    const s = await open();
    try {
      await signIn(s.page, TUTOR, passwords[TUTOR]);
      await s.page.goto(`${APP}/tutor/earnings`);
      await s.page.waitForTimeout(10000);
      const text = await bodyText(s.page);
      console.log(`earnings: account ready: ${text.includes("Your payout account is ready")}; a paid lesson with its Stripe reference: ${text.includes("Stripe reference")}; monthly totals: ${text.includes("Monthly totals")}; converted amount shown (Plan 11, A70): ${/Stripe sent CA\$[0-9.,]+ \(converted/.test(text)}; console errors ${s.errors.length}`);
      await s.page.setViewportSize({ width: 375, height: 812 });
      await s.page.waitForTimeout(2000);
      console.log(`earnings 375 px: scrollWidth ${await s.page.evaluate(() => document.documentElement.scrollWidth)}`);
    } finally { await s.close(); }
  },
};

const [which, arg] = process.argv.slice(2);
if (!checks[which]) throw new Error(`usage: npx tsx scripts/prod/plan7b-preview-checks.ts <${Object.keys(checks).join("|")}>`);
try { await checks[which](arg); } finally { await browser.close(); }
