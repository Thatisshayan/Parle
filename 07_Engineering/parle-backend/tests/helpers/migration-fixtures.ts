/** Optional local migration exports are kept outside the repository. CI may provide a fixture directory explicitly. */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const MIGRATION_SPIKE_DIR = process.env.PARLE_MIGRATION_SPIKE_DIR ?? "D:/AgentDevWork/parle-migration-data/spike";
export const MIGRATION_BUNDLE_PATH = process.env.PARLE_MIGRATION_BUNDLE_PATH ?? "D:/AgentDevWork/parle-migration-data/export-20261015-0515/bundle.json";
export const HAS_LOCAL_DEMO_FIXTURES = ["imm1.question_item.json", "imm1.prompt_item.json", "imm1.app_setting.json"]
  .every((name) => existsSync(join(MIGRATION_SPIKE_DIR, name)));
export const HAS_M3IMM_TASK_FIXTURE = existsSync(join(MIGRATION_SPIKE_DIR, "m3imm.learner_task.json"));
export const HAS_M3IMM_TRANSFORM_FIXTURES = HAS_M3IMM_TASK_FIXTURE && existsSync(join(MIGRATION_SPIKE_DIR, "m3imm.usage_counter.json"));
