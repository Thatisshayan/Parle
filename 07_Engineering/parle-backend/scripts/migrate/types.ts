export type BuildyRow = Record<string, unknown>;
export type Person = { buildyId: string; email: string; fullName: string | null; buildyRole: "administrator" | "user" };
/** One export of Buildy: rows by entity (merged and deduplicated by id across sources) and the people who own them. */
export type ExportBundle = { exportedAt: string; people: Person[]; rows: Record<string, BuildyRow[]> };
/** Buildy user id -> the new login's id and email. */
export type PersonMap = Map<string, { newId: string; email: string }>;
export type TransformReport = {
  unknownPersonIds: Array<{ entity: string; id: string; column: string; value: string }>;
  ownerless: Array<{ entity: string; id: string; created_by: string }>;
  buildyHosts: Array<{ entity: string; id: string; column: string }>;
  usageMerged: { from: number; to: number };
};
