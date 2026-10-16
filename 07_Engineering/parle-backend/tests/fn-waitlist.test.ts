import { describe, it, expect, beforeEach } from "bun:test";
import { mailHeaders, mailsTo } from "./helpers/mailpit";
import { adminCall, adminUser, joinWaitlist, psql, resetWaitlist, runWaitlistJobs, waitlistRows } from "./helpers/admin";

const PARA = "Thank you for waiting with us. I built Parle for people like you, and I would love to hear what you think.";
const ADDRESS = "Parle, 100 Example Street, Toronto ON M5V 0A1, Canada";
const addr = (tag: string) => `${tag}-${crypto.randomUUID().slice(0, 8)}@example.test`;
/** The job may also run from the local pg_cron; drain until nothing is queued, then judge the final state. */
async function drain() {
  for (let i = 0; i < 10 && psql("select count(*) from public.waitlist_send where status = 'queued'") !== "0"; i++) await runWaitlistJobs();
}
async function ready(token: string) {
  expect((await adminCall(token, "admin_waitlist_save_address", { address: ADDRESS })).status).toBe(200);
  await adminCall(token, "admin_waitlist_save_blanks", { campaign: "founding_tutor", blanks: { personal_paragraph: PARA } });
  await adminCall(token, "admin_waitlist_save_blanks", { campaign: "launch", blanks: { launch_date: "Monday, November 2", personal_paragraph: PARA } });
}

