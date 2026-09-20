---
name: baf-c-guidance
description: Entry point for BAF C-language engineering guidance. Rules and thresholds come from the active enterprise baseline, not from this skill. Use when writing, reviewing, or verifying C code under BAF.
---

# BAF C guidance

Do not invent compiler flags, coverage numbers, or analyzer names. Load them from the active baseline (`stack` / `standard` sections) via BAF domain services.

## What this skill covers

- Prefer existing project build/test layouts discovered in the workspace.
- Keep changes inside the plan allowlist; scope growth requires reconfirmation or full-go-path upgrade.
- Treat missing tools as `tool_unavailable` — never report a missing check as passed.
- Protected paths and secret scan rules come from baseline `guard`; refuse writes that violate them.

## What this skill does not own

Concrete Matt Pocock rule text, OpenSpec CLI version, coverage minimums, and analyzer ids are enterprise inputs (`overlay/docs/baf/enterprise-inputs.md`). Until frozen, fixtures may use `<enterprise-tbd>` placeholders; real runs must surface `policy_missing` / `baseline_unavailable` instead of guessing.
