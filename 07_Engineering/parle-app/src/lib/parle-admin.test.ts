import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminRequestError, adminErrorKey, safeAccountsOverview, safeBankStatus, safeMetrics, safeUserDetail, safeWaitlist, sendBlock } from "./parle-admin";
import { t } from "./i18n";

describe("admin client (Plan 8)", () => {
  it("turns server codes into translated messages; unknown codes get the general one", () => {
    assert.equal(adminErrorKey(new AdminRequestError("OWNER_REQUIRED")), "adminErrors.OWNER_REQUIRED");
    assert.equal(adminErrorKey(new AdminRequestError("SOMETHING_NEW")), "adminErrors.REQUEST_FAILED");
    assert.equal(adminErrorKey(new Error("x")), "adminErrors.REQUEST_FAILED");
    for (const code of ["ADMIN_CANNOT_BE_PAUSED", "CANNOT_REMOVE_SELF", "OWNER_CANNOT_BE_REMOVED", "ADDRESS_REQUIRED", "LAUNCH_NOT_FINISHED", "BLANKS_LOCKED"]) {
      assert.notEqual(t(adminErrorKey(new AdminRequestError(code))), t("adminErrors.REQUEST_FAILED"), code);
    }
  });
  it("keeps only well-formed administrators and paused entries", () => {
    const o = safeAccountsOverview({ me: { id: "a1", owner: true }, admins: [{ id: "a1", email: "o@x.test", owner: true, admin_since: "2026-10-01T00:00:00.000Z", since_known: false }, { email: "no-id@x.test" }], paused: { u1: { reason: "Spam", changed_by: "o@x.test", changed_at: "2026-10-16T00:00:00.000Z" }, u2: "bad" } });
    assert.deepEqual(o.me, { id: "a1", owner: true });
    assert.equal(o.admins.length, 1);
    assert.deepEqual(Object.keys(o.paused), ["u1"]);
  });
  it("reads a user detail; refuses one without an account", () => {
    assert.equal(safeUserDetail({}), null);
    const d = safeUserDetail({
      account: { id: "u1", email: "l@x.test", name: "Ana", role: "learner", owner: false, status: "disabled", paused: { reason: "Spam", by: "o@x.test", at: "2026-10-16T00:00:00.000Z", lessons_choice: "keep" }, signed_up_at: "2026-10-01T00:00:00.000Z", last_sign_in_at: null, email_verified: true },
      learner: { goal: "canada_immigration", track: "immigration", plan: { name: "Premium", source: "stripe", renews_at: "2026-12-01T00:00:00.000Z", ends_at: null, stripe_customer_url: "https://dashboard.stripe.com/test/customers/cus_1" }, levels: { reading: 6, cooking: 3 }, this_week: { week_start: "2026-10-12", done: 1, planned: 3 }, ai_messages: { today: 3, this_month: 9 }, lessons: { upcoming: 1, past: 1, cancelled: 1, refunded_cents: 4000, items: [] } },
      tutor: null, recent_audit: [{ action: "account.disabled", by: "o@x.test", at: "2026-10-16T00:00:00.000Z", details: "{}" }],
    });
    assert.equal(d?.account.status, "disabled");
    assert.deepEqual(d?.learner?.levels, { reading: 6 });
    assert.equal(d?.learner?.plan.stripe_customer_url, "https://dashboard.stripe.com/test/customers/cus_1");
    const unsafe = safeUserDetail({ account: { id: "u1", role: "learner", status: "active" }, learner: { plan: { name: "Premium", stripe_customer_url: "javascript:alert(1)" } } });
    assert.equal(unsafe?.learner?.plan.stripe_customer_url, null);
  });
});