describe("the waitlist emails (spec 4.3, 4.4)", () => {
  beforeEach(() => resetWaitlist());

  it("sends each campaign once, with the unsubscribe link and headers; Send again queues nothing new", async () => {
    const admin = await adminUser();
    const tutorAddress = addr("tutor"), learnerAddress = addr("learner");
    await joinWaitlist(tutorAddress, "tutor");
    await joinWaitlist(learnerAddress, "learner", "immigration");
    await ready(admin.token);
    const since = new Date(Date.now() - 2000).toISOString();
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "founding_tutor", confirm: "SEND" })).body.queued).toBe(1);
    await drain();
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "founding_tutor", confirm: "SEND" })).body.queued).toBe(0);
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" })).body.queued).toBe(2);
    await drain();
    expect((await mailsTo(tutorAddress, since)).map((m) => m.subject).sort()).toEqual(["Become a founding tutor on Parle", "Parle is open"]);
    expect((await mailsTo(learnerAddress, since)).map((m) => m.subject)).toEqual(["Parle is open"]);
    const h = await mailHeaders(learnerAddress, since);
    expect(h["List-Unsubscribe"][0]).toContain("/functions/v1/parle-waitlist-unsubscribe?t=");
    expect(h["List-Unsubscribe"][0]).toContain("<mailto:unsubscribe@parle.buzz?subject=unsubscribe>");
    expect(h["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
    const o = (await adminCall(admin.token, "admin_waitlist_overview")).body;
    expect(o).toMatchObject({ learners: 1, tutors: 1, unsubscribed: 0, postal_address: ADDRESS });
    expect(o.campaigns.founding_tutor).toMatchObject({ queued: 0, sent: 1, failed: 0 });
    expect(o.campaigns.launch).toMatchObject({ queued: 0, sent: 2, failed: 0 });
    expect(o.campaigns.launch.finished_at).not.toBeNull();
    expect(psql(`select count(*) from public.admin_audit_log where actor_user_id = '${admin.id}' and action = 'waitlist.campaign_started'`)).toBe("3");
  }, 90000);

  it("Send needs the postal address, typed SEND and the blanks; Send test works without them", async () => {
    const admin = await adminUser();
    await joinWaitlist(addr("someone"));
    const since = new Date(Date.now() - 2000).toISOString();
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "send" })).body.error_code).toBe("CONFIRMATION_REQUIRED");
    await adminCall(admin.token, "admin_waitlist_save_blanks", { campaign: "launch", blanks: { launch_date: "Monday, November 2", personal_paragraph: PARA } });
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" })).body.error_code).toBe("ADDRESS_REQUIRED");
    await adminCall(admin.token, "admin_waitlist_save_address", { address: ADDRESS });
    await adminCall(admin.token, "admin_waitlist_save_blanks", { campaign: "launch", blanks: { launch_date: "", personal_paragraph: PARA } });
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" })).body.error_code).toBe("LAUNCH_DATE_INVALID");
    expect(waitlistRows("launch")).toEqual([]);
    psql("delete from public.app_setting where key = 'sender_postal_address'");
    const test = await adminCall(admin.token, "admin_waitlist_send_test", { campaign: "launch", blanks: {} });
    expect(test.body.sent_to).toBe(admin.email);
    expect((await mailsTo(admin.email, since)).map((m) => m.subject)).toEqual(["TEST: Parle is open"]);
    const preview = await adminCall(admin.token, "admin_waitlist_preview", { campaign: "founding_tutor", blanks: { personal_paragraph: PARA } });
    expect(preview.body.subject).toBe("Become a founding tutor on Parle");
    expect(preview.body.html).toContain(PARA);
    expect((await adminCall(admin.token, "admin_waitlist_save_address", { address: "short" })).body.error_code).toBe("ADDRESS_INVALID");
  }, 60000);

  it("an unsubscribe between queueing and sending skips that person (spec 4.4)", async () => {
    const admin = await adminUser();
    const stays = addr("stays"), leaves = addr("leaves");
    await joinWaitlist(stays);
    await joinWaitlist(leaves);
    await ready(admin.token);
    const since = new Date(Date.now() - 2000).toISOString();
    await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    expect((await adminCall(admin.token, "admin_waitlist_mark_unsubscribed", { email: leaves.toUpperCase() })).body.result).toBe("recorded");
    await drain();
    expect((await mailsTo(leaves, since)).length).toBe(0);
    expect((await mailsTo(stays, since)).length).toBe(1);
    expect(waitlistRows("launch").find((r) => r.email === leaves)?.status).toBe("skipped_unsubscribed");
  }, 60000);

  it("two runs at once send each person once (Review Focus 2)", async () => {
    const admin = await adminUser();
    const people = [addr("a"), addr("b"), addr("c"), addr("d"), addr("e")];
    for (const p of people) await joinWaitlist(p);
    await ready(admin.token);
    const since = new Date(Date.now() - 2000).toISOString();
    await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    await Promise.all([runWaitlistJobs(), runWaitlistJobs(), runWaitlistJobs()]);
    await drain();
    for (const p of people) expect((await mailsTo(p, since)).length).toBe(1);
    expect(waitlistRows("launch").every((r) => r.status === "sent")).toBe(true);
  }, 90000);

  it("an address listed twice gets one email (Review Focus 3)", async () => {
    const admin = await adminUser();
    const base = addr("ben");
    // production keeps one row per address and role: the same person in two spellings, as a learner and as a tutor
    psql(`insert into public.waitlist_signup (email, role) values ('${base.toUpperCase()}', 'learner'), ('${base}', 'tutor')`);
    await ready(admin.token);
    const since = new Date(Date.now() - 2000).toISOString();
    expect((await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" })).body.queued).toBe(1);
    await drain();
    expect((await mailsTo(base, since)).length).toBe(1);
  }, 60000);

  it("failures show their reason; Retry failed sends them once", async () => {
    const admin = await adminUser();
    const person = addr("retry");
    await joinWaitlist(person);
    await ready(admin.token);
    await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    psql(`update public.waitlist_send set status = 'failed', error = 'The address was refused by the mail service (422).' where email = '${person}'`);
    const o = (await adminCall(admin.token, "admin_waitlist_overview")).body;
    expect(o.failures[0]).toMatchObject({ campaign: "launch", email: person, error: "The address was refused by the mail service (422)." });
    const since = new Date(Date.now() - 2000).toISOString();
    expect((await adminCall(admin.token, "admin_waitlist_retry_failed", { campaign: "launch" })).body.queued).toBe(1);
    await drain();
    expect((await mailsTo(person, since)).length).toBe(1);
  }, 60000);

  it("nothing is sent while the postal address is empty; the queue waits", async () => {
    const admin = await adminUser();
    const person = addr("wait");
    await joinWaitlist(person);
    await ready(admin.token);
    await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    psql("delete from public.app_setting where key = 'sender_postal_address'");
    expect((await runWaitlistJobs()).body.stopped).toBe("address_missing");
    expect(waitlistRows("launch")).toEqual([{ email: person, status: "queued" }]);
    expect((await adminCall(admin.token, "admin_waitlist_overview")).body.campaigns.launch.last_error).toContain("postal address");
  }, 30000);

  it("only an owner deletes the list, only after the launch email, and unsubscribes are kept (spec 4.6)", async () => {
    const admin = await adminUser();
    const owner = await adminUser({ owner: true });
    await joinWaitlist(addr("x"));
    await joinWaitlist(addr("y"));
    await adminCall(admin.token, "admin_waitlist_mark_unsubscribed", { email: "gone@example.test" });
    expect((await adminCall(admin.token, "admin_waitlist_delete", { confirm: "DELETE" })).body.error_code).toBe("OWNER_REQUIRED");
    expect((await adminCall(owner.token, "admin_waitlist_delete", { confirm: "DELETE" })).body.error_code).toBe("LAUNCH_NOT_FINISHED");
    await ready(admin.token);
    await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    await drain();
    expect((await adminCall(owner.token, "admin_waitlist_delete", { confirm: "delete" })).body.error_code).toBe("CONFIRMATION_REQUIRED");
    const d = await adminCall(owner.token, "admin_waitlist_delete", { confirm: "DELETE" });
    expect(d.body).toMatchObject({ signups: 2, send_records_cleared: 2 });
    expect(psql("select count(*) from public.waitlist_signup")).toBe("0");
    expect(psql("select count(*) from public.waitlist_unsubscribe where email = 'gone@example.test'")).toBe("1");
    expect((await adminCall(admin.token, "admin_waitlist_overview")).body.campaigns.launch.sent).toBe(2);
  }, 90000);
});
