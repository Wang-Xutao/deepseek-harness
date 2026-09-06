---
description: "BAF workflow domain: route resolver, audit, and future projection/transitions."
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-workflow

English | [中文](README.zh.md)

## Summary

`dsh-baf-workflow` owns the BAF go-workflow domain service. Phase 3 ships `resolveRoute()`, session `baf/route-resolved` audit, and request-level `ModelSelection` mapping. Projection, transitions, and intake land in Phase 4. Mount it only under the `bafWorkflow` isolate beside `baf-core` in the official BAF preset.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose `@deepseek-ai/dsh-baf-workflow` in the same `cordis:group` as `baf-core` with `isolate.bafWorkflow: true`. Call `freezeRouteContext(policy, profile)` (or `freezeFromPolicyFile`) when the session freezes enterprise policy and baseline. Before each model turn, `resolveAndAudit(session, phase, availability)` then `selectionForTurn(resolution)` to set the agent request model. Route failure throws stable `BafError` codes and still appends a failed audit event.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `route.ts`: enterprise ceiling → profile phase → session override → dsh default; approved-only fallback.
- `route-audit.ts`: typed `baf/route-resolved` session events (authoritative audit).
- `phase-route.ts`: map resolution to agent `ModelSelection` or workflow worker fan-out options.
- Service key: `bafWorkflow`.

Enterprise policy files use `baf-core` `EnterpriseRoutePolicy` schema; path comes from deployment config, not from baseline alone.

<a id="dev-note"></a>
## Dev Note

Do not drive go transitions through dsh `tool-workflow`/`ralph`. Phase 4 adds projection append/replay and `WorkflowService.transition`.
