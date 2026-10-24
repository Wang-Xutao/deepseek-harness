# Agent Note: Upstream master merge keeps baf auto routing on a generic stepRouteResolver seam

Status: implemented

English | [中文](2026-10-24-upstream-master-merge-route-resolver-seam.zh.md)

## Problem

Upstream master moved model ownership out of the session controller. `packages/core/agent/src/model-selection.ts` introduced the `AgentModel` face plus `modelSelectionProjectionDefinition`, and `ApiSessionAgentController` lost `selectionFor` / `selectForNextRequest` / `consumeSelection` / `installSelection`.

baf's multi-model "auto" routing resolved the auto pseudo-model inside the session controller, so that refactor removed the only place baf plugged into. Merging master would either drop auto routing or push baf-specific knowledge into upstream packages.

## Decision

- Upstream owns a generic seam. `packages/core/agent-loop/src/route-resolver.ts` defines the `stepRouteResolver` service contract (`resolveStepRoute(session, route)`) and a context lookup (`resolveStepRoute(ctx, session, route)`). The agent loop reads the per-step route through it (`packages/core/agent-loop/src/agent.ts`).
- baf implements the contract in `packages/baf/baf-workflow/src/route-auto.ts` (`BafRouteAutoRuntime`) and registers it under the service name `stepRouteResolver` through `ctx.provide`. Upstream never imports a baf package; the dependency stays one-way.
- `packages/api/session-controller` keeps the baf-facing bridge (`route-auto-bridge.ts`: `routeAutoOf` / `autoCatalogGroups`) but owns no model selection: `selectForNextRequest` is `agent.model.select`, and `rawSelectionOf` is `agent.model.current()`.
- The auto pseudo-model resolves in this order: tier routing from the baf route config, then the session's last request route, then the deployment default. The pseudo-model never reaches a provider.
- `model/selection` events keep recording the pseudo-model; `request/header` records the resolved tier model.
- Merge policy for the whole merge: when both sides added something, take the union; when upstream deleted or refactored an API, rebase baf onto the new architecture instead of reviving the old implementation.

## Alternatives considered

### Why not keep the resolver inside the session controller?

The session controller no longer owns model selection upstream, so a resolver there would have to reach into `AgentModel` state and re-derive the per-step route. That restores the coupling upstream just removed and would break again on the next upstream refactor.

### Why not let upstream depend on the baf routing package?

That makes upstream's agent loop depend on a baf package, so every upstream consumer ships baf routing code, and the upstream tree stops being usable on its own. The service contract keeps the direction one-way: upstream declares the seam, baf provides the implementation.

### Why not resolve the tier once per session instead of per step?

A session-level resolution fixes the model for the whole session, so a tier that changes between steps — keyword escalation inside one task, a phase that must switch to Reviewer for verification — would keep the first choice. The per-step read is what makes keyword escalation and phase binding observable.

### Why not revive upstream's deleted selection APIs?

The upstream refactor was deliberate: model ownership moved to the `AgentModel` face so the projection has one source of truth. Reviving `selectForNextRequest` / `installSelection` in the session controller would re-create two writers for one fact.

## Consequences

- baf's auto routing survives the upstream model-selection refactor without any upstream package knowing about baf, and the seam is reusable by any other routing policy.
- `packages/api/session-controller` lost the selection-writing API it used to expose; its consumers now go through `AgentModel`. The baf bridge keeps the baf-facing read surface (`routeAutoOf`, `autoCatalogGroups`) unchanged.
- Every upstream change to the model-selection projection now reaches baf through one service call instead of through session-controller internals, so upstream rebases touch fewer baf files.
- The merge itself was taken as a union on both-sides additions (dependencies, exports, CSS classes) and as a rebase on upstream-deleted APIs. `packages/README.i18n.yaml` and the six-locale dictionaries were recomputed rather than copied, so baf's keys are present in every locale upstream now ships.
- The merge also surfaced a stale plugin row in baf's own presets; that repair is recorded in [the preset health-check note](../process/2026-10-24-baf-plugin-row-health-check.md).

## Testing

- `pnpm run typecheck` passes all five gates; `pnpm run build` passes all ten.
- `packages/baf/baf-workflow/tests/route-auto.spec.ts` covers the resolver contract and the service registration; `packages/api/session-controller/tests/route-auto-bridge.host.spec.ts` covers the bridge against the new `AgentModel` face.
- The web walkthrough confirmed the baf surface after the merge: the BAF mark, the 「工作流」 sidebar panel, the 「BAF 模式」 preset seat, the direct 「设置」 trigger, the four baf-badged settings sections, and the 多模型路由 section with its five tabs and the Commander / Reviewer / Worker tiers.
- The packaged desktop build was probed through CDP (`overlay/scripts/probe-merge-exe.mjs`): the shipped bytes carry `stepRouteResolver` in `dsh-agent-loop/lib/index.js` and its implementation in `dsh-baf-workflow/lib/route-auto.js`.

## Related

- [Preset row health check](../process/2026-10-24-baf-plugin-row-health-check.md)
- `docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md` — the upstream migration that the preset repair follows.
