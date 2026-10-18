import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Synthetic, deterministic inputs keep migration/placement integration tests runnable in CI without private exports.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../tests/.generated-fixtures");
mkdirSync(root, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);

const skills = ["reading", "listening", "grammar_vocabulary"] as const;
const levels = ["A1", "A2", "B1", "B2"] as const;
const questions = Array.from({ length: 120 }, (_, index) => {
  const number = index + 1;
  const skill = skills[Math.floor(index / 10) % skills.length];
  const level = levels[Math.floor(index / 30)];
  const listening = skill === "listening";
  return {
    id: `fixture-question-${String(number).padStart(3, "0")}`,
    created_by: "ci-fixture",
    skill,
    cefr_level: level,
    format: "multiple_choice",
    prompt: `Fixture ${number}: Choisissez la bonne réponse.`,
    passage: listening ? "" : `Texte de pratique synthétique numéro ${number}.`,
    transcript: listening ? `Phrase audio synthétique numéro ${number}.` : "",
    audio_url: "",
    options: [{ id: "A", text: "Réponse A" }, { id: "B", text: "Réponse B" }],
    answer_option_id: "A",
    answer: "Réponse A",
    explanation: "Fixture CI: la première réponse est correcte.",
    status: "approved",
    created_by_type: "admin",
    reviewed_by: "synthetic test fixture",
    content_audit_version: "ci-fixture-v1",
    is_test_data: true,
    demo_code: `CI-Q-${String(number).padStart(3, "0")}`,
  };
});

const prompts = Array.from({ length: 16 }, (_, index) => {
  const number = index + 1;
  return {
    id: `fixture-prompt-${String(number).padStart(3, "0")}`,
    created_by: "ci-fixture",
    kind: number % 2 ? "writing" : "speaking",
    cefr_level: levels[Math.floor(index / 4)],
    track: "all",
    text: `Sujet synthétique de pratique numéro ${number}.`,
    status: "approved",
    created_by_type: "admin",
    reviewed_by: "synthetic test fixture",
    content_audit_version: "ci-fixture-v1",
    is_test_data: true,
    demo_code: `CI-P-${String(number).padStart(3, "0")}`,
  };
});

const settings = [
  ["premium_live_voice_minutes_per_month", "60"],
  ["minimum_lesson_charge_usd", "8"],
  ["premium_roadmap_triggers_enabled", "true"],
  ["live_voice_enabled", "false"],
  ["premium_fair_use_ai_messages_per_day", "100"],
  ["payout_delay_hours", "72"],
  ["commission_percent", "20"],
  ["cancellation_window_hours", "24"],
  ["free_ai_messages_per_day", "10"],
].map(([key, value]) => ({ id: `fixture-setting-${key}`, created_by: "ci-fixture", updated_by: "ci-fixture", key, value }));

const tasks = Array.from({ length: 35 }, (_, index) => {
  const number = index + 1;
  const status = number % 3 === 0 ? "done" : number % 2 === 0 ? "planned" : "suggested";
  const at = new Date(Date.UTC(2026, 9, 1, number)).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    created_at: at,
    updated_at: at,
    type: ["vocabulary_drill", "listening_exercise", "writing", "speaking_practice"][index % 4],
    skill: ["reading", "listening", "writing", "speaking"][index % 4],
    topic: `Synthetic topic ${number}`,
    reason: "weekly_practice",
    status,
    minutes: number * 5,
    user_id: "fixture-buildy-user",
    optional: false,
    task_key: `fixture-task-${String(number).padStart(2, "0")}`,
    created_by: "learner-fixture@example.test",
    date_local: `2026-10-${String((index % 28) + 1).padStart(2, "0")}`,
    completed_at_utc: status === "done" ? at : null,
    scheduled_at_utc: at,
  };
});

const usage = Array.from({ length: 9 }, (_, index) => ({
  id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
  created_at: new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
  period: "day",
  user_id: "fixture-buildy-user",
  created_by: "learner-fixture@example.test",
  period_key: "2026-10-01",
  ai_messages: 1,
  voice_minutes: 0,
  source_event_id: `fixture-event-${index + 1}`,
  source_session_id: `fixture-session-${index + 1}`,
}));

write("imm1.question_item.json", questions);
write("imm1.prompt_item.json", prompts);
write("imm1.app_setting.json", settings);
write("m3imm.learner_task.json", tasks);
write("m3imm.usage_counter.json", usage);

const ids = tasks.map((row) => row.id);
const completed = tasks.filter((row) => row.status === "done").map((row) => row.id);
const notCompleted = tasks.filter((row) => row.status !== "done").map((row) => row.id);
const minutesGte20 = tasks.filter((row) => row.minutes >= 20).map((row) => row.id);
const byMinutes = [...tasks].sort((a, b) => a.minutes - b.minutes).map((row) => row.id);
const byCreatedDesc = [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((row) => row.id);
const byCreated = [...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((row) => row.id);
const listedSkills = tasks.filter((row) => ["reading", "speaking"].includes(row.skill)).map((row) => row.id);
const noCompletion = tasks.filter((row) => row.completed_at_utc === null).map((row) => row.id);
write("filter-cases.json", [
  { name: "all", query: {}, expectedIds: ids },
  { name: "equals string", query: { status: "done" }, expectedIds: completed },
  { name: "not equal", query: { status: { $ne: "done" } }, expectedIds: notCompleted },
  { name: "number gte", query: { minutes: { $gte: 20 } }, expectedIds: minutesGte20 },
  { name: "in list", query: { skill: { $in: ["reading", "speaking"] } }, expectedIds: listedSkills },
  { name: "missing field equals null", query: { completed_at_utc: null }, expectedIds: noCompletion },
  { name: "sort ascending", query: {}, sort: "minutes", expectedIds: byMinutes },
  { name: "sort descending", query: {}, sort: "-created_at", expectedIds: byCreatedDesc },
  { name: "sort unknown field", query: {}, sort: "no_such_field", expectedIds: ids },
  { name: "limit and skip", query: {}, sort: "created_at", limit: 3, skip: 2, expectedIds: byCreated.slice(2, 5) },
]);

console.log("created deterministic synthetic integration fixtures");
