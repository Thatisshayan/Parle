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

/** Prepares tasks in order, at most `parallel` at once; a failed task is reported and the others go on. */
export async function prepareTasks(
  ids: string[],
  prepare: (id: string) => Promise<LearnerTaskView>,
  onDone: (task: LearnerTaskView) => void,
  onFailed: (id: string) => void,
  parallel = 2,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        onDone(await prepare(id));
      } catch {
        onFailed(id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, ids.length) }, worker));
}
