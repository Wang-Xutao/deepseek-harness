# Agent Note: BAF core Phase 2 package

Status: implemented

English | [中文](2026-09-06-baf-core-phase2.zh.md)

## Problem

Phase 1 shipped a discoverable official BAF preset, but composition could not mount domain services and there was no shared baseline loader, error vocabulary, or adapter contract. Later workflow/OpenSpec/quality phases would otherwise invent parallel types and fail silently without tools.

## Decision

Add `@deepseek-ai/dsh-baf-core` under `packages/baf/`:

- Public types for intake, workflow transitions (`TRANSITIONS`), projection events, domain results, and `BafError`.
- Zod baseline loader with semantic checks (allowed routes, fallback groups, BAF version range) against the Phase 0 fixture schema.
- Adapter interfaces plus unavailable stubs for OpenSpec, stack, guard, and workflow.
- Cordis `BafCore` service (`bafCore`) mounted only under `bafDomain` isolate in `presets/baf/agent.cordis.yml`.
- Declare the package on `apps/cli` and `web-app` so shipped preset resolution and `verify-cordis-config` succeed.

## Alternatives considered

### Why not put workflow state machine in baf-core now?

Phase 4 owns projection append/replay and transitions. Phase 2 only freezes the table and stubs so Phase 3–4 can depend on stable imports.

### Why unavailable stubs instead of omitting adapters?

Call sites need a registered object that returns `tool_unavailable` / structured failures; optional undefined would encourage silent skips.

## Consequences

- BAF composition health now requires resolving `@deepseek-ai/dsh-baf-core`.
- Phase 3 route resolver and Phase 4 `baf-workflow` import types from this package.
- Real OpenSpec/C/guard implementations replace stubs without changing the interfaces.
