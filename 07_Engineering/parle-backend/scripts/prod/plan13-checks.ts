import { PROD_URL, anonKey, fn, newLearner, removeLearner } from "./check-learners";

/**
 * Plan 13 checks on production (demo bank) with an AgentMail check learner, deleted at the end. Outcomes only:
 * a placement listening question carries no transcript and an audio address or the Listen path; the answer feedback
 * carries neither transcript nor explanation; skipping a listening question is unscored; the public level check's state.
 * usage: bun scripts/prod/plan13-checks.ts
 */
const l = await newLearner("p13", "A2", "English", false, "p13");
try {
  const open = (await fn("parle-plan-service", l.token, { action: "placement_open" })).body.result;
  console.log(`placement opened: ${open?.screen}; prompts ${open?.prompts?.length}`);
  const q1 = (await fn("parle-plan-service", l.token, { action: "placement_question", runId: open.runId, section: "listening" })).body.result.question;
  console.log(`listening question: transcript sent ${"transcript" in q1}; audio address ${q1.audio_url ? "prepared" : "none (Listen makes it)"}`);
  const answered = (await fn("parle-plan-service", l.token, { action: "placement_answer", runId: open.runId, optionId: q1.options[0].id })).body.result;
  console.log(`answer feedback: transcript ${"transcript" in (answered?.item ?? {})}; explanation ${"explanation" in (answered?.item ?? {})}`);
  const q2 = (await fn("parle-plan-service", l.token, { action: "placement_question", runId: open.runId, section: "listening" })).body.result.question;
  const skipped = await fn("parle-plan-service", l.token, { action: "placement_skip_question", runId: open.runId });
  const q3 = (await fn("parle-plan-service", l.token, { action: "placement_question", runId: open.runId, section: "listening" })).body.result.question;
  console.log(`skip: ${skipped.status}, section ended ${skipped.body.result?.completed}; next question differs ${q3?.id !== q2?.id}`);
  const r = await fetch(`${PROD_URL}/functions/v1/parle-public-level-check`, { method: "POST", headers: { apikey: await anonKey(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
  const body = (await r.json().catch(() => ({}))) as any;
  const listening = (body.questions ?? []).filter((q: any) => q.skill === "listening");
  console.log(`public level check: ${r.status} ${body.error ?? ""}; listening questions ${listening.length}; any transcript ${listening.some((q: any) => "transcript" in q)}`);
} finally {
  await removeLearner(l);
  console.log("clean-up: check learner deleted");
}
