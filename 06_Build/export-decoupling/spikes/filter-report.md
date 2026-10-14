# Spike: Buildy filter behaviour the compatibility layer must copy (Plan 1, Task 4)

- **Date:** 2026-10-14
- **Method:** `scripts/spikes/filter-shapes.ts` scanned every `.filter(` call in the exported app (`src/` and
  `functions/`, tests excluded). `scripts/spikes/filter-live.ts` replayed 10 queries on Buildy against learner B's own
  `learner_task` rows (35 rows) and saved the returned ids as `07_Engineering/parle-backend/tests/fixtures/filter-cases.json`
  for Plan 2's compatibility tests. Results checked against the exported rows.

## What the code uses
- **Operators: none.** Every `filter()` in the app is plain equality on one or more fields (`{ user_id: me.id, status: "planned" }`).
- **Sort strings:** `-created_at` (19), `-updated_at` (4), `created_at` (3), `demo_code` (2).
- **Limit:** 33 calls; **skip:** 5 calls.

## How Buildy behaves (live)
| case | Buildy result | true matches in the data | rule for the new layer |
|---|---|---|---|
| `{}` | 35 | 35 | no filter |
| `{ status: "done" }` | 2 | 2 | `eq` |
| `{ status: { $ne: "done" } }` | 33 | 33 | `neq` (not used by the app) |
| `{ minutes: { $gte: 20 } }` | 5 | 5 | `gte` (not used by the app) |
| `{ skill: { $in: [...] } }` | **35** | 18 | Buildy ignores `$in`; not used by the app, so the new layer implements it correctly and nothing depends on the bug |
| `{ completed_at_utc: null }` | **0** | 0 null / 33 empty | **Buildy stores empty fields as `""`, not null.** All 35 rows carry `completed_at_utc`; 33 hold `""`. Equality with `null` matches nothing. |
| sort `minutes`, `-created_at` | ordered | - | `order=field.asc` / `order=field.desc` |
| sort `no_such_field` | ignored, no error | - | ignore unknown sort fields (do not error) |
| `limit 3, skip 2` | 3 rows | - | `limit` / `offset` |

## Consequences
1. **Plan 4 (migration):** copy `""` values as `""` (text columns keep them). Do not turn empty strings into NULL, or
   every `{ field: "" }` equality filter in the app would stop matching.
2. **Plan 2 (compatibility layer):** implement equality, the four sort strings (`-` prefix = descending), limit and
   skip; ignore unknown sort fields; treat `{ field: null }` as `is.null` (no app code relies on Buildy's "matches
   nothing", and migrated data has no nulls where Buildy had `""`). Operators may be implemented for completeness but
   no page needs them.
3. The replay fixture (`tests/fixtures/filter-cases.json`) lets Plan 2 compare the new layer against Buildy's real
   answers, case by case, except `$in` (Buildy's answer is wrong) and the null case (decided above).
