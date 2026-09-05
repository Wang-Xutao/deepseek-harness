# Agent Note: Official BAF system preset in shipped root

Status: implemented

English | [中文](2026-09-05-baf-system-preset.zh.md)

## Problem

Enterprise BAF mode must appear in the same shipped roster as `standard`, with `trust: system`, without installing into `~/.dsh/.agent-presets` (user trust). Without a first-class shipped preset, later domain plugins have no composition row to mount and the desktop roster cannot show an official BAF.

## Decision

Ship `packages/preset/agent-presets/presets/baf/` beside the other built-ins:

- `preset.yml` with `order: 2` (ties with `ptc` break by id, so roster order is `standard`, `baf`, `ptc`, `minimal`, `cordis`).
- `agent.cordis.yml` copied from `standard`, with a BAF persona and commented Phase 2+ domain group placeholders (no unresolved package names yet).
- Skills `baf-go`, `baf-c-guidance`, and `baf-verification` under the preset skills tree, with `skill-filesystem.customSkillDirs` resolving `skills/` from the composition `baseUrl` (same pattern as Creator mode).
- Locale keys `presetBafName` / `presetBafDescription` in `dsh-agent-presets/display` and `ui-agent-preset` dictionaries.

`standard` remains the deployment default. Deleting system `baf` stays refused; a user directory named `baf` does not shadow the shipped root. Copying official `baf` into a user root is **refused** — see the superseding note [2026-09-05-baf-builtin-only-no-user-copy](2026-09-05-baf-builtin-only-no-user-copy.md).

## Alternatives considered

### Why not install only via `overlay/plugin` → user root?

That path yields `trust: user`, allows shadowing/deletion, and fails the enterprise trust and update model in `overlay/docs/enterprise-workflow.md`.

### Why not put domain packages in the composition in Phase 1?

Those packages do not exist until Phase 2+. Referencing them would break mount health. Comments reserve the `baf-domain` group for later enablement.

### Why not a unique `order` instead of sharing `2` with `ptc`?

The Phase 1 plan freezes `order: 2`. Discovery already ties equal orders by id; `baf` sorts immediately after `standard` without renumbering `ptc`/`minimal`/`cordis`.

## Consequences

- Roster, display, CLI e2e id lists, and web agent-preset goldens include BAF.
- Phase 2 must enable real `@deepseek-ai/dsh-baf-*` rows and mount tests; desktop no longer syncs official presets to the user root (see [built-in-only note](2026-09-05-baf-builtin-only-no-user-copy.md)).
- BAF retains `tool-workflow`/`ralph` for optional implement fan-out; ToolGuard (Phase 7) must still forbid them from rewriting projection or skipping verify.
