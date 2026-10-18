/** Optional local migration exports are kept outside the repository. CI may provide a fixture directory explicitly. */
export const MIGRATION_SPIKE_DIR = process.env.PARLE_MIGRATION_SPIKE_DIR ?? "D:/AgentDevWork/parle-migration-data/spike";
export const MIGRATION_BUNDLE_PATH = process.env.PARLE_MIGRATION_BUNDLE_PATH ?? "D:/AgentDevWork/parle-migration-data/export-20261015-0515/bundle.json";
