# baf-core schema

Phase 0–3 frozen contracts. Runtime zod validation lives in `src/baseline.ts` and `src/route-policy.ts`.

| File | Role |
| --- | --- |
| `baseline.schema.yaml` | Full baseline manifest (embeds routeProfile by ref) |
| `route-profile.schema.json` | JSON Schema 2020-12 for `routeProfile` |
| `enterprise-route-policy.schema.json` | Independent enterprise route ceiling (Phase 3) |

Fixture: `../tests/fixtures/baseline/baseline.yml`.
