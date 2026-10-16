/**
 * The two waitlist emails (spec 4.2), pure. English only, plain and warm, no em dashes. Wording approved by the
 * founder (Plan 8 Task 7 Step 9). Blanks: the launch date and one personal paragraph, filled on the Waitlist page.
 */
export type Campaign = "founding_tutor" | "launch";
export const CAMPAIGNS: readonly Campaign[] = ["founding_tutor", "launch"];
export const isCampaign = (v: unknown): v is Campaign => v === "founding_tutor" || v === "launch";
export type Blanks = { launch_date?: string; personal_paragraph?: string };
export type Recipient = { email: string; role: string; goal: string; joinedOn: string | null };
export type CopyContext = {
  appUrl: string; unsubscribeUrl: string; postalAddress: string;
  foundingCommissionPercent: number; commissionPercent: number; test: boolean;
};

type Block = { kind: "p"; text: string } | { kind: "list"; items: string[] } | { kind: "button"; text: string; href: string } | { kind: "personal"; text: string };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** null when the blanks are fine. A real Send needs both (launch) or the paragraph (founding tutor); a test send allows gaps. */
export function blanksProblem(campaign: Campaign, b: Blanks, forSend: boolean): "LAUNCH_DATE_INVALID" | "PARAGRAPH_TOO_LONG" | "PARAGRAPH_REQUIRED" | null {
  const date = (b.launch_date ?? "").trim(), para = (b.personal_paragraph ?? "").trim();
  if (campaign === "launch" && (forSend || date) && (date.length < 3 || date.length > 60)) return "LAUNCH_DATE_INVALID";
  if (para.length > 1500) return "PARAGRAPH_TOO_LONG";
  if (forSend && para.length < 20) return "PARAGRAPH_REQUIRED";
  return null;
}

const GOAL_LINE: Record<string, string> = {
  immigration: "You told us you are preparing for Canadian immigration.",
  citizenship: "You told us you are preparing for Canadian citizenship.",
  work: "You told us you want French for work.",
  conversation: "You told us you want French for everyday conversation.",
  travel: "You told us you want French for travel.",
};
const TOWARD: Record<string, string> = {
  immigration: "toward your TEF Canada or TCF Canada target",
  citizenship: "toward the level you need for citizenship",
};

function blocksFor(campaign: Campaign, b: Blanks, r: Recipient, c: CopyContext): { subject: string; blocks: Block[] } {
  const personal = (b.personal_paragraph ?? "").trim() || (c.test ? "[your personal paragraph]" : "");
  const tail: Block[] = [...(personal ? [{ kind: "personal" as const, text: personal }] : [])];
  if (campaign === "founding_tutor") {
    const founding = c.foundingCommissionPercent, usual = c.commissionPercent;
    return {
      subject: "Become a founding tutor on Parle",
      blocks: [
        { kind: "p", text: "Hi," },
        { kind: "p", text: "Thank you for signing up to teach French on Parle. We are getting ready to open, and we would love you to be one of our first tutors." },
        { kind: "p", text: "As a founding tutor:" },
        { kind: "list", items: [
          `For your first 6 months, Parle's commission is ${founding}% instead of the usual ${usual}%, so you keep ${100 - founding}% of every lesson.`,
          "Your profile shows a founding tutor badge.",
        ] },
        { kind: "p", text: "To set up your profile, have these ready:" },
        { kind: "list", items: [
          "Your hourly rate in US dollars.",
          "The times you can teach each week.",
          "A short introduction: who you are and how you teach.",
          "A payout account with Stripe, where your earnings are sent. Until Parle opens, payouts run in Stripe's test mode, so no real money moves yet.",
        ] },
        { kind: "button", text: "Create your tutor account", href: `${c.appUrl}/signup?role=tutor` },
        ...tail,
        { kind: "p", text: "Questions? Reply to this email or write to tutors@parle.buzz." },
        { kind: "p", text: "The Parle team" },
      ],
    };
  }
  const date = (b.launch_date ?? "").trim() || (c.test ? "[launch date]" : "");
  const opening: Block = { kind: "p", text: `Parle is open as of ${date}. Thank you for waiting with us.` };
  if (r.role === "tutor") {
    return {
      subject: "Parle is open",
      blocks: [
        { kind: "p", text: "Hi," }, opening,
        { kind: "p", text: "Your tutor listing is ready to set up. Add your hourly rate, the times you can teach and a short introduction, and connect your payout account with Stripe. Once our team approves your profile, learners can find and book you." },
        { kind: "button", text: "Start now", href: `${c.appUrl}/signup?role=tutor` },
        ...tail,
        { kind: "p", text: "The Parle team" },
      ],
    };
  }
  const goalLine = GOAL_LINE[r.goal] ? `${GOAL_LINE[r.goal]} ` : "";
  return {
    subject: "Parle is open",
    blocks: [
      { kind: "p", text: "Hi," }, opening,
      { kind: "p", text: `${goalLine}Parle starts with a placement test in listening, reading, writing and speaking, then builds a weekly plan ${TOWARD[r.goal] ?? "around the time you have"}.` },
      { kind: "p", text: "Between sessions you can practise with an AI tutor that explains in your own language, and when you want a real conversation, you can book a lesson with a vetted human tutor." },
      { kind: "p", text: "Parle's levels are practice estimates, not official test results." },
      { kind: "button", text: "Start now", href: `${c.appUrl}/signup` },
      ...tail,
      { kind: "p", text: "The Parle team" },
    ],
  };
}

