# @deepseek-ai/dsh-baf-guard

BAF tool hard-gate (Phase 7.3 of the enterprise-workflow contract):
baseline-driven adjudication of every `write` / `edit` / `bash` / `pwsh`
tool call against the workflow projection, with secret scanning,
path traversal protection, and dangerous/indirect shell pattern detection.
A separate `GuardPolicy` surface answers verify-time questions over the
same projection state.

English | [中文](README.zh.md)

## Why

MCP servers, subagents, and `bash` shells are all paths that bypass the
intent of the workflow stages. The hard gate has to run **after**
permission decisions and **before** every tool body — and it must re-read
projection state on every call (no in-process cache), so that a flip in
intake confirmation, in the allowlist, or in the stage policy immediately
changes the gate. When the projection is unreadable, the gate fails
closed: writes keep being rejected until the projection is repaired.

## Two surfaces, one policy core

The package exports two entry points that share `policy.ts` (pure path
and string work — no I/O):

### `GuardPolicy` — verify stage

```ts
ctx.bafGuard.policy(workspaceRoot): GuardPolicy
```

Returning a `GuardPolicy.check(input, signal)` with two supported
actions:

- `action: 'verify'` — iterates every touched path, runs
  `adjudicateStructuralPath(config, root, path)`, returns
  `{ allowed: codes.length === 0, reasonCodes: codes }`. Codes include
  `protected_path` (baseline `guard.protectedPaths[]`), `system_resource_conflict`
  (`.git` / `.baf`), `workspace_escape` (absolute path outside the root),
  `path_traversal` (relative `..`).
- `action: 'secret-scan'` — reads each touched path and runs
  `scanTextSecrets(text)` (AWS access keys, GitHub PATs / OAuth tokens,
  GitLab tokens, Slack tokens, generic `api-key = …`, PEM private-key
  blocks). `baseline.guard.secretScan === 'off'` short-circuits to
  `{allowed:true, reasonCodes:[]}`.
- Unknown actions return `{allowed:false, reasonCodes:['invalid_transition']}`.

### `ToolGuard` — per-agent runtime gate

```ts
ctx.bafGuard.toolGuard({ workspaceRoot }): ToolGuard
```

A `ToolGuard` accepts a `ToolExecution` and either returns `undefined`
(allow) or a denial string of the form `[baf-guard] <code>: <message>`.
It runs **after** the permission system and **before** the tool body.
Only the four mutating tools the BAF composition exposes are classified;
read-only tools and future tools pass through.

- `classifyToolCall(name, args)` maps:
  - `write` → `{ kind: 'fs-write', path: args.file_path, content: args.content }`
  - `edit` → `{ kind: 'fs-write', path: args.file_path, content: args.new_string }`
  - `bash` / `pwsh` → `{ kind: 'shell', command: args.command }`
  - else → `{ kind: 'unrecognized' }` (allow)
- `adjudicateFsWrite` chains: structural → secret scan → active change →
  intakeConfirmed → DOC_STAGES change-dir allowance → implement allowlist;
  `scope_exceeded` after intake confirmation, `invalid_transition` for
  writes with no active change.
- `adjudicateShell` denies the destructive set (`rm -rf /`, `mkfs`,
  `dd of=/dev/…`, `shutdown|poweroff|halt|reboot`, `git push --force`)
  plus the indirect-write set (`>` / `>>` redirect, fd-to-file,
  heredoc, `tee`, `sed -i`, `perl -i`, `truncate`, `shred`, `cp`,
  `mv`, `rm`, `unzip`, `tar`, `wget`, `curl`).

## Projection state (sync, no cache)

`projection-state.ts` reads `.baf/projection/index.json` and the change
log plus the allowlist (from `openspec/changes/<id>/plan.json` or
`fastpath-ledger.json`) **on every call**. Failure modes:

- Unreadable index → `{active:false, intakeConfirmed:false, allowlist:[]}`
- Active change + unreadable log → `{active:true, intakeConfirmed:false}`
  (writes keep failing until the projection is repaired)
- `.baf/baseline.yml` missing the `guard` section → fallback to
  `DEFAULT_GUARD_CONFIG = { secretScan: 'required', protectedPaths: [] }`

## Install row (`@deepseek-ai/dsh-baf-guard/install`)

`install.ts` mirrors the `baf-workflow/commands` pattern: a
non-isolated row that injects host `agents`, listens for
`agent/created` and `agent/disposed`, and on each creation resolves
the workspace from `agent.session.header.cwd ?? process.cwd()` and
installs the guard via `agent.ctx.inject(['tools'], scope =>
scope.tools.guard(guard))`. Fiber disposal + `ctx.effect(() => async
() => …)` teardown keep the guard scoped to its agent. The exported
`name = 'baf-guard-install'` matches the row id the preset uses.

## Stable reason codes

| code                          | when                                              |
| ----------------------------- | ------------------------------------------------- |
| `intake_confirmation_required`| intake not confirmed (or projection unreadable)   |
| `protected_path`              | path matches `baseline.guard.protectedPaths[]`    |
| `secret_detected`             | file content matches a credential pattern         |
| `workspace_escape`            | absolute path outside the workspace root          |
| `path_traversal`              | `..` segment in the relative path                 |
| `system_resource_conflict`    | path resolves to `.git` or `.baf`                 |
| `invalid_transition`          | write with no active change / unknown guard action|
| `scope_exceeded`              | write outside the implement allowlist             |
| `dangerous_command`           | `rm -rf /`, `mkfs`, `dd of=/dev/…`, etc.          |
| `shell_indirect_write`        | `>`, `>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`, …   |

Codes come **first** in every denial string so callers (and tests) can
match `code:` without parsing prose.

## API

```ts
import { BafGuard } from '@deepseek-ai/dsh-baf-guard'
import {
  adjudicateFsWrite, adjudicateShell, adjudicateStructuralPath,
  classifyToolCall, createBafToolGuard, loadGuardConfig,
  readGuardWorkflowState, scanTextSecrets,
  type GuardPolicyConfig, type GuardWorkflowState, type GuardReasonCode,
  DEFAULT_GUARD_CONFIG, BAF_GUARD_PREFIX,
} from '@deepseek-ai/dsh-baf-guard'
```

- `BafGuard` (Cordis service, name `bafGuard`, config `{}`)
- `bafGuard.policy(workspaceRoot)` → `GuardPolicy`
- `bafGuard.toolGuard(options)` → `ToolGuard`
- Policy primitives are also exported for tests and downstream callers.

## Tests

```bash
npx vitest run packages/baf/baf-guard
```

20 tests cover policy reason codes, shell allow/deny sets,
classification, stable-prefix denials, re-adjudication flips, sync disk
state (empty workspace → `intake_confirmation_required`, real
projection driven to implement → allowlist honored),
`GuardPolicy` actions (`verify` / `secret-scan` / `off`), and the
`install` row's wiring contract.
