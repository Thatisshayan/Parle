// @ts-nocheck -- run with Node (npx tsx); Playwright comes from the gstack install, not a project dependency
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { webkit, devices } from "file:///C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { openWithBypass } from "../lib/bypass";

/**
 * Plan 12 (A95, A99, R103, R107): the private preview on an emulated iPhone 15 (Playwright WebKit: Safari's engine,
 * iPhone screen, touch and user agent). WebKit has no fake microphone, so the page's getUserMedia returns the French
 * voice sample played through an AudioContext. What this cannot show: iOS's own microphone prompt and autoplay rules,
 * and real iPhone audio hardware (the founder's short real-device check covers those).
 * Needs the Plan 9 check learner: `bun scripts/prod/plan9-checks.ts learner` first, `cleanup` after.
 * usage: npx tsx scripts/prod/iphone-emulation-check.ts        Outcomes only; never passwords or the bypass.
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const SAMPLE = `${tmpdir()}/parle-voice-sample-22k.wav`;
const learner = () => JSON.parse(readFileSync(`${SECRETS_DIR}/plan9-check-state.json`, "utf8")).learner;
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

function micScript(sampleBase64: string | null, refuse: boolean) {
  return `(() => {
    const refuse = ${refuse};
    const sample = ${sampleBase64 ? JSON.stringify(sampleBase64) : "null"};
    navigator.mediaDevices.getUserMedia = async () => {
      if (refuse) throw new DOMException("Permission denied", "NotAllowedError");
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      if (sample) {
        const bytes = Uint8Array.from(atob(sample), (c) => c.charCodeAt(0));
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(dest); src.start();
      } else {
        const osc = ctx.createOscillator(); osc.connect(dest); osc.start();
      }
      return dest.stream;
    };
  })();`;
}

async function open(refuse = false) {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 15"] });
  const sample = existsSync(SAMPLE) ? readFileSync(SAMPLE).toString("base64") : null;
  await context.addInitScript(micScript(sample, refuse));
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
  return { browser, page, errors, voice, sample: Boolean(sample) };
}
const CANNOT_RECORD = "This browser cannot record audio";
/** Returns false when this engine cannot record (no MediaRecorder) and the app said so; true once the answer was sent. */
async function record(page, seconds, sendLabel) {
  const button = page.getByRole("button", { name: "Record your answer" }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click({ timeout: 15000 });
  await page.waitForTimeout(2000);
  if ((await bodyText(page)).includes(CANNOT_RECORD)) return false;
  await page.waitForTimeout(seconds * 1000 - 2000);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click({ timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: sendLabel }).first().click({ timeout: 15000 });
  return true;
}
const step = async (name, run) => {
  try { await run(); } catch (e) { console.log(`${name}: FAILED (${String(e?.message ?? e).split("\n")[0].slice(0, 160)})`); }
};

const s = await open();
try {
  const support = await s.page.evaluate(() => ({
    vendor: navigator.vendor,
    mp4: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4;codecs=mp4a.40.2"),
    webm: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus"),
  }));
  console.log(`browser: vendor "${support.vendor}"; MP4/AAC recording ${support.mp4}; WebM/Opus ${support.webm}; app picks ${support.vendor.startsWith("Apple") && support.mp4 ? "MP4 (A99)" : support.webm ? "WebM" : "the browser's choice"}; French sample as microphone ${s.sample}`);
  await step("speaking task", async () => {
    await s.page.goto(`${APP}/learner`);
    await s.page.waitForTimeout(8000);
    if (!(await record(s.page, 18, "Send"))) { console.log(`speaking task: this engine cannot record (no MediaRecorder); the app shows "${CANNOT_RECORD}. Type your answer instead." true`); return; }
    await s.page.getByText("What we heard").first().waitFor({ timeout: 90000 });
    const text = await bodyText(s.page);
    console.log(`speaking task: result shown true; French heard ${/marché|famille|café/i.test(text)}; relay answers ${[...new Set(s.voice)].join(", ")}`);
  });
  await step("tutor", async () => {
    s.voice.length = 0;
    await s.page.goto(`${APP}/learner/ai-tutor?mode=speaking`);
    await s.page.waitForTimeout(20000);
    await s.page.getByRole("button", { name: "Listen" }).first().click({ timeout: 15000 });
    await s.page.waitForTimeout(10000);
    const text = await bodyText(s.page);
    console.log(`tutor Listen: natural voice ${s.voice.some((v) => v.startsWith("200 audio/mpeg"))}; "tap to listen" note ${/tap Listen|Tap Listen/i.test(text)}`);
    if (!(await record(s.page, 8, "Use this recording"))) { console.log(`tutor voice message: this engine cannot record; the app says so true`); return; }
    await s.page.waitForTimeout(15000);
    const typed = await s.page.locator("textarea").first().inputValue();
    console.log(`tutor voice message: written into the box ${typed.trim().length > 0}; French heard ${/marché|famille|café/i.test(typed)}`);
  });
  console.log(`layout: scrollWidth ${await s.page.evaluate(() => document.documentElement.scrollWidth)} at ${devices["iPhone 15"].viewport.width} px; console errors ${s.errors.length}${s.errors.length ? `: ${s.errors.slice(0, 3).join(" | ")}` : ""}`);
} finally { await s.browser.close(); }

const r = await open(true);
try {
  await step("microphone refused", async () => {
    await r.page.goto(`${APP}/learner`);
    await r.page.waitForTimeout(8000);
    const button = r.page.getByRole("button", { name: "Record your answer" }).first();
    await button.scrollIntoViewIfNeeded();
    await button.click({ timeout: 15000 });
    await r.page.waitForTimeout(3000);
    const text = await bodyText(r.page);
    console.log(`microphone refused: blocked message ${text.includes("The microphone is blocked")}; or this engine's cannot-record message ${text.includes(CANNOT_RECORD)}; an error shown ${/something went wrong/i.test(text)}; console errors ${r.errors.length}`);
  });
} finally { await r.browser.close(); }
