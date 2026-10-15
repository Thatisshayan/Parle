import type { LearnerTaskView } from "./learner-plan";

/** Open tasks still waiting for practice content, today's first, then by date (A28). */
export function pendingTaskIds(plan: { tasks: LearnerTaskView[]; today: string }): string[] {
  const rank = (task: LearnerTaskView) => (task.dateLocal === plan.today ? 0 : 1);
  return plan.tasks
    .filter((task) => task.contentSource === "pending" && (task.status === "planned" || task.status === "rolled"))
    .sort((a, b) => rank(a) - rank(b) || a.dateLocal.localeCompare(b.dateLocal))
    .map((task) => task.id);
}

/** Puts one prepared task's content back into the plan on screen; the card keeps the status the learner gave it. */
export function withPreparedTask<P extends { tasks: LearnerTaskView[] }>(plan: P, prepared: LearnerTaskView): P {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => (task.id === prepared.id
      ? { ...task, contentSource: prepared.contentSource, content: prepared.content, sourceRef: prepared.sourceRef }
      : task)),
  };
}

/**
 * Prepares tasks in order, at most `parallel` at once; the others go on when one fails. A failed task is tried once
 * more after the rest (a long week can meet a function worker at its time limit), then reported (final review).
 */
export async function prepareTasks(
  ids: string[],
  prepare: (id: string) => Promise<LearnerTaskView>,
  onDone: (task: LearnerTaskView) => void,
  onFailed: (id: string) => void,
  parallel = 2,
): Promise<void> {
  const run = async (list: string[], onError: (id: string) => void) => {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const id = list[next++];
        try {
          onDone(await prepare(id));
        } catch {
          onError(id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, worker));
  };
  const again: string[] = [];
  await run(ids, (id) => again.push(id));
  await run(again, onFailed);
}
