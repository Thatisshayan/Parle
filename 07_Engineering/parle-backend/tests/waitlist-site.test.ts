import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

const SITE = `${import.meta.dir}/../../parle-waitlist`;

describe("parle.buzz waitlist site (Plan 8)", () => {
  it("posts signups through the bounded function with the consent and honeypot fields", () => {
    const page = readFileSync(`${SITE}/index.html`, "utf8");
    expect(page).toContain("/functions/v1/parle-waitlist-join");
    expect(page).not.toContain("/rest/v1/rpc/join_waitlist");
    expect(page).toContain("consent: true");
    expect(page).toContain("website: form.website.value");
  });
  it("the unsubscribe page posts the token to the function and shows the address as text, never as HTML", () => {
    const page = readFileSync(`${SITE}/unsubscribe.html`, "utf8");
    expect(page).toContain("https://hcphvipeplkfenugikrf.supabase.co/functions/v1/parle-waitlist-unsubscribe");
    expect(page).toContain("You're unsubscribed.");
    expect(page).toContain("You won't get any more Parle emails at ");
    expect(page).not.toContain("innerHTML");
    expect(page).not.toContain("fonts.googleapis.com"); // the token is in the address; no third party sees the page
    expect(page).toContain('<meta name="robots" content="noindex">');
  });
  it("the privacy page names the second email for tutors, the sending service and the kept unsubscribes", () => {
    const page = readFileSync(`${SITE}/privacy.html`, "utf8");
    expect(page).toContain("one email before Parle opens about becoming a founding tutor");
    expect(page).toContain("Resend");
    expect(page).toContain("do-not-email list");
    expect(page).not.toContain("\u2014");
  });
});

/** Runs the unsubscribe page's script against a stand-in page: element ids, the address bar and fetch. */
function runUnsubscribePage(search: string, answer: { status: number; body: unknown } | "offline") {
  const page = readFileSync(`${SITE}/unsubscribe.html`, "utf8");
  const script = page.match(/<script>([\s\S]*?)<\/script>/)![1];
  const el = () => ({ textContent: "", hidden: true, disabled: false, on: {} as Record<string, () => void>, addEventListener(type: string, f: () => void) { this.on[type] = f; } });
  const els: Record<string, ReturnType<typeof el>> = { title: el(), body: el(), confirm: el() };
  const calls: unknown[] = [];
  const fetchStub = (...a: unknown[]) => {
    calls.push(a);
    if (answer === "offline") return Promise.reject(new TypeError("offline"));
    return Promise.resolve({ status: answer.status, ok: answer.status < 300, json: async () => answer.body });
  };
  new Function("document", "location", "fetch", "URLSearchParams", script)({ getElementById: (id: string) => els[id] }, { search }, fetchStub, URLSearchParams);
  return { els, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the unsubscribe page asks first (Plan 11: A78, R86)", () => {
  it("posts nothing when opened, only after the button is pressed", async () => {
    const { els, calls } = runUnsubscribePage("?t=abc.def", { status: 200, body: { email: "a@x.test" } });
    expect(calls.length).toBe(0);
    expect(els.confirm.hidden).toBe(false);
    els.confirm.on.click(); await tick(); await tick();
    expect(calls.length).toBe(1);
    expect(els.title.textContent).toBe("You're unsubscribed.");
  });
  it("says what went wrong: too many tries, our side, a bad link, offline", async () => {
    for (const [answer, heading] of [[{ status: 429, body: {} }, "Too many tries"], [{ status: 500, body: {} }, "Something went wrong on our side"], [{ status: 400, body: {} }, "This link is not valid"], ["offline", "We could not reach Parle"]] as const) {
      const { els } = runUnsubscribePage("?t=abc.def", answer as any);
      els.confirm.on.click(); await tick(); await tick();
      expect(els.title.textContent).toBe(heading);
    }
  });
  it("a link without its token says so, with no button", () => {
    const { els, calls } = runUnsubscribePage("", { status: 200, body: {} });
    expect(els.title.textContent).toBe("This link is not complete");
    expect(els.confirm.hidden).toBe(true);
    expect(calls.length).toBe(0);
  });
});

describe("www.parle.buzz (Plan 11: A85, R93)", () => {
  it("redirects to parle.buzz, keeping the path and the link's token", () => {
    const cfg = JSON.parse(readFileSync(`${SITE}/vercel.json`, "utf8"));
    expect(cfg.redirects).toContainEqual({ source: "/:path*", has: [{ type: "host", value: "www.parle.buzz" }], destination: "https://parle.buzz/:path*", permanent: true });
  });
});
