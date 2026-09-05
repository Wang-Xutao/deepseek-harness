# baf-core schema (Phase 0)

Frozen contracts ahead of the Phase 2 package implementation.

| File | Role |
| --- | --- |
| `baseline.schema.yaml` | Full baseline manifest (embeds routeProfile by ref) |
| `route-profile.schema.json` | JSON Schema 2020-12 for `routeProfile` |

Runtime zod validation lands in Phase 2 (`src/baseline.ts`). Fixture: `../tests/fixtures/baseline/baseline.yml`.
