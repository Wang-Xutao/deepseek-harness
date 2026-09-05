# Agent Note: Official BAF is built-in only (no user copy or user-root sync)

Status: implemented

English | [中文](2026-09-05-baf-builtin-only-no-user-copy.zh.md)

## Problem

Phase 1 shipped official BAF in the system preset root, but the earlier plan still allowed copying it into `~/.dsh/.agent-presets` and the desktop plugin sync still described writing `agent-presets` into that user root. Enterprise product confirmation forbids both: colleagues may only use the built-in BAF, must not receive a user-writable snapshot, and must not modify the official composition.

## Decision

Treat official `baf` as built-in only:

- `isPresetCopyable('baf')` is false; `copyComposition` rejects with a built-in-only error; roster rows expose `copyable: false`.
- Settings UI disables Duplicate for that row (`officialNoCopy`).
- Desktop `syncPluginIntoDshHome` syncs only `skills/` into `~/.dsh/skills` and never copies official presets into `~/.dsh/.agent-presets`.
- Persona remains bilingual with Chinese first, then English.
- Enterprise inputs freeze OpenSpec at `latest`, C compiler at `gcc`, and coverage thresholds as `project-config`.

This supersedes the copy-into-user-root half of [2026-09-05-baf-system-preset](2026-09-05-baf-system-preset.md); shipped discovery and system trust from that note remain in force.

## Alternatives considered

### Why not keep copy-as-snapshot for power users?

A user snapshot drifts from enterprise updates, can be edited into a bypass of ToolGuard/baseline assumptions, and reintroduces the user-root install path the trust model rejected.

### Why not leave plugin `agent-presets/` sync for non-BAF packs?

Official BAF must not use that path at all. Leaving the sync enabled invites mistaking user-root install for the official delivery. Skills remain the only synced plugin payload for now.

## Consequences

- Authoring tests assert copy refusal; UI tests assert the disabled Duplicate tip.
- Other shipped presets stay copyable under existing authoring rules.
- Phase 9 still owns signed managed-system-root hot updates, without writing official BAF into the user preset root.
