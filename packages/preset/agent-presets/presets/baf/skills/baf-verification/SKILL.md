---
name: baf-verification
description: How to read and act on BAF verify reports — OpenSpec, quality, guard, freshness, and failure routing back to implement. Use during verify or when explaining why archive is blocked.
---

# BAF verification

Verify aggregates machine checks into a structured report (`verify-report.json` once Phase 5+ lands). Interpret reports; do not replace them with prose claims.

## Check families

| Family | Typical codes / outcomes |
| --- | --- |
| OpenSpec | validate success / failure / `openspec_unavailable` |
| Quality | compile, test, coverage, analyzers — or `tool_unavailable` |
| Guard | `protected_path`, `secret_detected`, transition / verify requirements |
| Freshness | report revision vs current workspace / baseline lock |

## Reading a report

1. Prefer structured `status` / diagnostics over summary sentences.
2. Any required failure blocks archive (`verify_required`).
3. Tool absence is a distinct failure — do not coerce it into pass.
4. Drift (deleted files, branch/revision change, baseline change, stale report) returns to the earliest affected node; do not silently repair.

## After failure

Route to `implement` only through the domain transition table (T11). Re-run verify after fixes; do not archive on partial evidence.
