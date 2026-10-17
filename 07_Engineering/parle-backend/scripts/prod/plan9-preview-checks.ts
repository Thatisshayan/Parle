// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { chromium } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { openWithBypass } from "../lib/bypass";

/**
 * Plan 9 browser checks on the private preview: Chromium's fake microphone plays the NVIDIA French sample.
 * Outcomes only, never passwords or the bypass. usage: npx tsx scripts/prod/plan9-preview-checks.ts <speaking-task|mic-refused|tutor>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const FAKE_MIC = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${tmpdir()}/parle-voice-sample-22k.wav%noloop`];
const learner = () => JSON.parse(readFileSync(`${SECRETS_DIR}/plan9-check-state.json`, "utf8")).learner;
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth);

async function open(args, width) {
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [], voice = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("response", (r) => { if (r.url().includes("/api/voice")) voice.push(`${r.status()} ${r.headers()["content-type"] ?? ""}`); });
  await openWithBypass(page, APP);
  const l = learner();
  await page.goto(`${APP}/login`);
  await page.fill("input[type=email]", l.email);
  await page.fill("input[type=password]", l.password);
  await page.press("input[type=password]", "Enter");
  await page.waitForTimeout(8000);
  return { browser, page, errors, voice };
}
async function record(page, seconds, sendLabel) {
  const button = page.getByRole("button", { name: "Record your answer" }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click(); // exact: the tutor also has "Stop reading"
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: sendLabel }).first().click();
}

const checks = {
  "speaking-task": async () => {
    const s = await open(FAKE_MIC, 375);
    try {
      await s.page.goto(`${APP}/learner`);
      await s.page.waitForTimeout(8000);
      await record(s.page, 18, "Send");
      await s.page.getByText("What we heard").first().waitFor({ timeout: 60000 });
      const text = await bodyText(s.page);
      console.log(`speaking-task 375px: result shown true; French heard ${/marché|famille|café/i.test(text)}; estimate label ${text.includes("Practice estimate, not an official result")}; pronunciation line ${text.includes("Pronunciation isn't scored yet.")}; scrollWidth ${await wide(s.page)}; relay answers ${s.voice.join(", ")}; console errors ${s.errors.length}`);
    } finally { await s.browser.close(); }
  },
  "mic-refused": async () => {
    const s = await open(["--deny-permission-prompts"], 375);
    try {
      await s.page.goto(`${APP}/learner`);
      await s.page.waitForTimeout(8000);
      const button = s.page.getByRole("button", { name: "Record your answer" }).first();
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await s.page.waitForTimeout(3000);
      console.log(`mic-refused: blocked message ${(await bodyText(s.page)).includes("The microphone is blocked")}`);
      await s.page.getByRole("button", { name: "Type my answer instead" }).first().click();
      await s.page.locator("textarea[lang=fr]").first().fill("Le week-end dernier, je suis allé au marché avec ma sœur et nous avons acheté du pain frais.");
      await s.page.getByRole("button", { name: "Score my typed answer" }).first().click();
      await s.page.getByText("Typed answer: scored as writing practice").first().waitFor({ timeout: 60000 });
      console.log(`mic-refused: typed answer scored and marked as writing practice true; scrollWidth ${await wide(s.page)}; console errors ${s.errors.length}`);
    } finally { await s.browser.close(); }
  },
  tutor: async () => {
    const s = await open(FAKE_MIC, 375);
    try {
      await s.page.goto(`${APP}/learner/ai-tutor?mode=speaking`);
      await s.page.waitForTimeout(20000);
      await s.page.getByRole("button", { name: "Listen" }).first().click();
      await s.page.waitForTimeout(10000);
      console.log(`tutor: Listen used the natural voice ${s.voice.some((v) => v.startsWith("200 audio/mpeg"))}`);
      await record(s.page, 8, "Use this recording");
      await s.page.waitForTimeout(15000);
      const typed = await s.page.locator("textarea").first().inputValue();
      console.log(`tutor: voice message written into the box ${typed.trim().length > 0}; French heard ${/marché|famille|café/i.test(typed)}; scrollWidth ${await wide(s.page)}; console errors ${s.errors.length}`);
    } finally { await s.browser.close(); }
  },
};

const name = process.argv[2] ?? "";
if (!checks[name]) throw new Error(`usage: npx tsx scripts/prod/plan9-preview-checks.ts <${Object.keys(checks).join("|")}>`);
await checks[name]();
