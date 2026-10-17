import { chat, fn, newLearner, removeLearner } from "./check-learners";

/**
 * Plan 6 checks on production through the API: A28 (first Today and each task's content), A29 (explanations in
 * Arabic, Spanish, Hindi and, since Plan 11, Persian). Fresh AgentMail learners, deleted at the end; outcomes only.
 * usage: bun scripts/prod/plan6-checks.ts <first-today|explanations>
 */
const seconds = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1);

const checks: Record<string, () => Promise<void>> = {
  "first-today": async () => {
    const l = await newLearner("a28", "A2");
    try {
      const t0 = Date.now();
      const r = await fn("parle-plan-service", l.token, { action: "get_or_create_plan", options: { includeTaskHistory: true } });
      const tasks: any[] = r.body.result?.tasks ?? [];
      const today: string = r.body.result?.today ?? "";
      const pending = tasks.filter((x) => x.contentSource === "pending");
      console.log(`A28 first Today: ${r.status} in ${seconds(t0)} s; ${tasks.length} tasks; ${pending.length} pending`);
      const order = [...pending].sort((a, b) => (a.dateLocal === today ? 0 : 1) - (b.dateLocal === today ? 0 : 1) || a.dateLocal.localeCompare(b.dateLocal));
      for (const task of order) {
        const t1 = Date.now();
        const p = await fn("parle-plan-service", l.token, { action: "prepare_task_content", task_id: task.id });
        console.log(`A28 prepare ${task.type} (${task.dateLocal === today ? "today" : task.dateLocal}): ${p.status} ${p.body.result?.contentSource ?? p.body.error_code} in ${seconds(t1)} s`);
      }
      const t2 = Date.now();
      const again = await fn("parle-plan-service", l.token, { action: "get_or_create_plan", options: { includeTaskHistory: true } });
      const left = (again.body.result?.tasks ?? []).filter((x: any) => x.contentSource === "pending").length;
      console.log(`A28 second open: ${again.status} in ${seconds(t2)} s; pending left ${left}`);
    } finally { await removeLearner(l); }
  },
  explanations: async () => {
    const question = "Quelle est la différence entre « depuis » et « pendant » ?";
    for (const [tag, language] of [["ar", "Arabic"], ["es", "Spanish"], ["hi", "Hindi"], ["fa", "Persian"]] as const) {
      const l = await newLearner(`a29${tag}`, "A2", language, true);
      try {
        const [reply] = await chat(l, "question", [question]);
        const latin = (reply.match(/[A-Za-z\u00C0-\u00FF]/g) ?? []).length;
        const nativeLetters = language === "Arabic" || language === "Persian" ? (reply.match(/[\u0600-\u06FF]/g) ?? []).length : language === "Hindi" ? (reply.match(/[\u0900-\u097F]/g) ?? []).length : 0;
        const spanishMarkers = (reply.match(/[ñ¿¡áíóú]|\b(porque|también|significa|ejemplo|para|pero|cuando|está|muy|usamos)\b/gi) ?? []).length;
        const measure = language === "Spanish"
          ? `Spanish markers ${spanishMarkers}`
          : `${language} letters ${nativeLetters} (${Math.round((100 * nativeLetters) / Math.max(1, nativeLetters + latin))} % of letters)`;
        console.log(`A29 A2 ${language}: ${reply.length} chars; ${measure}\n${reply}\n---`);
      } finally { await removeLearner(l); }
    }
  },
};

const which = process.argv[2] ?? "";
if (!checks[which]) throw new Error(`usage: bun scripts/prod/plan6-checks.ts <${Object.keys(checks).join("|")}>`);
await checks[which]();
