# Agent Note: BAF workflow Phase 3 route resolver

Status: implemented

English | [中文](2026-09-06-baf-workflow-phase3-route.zh.md)

## Problem

Phase 2 froze baseline `routeProfile` and error codes, but BAF had no enterprise ceiling independent of the profile, no `resolveRoute()` order, and no session-log audit for which provider/model served a phase turn. Stage runners would otherwise invent ad-hoc model picks or silent fallbacks outside policy.

## Decision

Add `@deepseek-ai/dsh-baf-workflow` (Phase 3 slice) and extend `baf-core`:

- `EnterpriseRoutePolicy` is loaded from a **deployment-config path** (independent YAML/JSON), frozen at session create with the baseline `routeProfile`. Baseline alone is never the enterprise ceiling.
- `resolveRoute()` order: enterprise allowed ceiling → profile phase preference → session override (must stay inside allowed) → dsh default; then `approved-only` fallback with stable `model_route_*` / `model_fallback_blocked` errors.
- Each resolution appends typed session event `baf/route-resolved` (authoritative); workspace audit JSONL remains optional derived index.
- `RouteStatusView` + `buildRouteStatusView` live in `baf-core` for settings/Tab/`baf status`.
- Phase turn primary path: map resolution to agent `ModelSelection` (request-level). Workflow `agent()` options are fan-out only.
- Official BAF composition mounts `baf-workflow` beside `baf-core` under the same isolate group.

The workflow Tab UI stays Phase 4/8 (user deferred).

## Alternatives considered

### Why not encode enterprise policy only inside baseline routeProfile?

§6.2 requires an independent enterprise policy that can only tighten. Collapsing it into profile would make `source: enterprise` an alias and prevent deployment from shipping a stricter ceiling without republishing the whole baseline.

### Why not drive phase route through dsh tool-workflow?

Go state transitions must not use `tool-workflow`/`ralph`. Request-level ModelSelection matches existing catalog/default-model paths; worker `agent()` remains optional for child fan-out.

## Consequences

- BAF composition now resolves `@deepseek-ai/dsh-baf-workflow`.
- Persistence catalog must include `baf/route-resolved`.
- Phase 4 stage runners call `resolveAndAudit` before model turns; missing freeze fails with `policy_missing`.
