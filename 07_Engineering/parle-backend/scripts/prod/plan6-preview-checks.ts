// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency, so its types are not visible here
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { PROD_URL, anonKey, fn, newLearner, removeLearner } from "./check-learners";

/**
 * Plan 6 checks on the private preview against production, in a clean browser per role that carries only Vercel's
 * bypass cookie: A28 (first Today in the browser), B4 (tutor task hand-off as m3imm), B5 (commission sentence and the
 * admin screens at 375 px, as the test admin of decision #52). Outcomes and console errors only; never passwords or
 * the bypass secret. usage: npx tsx scripts/prod/plan6-preview-checks.ts <today-first-open|tutor-task|admin-screens>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const LEARNER = "obsidianteamhq+m3imm@agentmail.to";
const TUTOR = "obsidianteamhq+m5tut1@agentmail.to";
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8"));
const browser = await chromium.launch({ headless: true });
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const pick = (text, re, n = 160) => { const i = text.search(re); return i < 0 ? `(no match for ${re})` : text.slice(i, i + n); };

async function open(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
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

async function waitFor(page, test, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await test()) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(250);
  }
  return null;
}

const checks = {
  "today-first-open": async () => {
    const l = await newLearner("a28ui", "A2");
    const s = await open();
    try {
      await signIn(s.page, l.email, l.password);
      const t0 = Date.now();
      await s.page.goto(`${APP}/learner`);
      const shown = await waitFor(s.page, async () => (await bodyText(s.page)).includes("A focused French plan for today"), 60000);
      console.log(`A28 browser: plan shown after ${shown === null ? "more than 60" : ((Date.now() - t0) / 1000).toFixed(1)} s`);
      const ready = await waitFor(s.page, async () => !(await bodyText(s.page)).includes("Preparing your practice"), 120000);
      const text = await bodyText(s.page);
      console.log(`A28 browser: practice ready ${ready === null ? "NOT within 120 s" : `after ${((Date.now() - t0) / 1000).toFixed(1)} s`}; AI-written ${(text.match(/AI-written practice/g) ?? []).length}, bank ${(text.match(/Approved demo-bank item/g) ?? []).length}, could not be loaded ${(text.match(/could not be loaded/g) ?? []).length}`);
      console.log(`console errors (${s.errors.length}): ${s.errors.join(" | ") || "none"}`);
    } finally { await s.close(); await removeLearner(l); }
  },

  "tutor-task": async () => {
    const s = await open();
    try {
      await signIn(s.page, LEARNER, passwords[LEARNER]);
      await s.page.goto(`${APP}/learner`);
      await s.page.waitForTimeout(12000);
      const hrefs = await s.page.locator('a[href*="/learner/ai-tutor?mode="]').evaluateAll((links) => links.map((a) => a.getAttribute("href")));
      const href = hrefs.find((h) => h.includes("mode=writing")) ?? hrefs.find((h) => h.includes("mode=speaking"));
      if (!href) {
        console.log(`B4: no writing or speaking task with an AI tutor link on Today (links: ${hrefs.length}, lesson links: ${hrefs.filter((h) => h.includes("mode=lesson")).length})`);
        return;
      }
      const taskId = decodeURIComponent(new URL(href, APP).searchParams.get("task_id"));
      const mode = new URL(href, APP).searchParams.get("mode");
      console.log(`B4: opening the ${mode} task from Today`);
      await s.page.goto(`${APP}${href}`);
      await s.page.locator("textarea").first().waitFor({ timeout: 90000 });
      await s.page.locator("textarea").first().fill("Bonjour, je m'appelle Sam. Je habite à Toronto depuis deux ans. Je travaille dans un bureau et je aime mon travail. Le week-end, je vais au marché avec ma famille et nous achetons des légumes frais.");
      await s.page.getByRole("button", { name: /Correct my writing|Send for speaking feedback|Send to tutor/ }).first().click();
      const finish = s.page.getByRole("button", { name: /^Finish session$/ });
      const enabled = await waitFor(s.page, async () => (await finish.count()) > 0 && await finish.first().isEnabled(), 120000);
      console.log(`B4: tutor feedback arrived and Finish enabled: ${enabled !== null}`);
      if (enabled === null) { console.log(`B4 screen: ${pick(await bodyText(s.page), /could not|try again|Finish/i)}`); return; }
      await finish.first().click();
      const saved = await waitFor(s.page, async () => (await bodyText(s.page)).includes("Tutor feedback saved and the planned task is marked done."), 30000);
      console.log(`B4: "task marked done" message shown: ${saved !== null}`);
      await s.page.goto(`${APP}/learner`);
      await s.page.waitForTimeout(12000);
      console.log(`B4: Today still offers the tutor link for this task: ${(await s.page.locator(`a[href*="task_id=${encodeURIComponent(taskId)}"]`).count()) > 0}`);
      const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: LEARNER, password: passwords[LEARNER] });
      const token = (await c.auth.getSession()).data.session.access_token;
      const plan = await fn("parle-plan-service", token, { action: "get_or_create_plan", options: {} });
      console.log(`B4: task status on the server after Finish: ${(plan.body.result?.tasks ?? []).find((x) => x.id === taskId)?.status ?? "not in this week's plan"}`);
      await c.auth.signOut({ scope: "local" });
      console.log(`console errors (${s.errors.length}): ${s.errors.join(" | ") || "none"}`);
    } finally { await s.close(); }
  },

  "admin-screens": async () => {
    const admin = await open();
    const setCommission = async (value) => {
      await admin.page.goto(`${APP}/admin/settings`);
      await admin.page.waitForTimeout(8000);
      await admin.page.fill("#setting-commission_percent", value);
      await admin.page.getByRole("button", { name: /^Save settings$/ }).click();
      const ok = await waitFor(admin.page, async () => (await bodyText(admin.page)).includes("Settings saved."), 20000);
      console.log(`B5 commission set to ${value}: ${ok !== null ? "saved" : `NOT saved: ${pick(await bodyText(admin.page), /could not|error|between/i)}`}`);
    };
    const agreementSentence = async () => {
      const tutor = await open();
      try {
        await signIn(tutor.page, TUTOR, passwords[TUTOR]);
        await tutor.page.goto(`${APP}/tutor/application`);
        await tutor.page.waitForTimeout(8000);
        await tutor.page.getByRole("navigation").getByRole("button", { name: /Agreement/ }).first().click();
        await tutor.page.waitForTimeout(2000);
        return pick(await bodyText(tutor.page), /Parle applies a [\d.]+% platform commission/, 60);
      } finally { await tutor.close(); }
    };
    let original = "20";
    try {
      await signIn(admin.page, ADMIN, passwords[ADMIN], "/admin/login");
      console.log(`B5 admin signed in, landed on ${new URL(admin.page.url()).pathname}`);
      await admin.page.goto(`${APP}/admin/settings`);
      await admin.page.waitForTimeout(8000);
      original = await admin.page.inputValue("#setting-commission_percent");
      console.log(`B5 commission before: ${original}`);
      await setCommission("25");
      console.log(`B5 tutor agreement at 25: ${await agreementSentence()}`);
    } finally {
      await setCommission(original || "20");
      console.log(`B5 tutor agreement after reset: ${await agreementSentence()}`);
      await admin.close();
    }
    const narrow = await open({ width: 375, height: 812 });
    try {
      await signIn(narrow.page, ADMIN, passwords[ADMIN], "/admin/login");
      const measure = async (label) => {
        await narrow.page.waitForTimeout(6000);
        const width = await narrow.page.evaluate(() => document.documentElement.scrollWidth);
        const wide = width <= 375 ? [] : await narrow.page.evaluate(() => [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > 376)
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${(el.textContent ?? "").trim().slice(0, 40)}"`));
        console.log(`B5 375 px ${label}: scrollWidth ${width} ${width <= 375 ? "ok" : `TOO WIDE: ${wide.join(" | ")}`}`);
      };
      await narrow.page.goto(`${APP}/admin/settings`);
      await measure("Settings");
      await narrow.page.click("#admin-control-tab-audit");
      await measure("Audit log");
      await narrow.page.goto(`${APP}/admin/users`);
      await measure("Users");
      console.log(`console errors (${narrow.errors.length}): ${narrow.errors.join(" | ") || "none"}`);
    } finally { await narrow.close(); }
  },
};

const which = process.argv[2] ?? "";
if (!checks[which]) throw new Error(`usage: npx tsx scripts/prod/plan6-preview-checks.ts <${Object.keys(checks).join("|")}>`);
try { await checks[which](); } finally { await browser.close(); }