describe("metrics (D24)", () => {
  it("reads the server's numbers and refuses an answer without its sections", () => {
    assert.equal(safeMetrics({ lessons: {} }), null);
    const m = safeMetrics({
      range: { days: 30, from: "2026-09-16T00:00:00.000Z", to: "2026-10-16T00:00:00.000Z" },
      signups_by_week: [{ week: "2026-10-12", learners: 3, tutors: 1 }], active_learners_by_week: [{ week: "2026-10-12", learners: 2 }],
      premium: { paid: 1, complimentary: 2, started: 1, ended: 0 }, practice_completed: 9, checkins_submitted: 2, ai_messages: 40,
      lessons: { booked: 2, completed: 1, cancelled_by_learner: 1, cancelled_by_tutor: 0, cancelled_by_parle: 0, refunded_cents: 4000, revenue_cents: 4000, commission_cents: 800, booked_hours: "1.0" },
      tutor_hours: { offered: 30, booked: 1 },
      demand_supply: [{ band: "weekday_evening", learners: 1, tutor_hours_per_week: 2 }, { band: "bogus", learners: 9, tutor_hours_per_week: 9 }],
      tracks: [{ track: "immigration", specialty: "canada_immigration_tef_tcf", learners: 2, learner_weekly_hours: 1.5, tutors: 1, tutor_weekly_hours: 2, short_of_tutors: false }],
    });
    assert.equal(m?.lessons.booked_hours, 1);
    assert.deepEqual(m?.demand_supply.map((r) => r.band), ["weekday_evening"]);
    assert.equal(m?.tracks[0].track, "immigration");
  });
});

describe("the Waitlist page rules (spec 4.3)", () => {
  const base = {
    learners: 3, tutors: 1, unsubscribed: 0, postal_address: "Parle, 100 Example Street, Toronto ON M5V 0A1, Canada", app_url: "https://parle.buzz", app_url_public: true, me_owner: false, failures: [],
    campaigns: {
      founding_tutor: { blanks: { personal_paragraph: "x".repeat(25) }, started_at: null, finished_at: null, last_error: "", queued: 0, sent: 0, failed: 0, skipped: 0 },
      launch: { blanks: { launch_date: "Monday, November 2", personal_paragraph: "x".repeat(25) }, started_at: null, finished_at: null, last_error: "", queued: 0, sent: 0, failed: 0, skipped: 0 },
    },
  };
  it("Send is blocked without the address, with a blank missing, or while sending", () => {
    assert.equal(sendBlock(safeWaitlist(base), "launch"), null);
    assert.equal(sendBlock(safeWaitlist({ ...base, postal_address: "" }), "launch"), "adminWaitlist.block.address");
    assert.equal(sendBlock(safeWaitlist({ ...base, campaigns: { ...base.campaigns, launch: { ...base.campaigns.launch, blanks: { personal_paragraph: "x".repeat(25) } } } }), "launch"), "adminWaitlist.block.date");
    assert.equal(sendBlock(safeWaitlist({ ...base, campaigns: { ...base.campaigns, founding_tutor: { ...base.campaigns.founding_tutor, blanks: {} } } }), "founding_tutor"), "adminWaitlist.block.paragraph");
    assert.equal(sendBlock(safeWaitlist({ ...base, campaigns: { ...base.campaigns, launch: { ...base.campaigns.launch, queued: 4 } } }), "launch"), "adminWaitlist.block.sending");
    assert.equal(safeWaitlist({}).campaigns.launch.sent, 0);
  });
});

describe("the question bank switch (bank readers fix)", () => {
  it("reads the bank status safely, and anything unexpected as demo and not ready", () => {
    const status = safeBankStatus({ source: "real", demo: { ready: true, questions: { listening: { A1: 10 } }, prompts: {} }, real: { ready: false, questions: { listening: { A1: 3 } }, prompts: { speaking: { B2: 1 } } } });
    assert.equal(status.source, "real");
    assert.equal(status.real.ready, false);
    assert.equal(status.real.questions.listening.A1, 3);
    assert.equal(status.real.questions.reading.B2, 0);
    assert.equal(status.real.prompts.speaking.B2, 1);
    const odd = safeBankStatus({ source: "<script>", demo: null });
    assert.equal(odd.source, "demo");
    assert.equal(odd.demo.ready, false);
  });
});
