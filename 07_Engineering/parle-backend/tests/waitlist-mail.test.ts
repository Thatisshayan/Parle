import { describe, it, expect } from "bun:test";
import { blanksProblem, renderWaitlistMail, type CopyContext, type Recipient } from "../supabase/functions/_shared/waitlist/copy";
import { emailFromToken, unsubscribeToken } from "../supabase/functions/_shared/waitlist/token";

const SECRET = "s".repeat(64);
const ctx = (over: Partial<CopyContext> = {}): CopyContext => ({
  appUrl: "https://parle.buzz", unsubscribeUrl: "https://parle.buzz/unsubscribe?t=abc", postalAddress: "Parle, 100 Example Street, Toronto ON M5V 0A1, Canada",
  foundingCommissionPercent: 10, commissionPercent: 20, test: false, ...over,
});
const tutor: Recipient = { email: "t@example.test", role: "tutor", goal: "", joinedOn: "2026-10-14" };
const learnerImm: Recipient = { email: "l@example.test", role: "learner", goal: "immigration", joinedOn: "2026-10-20" };
const PARA = "I started Parle because learning French for Canada felt lonely. I hope it helps you.";

describe("the founding-tutor email (spec 4.2)", () => {
  it("has the founding terms, what to prepare, the sign-up link, the personal paragraph and the legal footer", () => {
    const m = renderWaitlistMail("founding_tutor", { personal_paragraph: PARA }, tutor, ctx());
    expect(m.subject).toBe("Become a founding tutor on Parle");
    for (const part of ["10%", "20%", "keep 90%", "founding tutor badge", "hourly rate in Canadian dollars (CAD)", "Stripe's test mode", PARA,
      'href="https://parle.buzz/signup?role=tutor"', "joined the Parle waitlist at parle.buzz on October 14, 2026", "100 Example Street",
      'href="https://parle.buzz/unsubscribe?t=abc"', "tutors@parle.buzz"]) expect(m.html).toContain(part);
    expect(m.text).toContain("Unsubscribe: https://parle.buzz/unsubscribe?t=abc");
    expect(m.html + m.text + m.subject).not.toContain("\u2014");
  });
});

describe("the launch email (spec 4.2)", () => {
  it("learners: open date, a line for their goal, Start now, honest levels; tutors: their listing", () => {
    const l = renderWaitlistMail("launch", { launch_date: "Monday, November 2", personal_paragraph: PARA }, learnerImm, ctx());
    expect(l.subject).toBe("Parle is open");
    for (const part of ["Parle is open as of Monday, November 2.", "Canadian immigration", "TEF Canada or TCF Canada", "AI tutor", "vetted human tutor",
      "practice estimates, not official test results", 'href="https://parle.buzz/signup"', "on October 20, 2026"]) expect(l.html).toContain(part);
    const general = renderWaitlistMail("launch", { launch_date: "Monday, November 2", personal_paragraph: PARA }, { ...learnerImm, goal: "" }, ctx());
    expect(general.html).toContain("around the time you have");
    const t = renderWaitlistMail("launch", { launch_date: "Monday, November 2", personal_paragraph: PARA }, tutor, ctx());
    expect(t.html).toContain("Your tutor listing is ready to set up");
    expect(t.html).toContain('href="https://parle.buzz/signup?role=tutor"');
    for (const m of [l, general, t]) expect(m.html + m.text).not.toContain("\u2014");
  });

  it("the personal paragraph is shown as typed, never as HTML (Review Focus 5)", () => {
    const m = renderWaitlistMail("launch", { launch_date: "<script>x</script>", personal_paragraph: 'Line <b>one</b> & "two"\nsame paragraph\n\nSecond paragraph' }, learnerImm, ctx());
    expect(m.html).toContain("Line &lt;b&gt;one&lt;/b&gt; &amp; &quot;two&quot;<br>same paragraph");
    expect(m.html).toContain("<p>Second paragraph</p>");
    expect(m.html).not.toContain("<b>one</b>");
    expect(m.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(m.text).toContain('Line <b>one</b> & "two"');
  });

  it("a test send is marked TEST and shows what is still missing", () => {
    const m = renderWaitlistMail("launch", {}, learnerImm, ctx({ test: true, postalAddress: "" }));
    expect(m.subject).toBe("TEST: Parle is open");
    expect(m.html).toContain("TEST: this is how the email will look.");
    expect(m.html).toContain("[launch date]");
    expect(m.html).toContain("[your personal paragraph]");
    expect(m.html).toContain("[the sender's postal address, not set yet]");
  });

  it("blanks are checked before Send; a test send allows gaps", () => {
    expect(blanksProblem("launch", {}, true)).toBe("LAUNCH_DATE_INVALID");
    expect(blanksProblem("launch", { launch_date: "Nov 2" }, true)).toBe("PARAGRAPH_REQUIRED");
    expect(blanksProblem("launch", { launch_date: "Nov 2", personal_paragraph: PARA }, true)).toBeNull();
    expect(blanksProblem("founding_tutor", { personal_paragraph: PARA }, true)).toBeNull();
    expect(blanksProblem("founding_tutor", { personal_paragraph: "x".repeat(1501) }, false)).toBe("PARAGRAPH_TOO_LONG");
    expect(blanksProblem("launch", {}, false)).toBeNull();
  });
});

describe("unsubscribe tokens (spec 4.5)", () => {
  it("round-trip one address in any case; a forged or damaged token gives nothing", async () => {
    const token = await unsubscribeToken(SECRET, " Ana@Example.TEST ");
    expect(await emailFromToken(SECRET, token)).toBe("ana@example.test");
    expect(await emailFromToken("t".repeat(64), token)).toBeNull();
    const [, sig] = token.split(".");
    const other = btoa("bob@example.test").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await emailFromToken(SECRET, `${other}.${sig}`)).toBeNull();
    expect(await emailFromToken(SECRET, "garbage")).toBeNull();
    expect(await emailFromToken(SECRET, `${token}.x`)).toBeNull();
    await expect(unsubscribeToken("", "a@example.test")).rejects.toThrow();
  });
});
