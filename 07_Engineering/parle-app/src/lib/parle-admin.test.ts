import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminRequestError, adminErrorKey, safeAccountsOverview, safeUserDetail } from "./parle-admin";
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
