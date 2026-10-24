# Agent Note: Preset row health check keeps baf compositions resolvable

Status: implemented

English | [中文](2026-10-24-baf-plugin-row-health-check.zh.md)

## Problem

Upstream v0.2.1-rc.1 retired the standalone `@deepseek-ai/dsh-tool-subagent-control/list-agents` plugin export; `list_agents` is now registered by the main `@deepseek-ai/dsh-tool-subagent-control` plugin. baf's own compositions still declared the retired row:

- `packages/bundle/web-app/presets/baf.patch.yml`
- `packages/preset/agent-presets/presets/{baf,standard,ptc,cordis}/agent.cordis.yml`

On the desktop that failure was indirect: the session could not be created (`agent-preset/invalid: tool-subagent-list-agents … never started`), the app stayed in its empty state, and the settings panel closed by itself the moment a section was opened — so the 多模型路由 section never rendered. Nothing in the tree named the retired export as the cause, because the row was syntactically valid.

## Decision

- Remove the retired `tool-subagent-list-agents` rows from the five baf composition files, following the upstream migration note (`docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md`): one `@deepseek-ai/dsh-tool-subagent-control` row per tool scope, and no patch targeting the retired row.
- Add `overlay/scripts/check-baf-plugin-rows.mjs`. It reads every plugin row out of baf's preset and patch files and resolves each one the way Node does — scoped package names split at the scope slash, sub-exports resolved through the package's `exports` map — then asserts that the package exists and that a sub-export has a runtime target. A row naming a package upstream deleted, or a sub-export upstream retired, fails the check.
- The check covers the four bundle patch files (`baf` / `standard` / `ptc` / `cordis`) and the five agent-preset compositions (`baf` / `standard` / `ptc` / `cordis` / `minimal`).

## Alternatives considered

### Why not let the failure surface at runtime only?

The runtime symptom was far from the cause: a session that would not start, a settings panel that closed by itself, a routing section that would not open. A row-level check names the offending row.

### Why not a unit test inside a package?

The rows live in YAML files that several packages read, and the failure mode is cross-package: the row is fine syntactically and only unresolvable against the tree. A script that resolves every row against the whole workspace is the check that fits.

### Why not check only the `baf` profile?

Every preset in the tree shares the hazard. A retired export in the `ptc` composition breaks that composition the same way, so the check sweeps all of them.

## Consequences

- The retired rows are gone, so baf compositions resolve against the current upstream tree and sessions start again.
- The new check needs no build step: it reads the workspace sources and the packages' `exports` maps.
- The check reports a missing package and a missing sub-export differently, so a deleted package and a retired export are distinguishable in the output.
- The check is a workspace script under `overlay/scripts/`, committed next to the other overlay verification scripts; it needs no build step and runs during packaging and merge verification.

## Testing

- `node overlay/scripts/check-baf-plugin-rows.mjs` reports every plugin row in the nine covered composition files resolving.
- The packaged desktop build starts a session again, and the 多模型路由 section opens with its five tabs and the Commander / Reviewer / Worker tiers (`overlay/scripts/probe-merge-exe.mjs`).

## Related

- [Upstream master merge and the stepRouteResolver seam](../architecture/2026-10-24-upstream-master-merge-route-resolver-seam.md)
- `docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md` — the upstream migration this repair follows.
