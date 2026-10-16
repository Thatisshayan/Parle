import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

const SITE = `${import.meta.dir}/../../parle-waitlist`;

describe("parle.buzz waitlist site (Plan 8)", () => {
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
