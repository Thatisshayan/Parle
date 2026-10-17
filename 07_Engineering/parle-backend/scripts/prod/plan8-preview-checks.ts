// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency
import { readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { openWithBypass } from "../lib/bypass";

/**
 * Plan 8 browser checks on the private preview and parle.buzz. Outcomes only, never passwords or the bypass.
 * usage: npx tsx scripts/prod/plan8-preview-checks.ts <paused-signin|admin-pages|unsubscribe-pages>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8"));
const browser = await chromium.launch({ headless: true });
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function open(width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
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
  "paused-signin": async () => {
    const l = JSON.parse(readFileSync(`${SECRETS_DIR}/plan8-check-state.json`, "utf8")).learner;
    const s = await open();
    try {
      await signIn(s.page, l.email, l.password);
      console.log(`paused-signin: message shown ${(await bodyText(s.page)).includes("Your account is paused. Contact hello@parle.buzz.")}`);
    } finally { await s.close(); }
  },
  "admin-pages": async () => {
    for (const width of [1280, 375]) {
      const s = await open(width);
      try {
        await signIn(s.page, ADMIN, passwords[ADMIN]);
        for (const [path, words] of [["/admin/users", "Administrators"], ["/admin/metrics", "Lessons and money"], ["/admin/waitlist", "Sender's postal address"], ["/admin/bookings", "Lessons with a paused participant"]]) {
          await s.page.goto(`${APP}${path}`);
          await s.page.waitForTimeout(6000);
          const text = await bodyText(s.page);
          const wide = await s.page.evaluate(() => document.documentElement.scrollWidth);
          console.log(`admin-pages ${width}px ${path}: "${words}" ${text.includes(words)}; scrollWidth ${wide}`);
        }
        await s.page.goto(`${APP}/admin/users`);
        await s.page.waitForTimeout(6000);
        console.log(`admin-pages ${width}px: account panel "Account status" ${(await bodyText(s.page)).includes("Account status")}; preview frames on Waitlist checked above`);
        console.log(`admin-pages ${width}px: console errors ${s.errors.length}`);
      } finally { await s.close(); }
    }
  },
  "unsubscribe-pages": async () => {
    const s = await open(375);
    try {
      await s.page.goto(`${APP}/unsubscribe?t=not-a-token`);
      await s.page.waitForTimeout(5000);
      console.log(`unsubscribe app page: invalid message ${(await bodyText(s.page)).includes("This link is not valid")}`);
      await s.page.goto("https://parle.buzz/unsubscribe?t=not-a-token");
      await s.page.waitForTimeout(5000);
      const text = await bodyText(s.page);
      console.log(`unsubscribe parle.buzz page: invalid message ${text.includes("This link is not valid")}; scrollWidth ${await s.page.evaluate(() => document.documentElement.scrollWidth)}; console errors ${s.errors.length}`);
    } finally { await s.close(); }
  },
};

const name = process.argv[2] ?? "";
if (!checks[name]) throw new Error(`usage: npx tsx scripts/prod/plan8-preview-checks.ts <${Object.keys(checks).join("|")}>`);
await checks[name]();
await browser.close();