function joinedLine(r: Recipient): string {
  const day = r.joinedOn && /^\d{4}-\d{2}-\d{2}$/.test(r.joinedOn)
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.joinedOn}T12:00:00Z`))
    : "";
  return day ? `You are receiving this email because you joined the Parle waitlist at parle.buzz on ${day}.` : "You are receiving this email because you joined the Parle waitlist at parle.buzz.";
}

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function htmlBlock(block: Block): string {
  if (block.kind === "p") return `<p>${esc(block.text)}</p>`;
  if (block.kind === "list") return `<ul>${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  if (block.kind === "button") return `<p><a href="${esc(block.href)}" style="display:inline-block;background:#1E3A8A;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(block.text)}</a></p>`;
  return paragraphs(block.text).map((p) => `<p>${p.split("\n").map(esc).join("<br>")}</p>`).join("");
}

function textBlock(block: Block): string {
  if (block.kind === "p") return block.text;
  if (block.kind === "list") return block.items.map((i) => `- ${i}`).join("\n");
  if (block.kind === "button") return `${block.text}: ${block.href}`;
  return paragraphs(block.text).join("\n\n");
}

/** One person's email: HTML and plain text, with the footer the law asks for (why, who and where, unsubscribe). */
export function renderWaitlistMail(campaign: Campaign, blanks: Blanks, r: Recipient, c: CopyContext): { subject: string; html: string; text: string } {
  const { subject, blocks } = blocksFor(campaign, blanks, r, c);
  const address = c.postalAddress.trim() || (c.test ? "[the sender's postal address, not set yet]" : "");
  const footer = [joinedLine(r), `Parle, ${address}. Contact: hello@parle.buzz`];
  const banner = c.test ? '<p style="background:#FFF8E9;color:#805916;padding:8px 12px;border-radius:8px">TEST: this is how the email will look. Real recipients get their own unsubscribe link.</p>' : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1E3A8A">${banner}${blocks.map(htmlBlock).join("")}`
    + `<hr style="border:none;border-top:1px solid #E4DFD3;margin:24px 0 12px"><p style="color:#6B7280;font-size:12px;line-height:1.5">${footer.map(esc).join("<br>")}`
    + `<br>Do not want these emails? <a href="${esc(c.unsubscribeUrl)}">Unsubscribe</a> with one click.</p></div>`;
  const text = [...(c.test ? ["TEST: this is how the email will look. Real recipients get their own unsubscribe link."] : []), ...blocks.map(textBlock), "--", ...footer, `Unsubscribe: ${c.unsubscribeUrl}`].join("\n\n");
  return { subject: c.test ? `TEST: ${subject}` : subject, html, text };
}
