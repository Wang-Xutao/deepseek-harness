/**
 * Authoritative per-node catalog for go workflow (enterprise-workflow §5.3).
 * UI and diagnostics render this; they must not invent a second catalog.
 * @module @deepseek-ai/dsh-baf-core/catalog
 */

import type { WorkflowNode } from './workflow.ts'

/** Structured definition of one workflow node for Tab / doctor / skills. */
export interface NodeCatalogEntry {
  /** Node id (N0–N8). */
  readonly id: WorkflowNode
  /** Short display title (locale-neutral token; UI localizes). */
  readonly titleKey: string
  /** One-line purpose. */
  readonly purpose: string
  /** Preconditions before the node may start. */
  readonly prerequisites: readonly string[]
  /** Ordered actions the stage handler must perform. */
  readonly actions: readonly string[]
  /** Expected durable artifacts. */
  readonly artifacts: readonly string[]
  /** Completion conditions checked by domain service. */
  readonly completion: readonly string[]
  /** Failure / blocked handling. */
  readonly failure: readonly string[]
  /** Typical entry surfaces. */
  readonly entries: readonly string[]
  /** Route profile phase key (same as node for N0–N7; drift uses prior). */
  readonly routePhase: WorkflowNode
  /** Whether full-go includes this node on the happy path. */
  readonly onFullGo: boolean
  /** Whether bug-fast-path includes this node on the happy path. */
  readonly onFastPath: boolean
}

/**
 * Complete §5.3 catalog. Keys cover every {@link WorkflowNode}.
 */
export const NODE_CATALOG: Readonly<Record<WorkflowNode, NodeCatalogEntry>> = {
  intake: {
    id: 'intake',
    titleKey: 'node.intake',
    purpose: 'Classify the change kind, mode, scope, and OpenSpec requirement before any source writes.',
    prerequisites: [
      'BAF session established',
      'Workspace readable',
    ],
    actions: [
      'Parse user intent into a candidate classification (model suggests only)',
      'Rule-engine review: scope, public API, data format, concurrency, security, performance, spec impact, rollback',
      'Compute affectedScope and confidence',
      'Decide mode: full-go, bug-fast-path, or clarify-required',
      'Show classification card when requiresUserConfirmation',
      'On confirm, append ChangeIntake to the projection log',
    ],
    artifacts: [
      'ChangeIntake { kind, mode, openspecRequired, reasonCodes, affectedScope, confidence }',
      'Confirmation record when required',
    ],
    completion: [
      'Classification written to projection',
      'User confirmation recorded when requiresUserConfirmation',
    ],
    failure: [
      'baseline missing → policy_missing / baseline_unavailable; fast path forbidden',
      'Cannot classify → clarify-required; no source writes',
    ],
    entries: ['session message', '/baf-open', 'baf open', 'Tab new change'],
    routePhase: 'intake',
    onFullGo: true,
    onFastPath: true,
  },
  open: {
    id: 'open',
    titleKey: 'node.open',
    purpose: 'Create the change identity, skeleton, and baseline lock.',
    prerequisites: [
      'Intake confirmed',
      'Workspace readable',
      'Git available (full-go blocks if missing; fast path warns)',
      'Baseline resolvable',
    ],
    actions: [
      'Probe workspace / Git / baseline / OpenSpec availability',
      'Require explicit select-or-create when multiple active changes exist',
      'Generate unique change id',
      'Create change skeleton (OpenSpec dirs for full-go; minimal bug record for fast path)',
      'Lock baseline and record source revision',
    ],
    artifacts: [
      'change id',
      'skeleton files',
      'initialized workflow projection',
      'baseline lock',
    ],
    completion: [
      'change id unique and directory valid',
      'baseline lock recorded',
      'non-empty change goal',
    ],
    failure: [
      'OpenSpec unavailable when required → openspec_unavailable',
      'Never overwrite existing files',
    ],
    entries: ['auto after intake', '/baf-open', 'baf open', 'Tab start'],
    routePhase: 'open',
    onFullGo: true,
    onFastPath: true,
  },
  clarify: {
    id: 'clarify',
    titleKey: 'node.clarify',
    purpose: 'Close blocking questions and write testable acceptance criteria (full-go).',
    prerequisites: ['open completed'],
    actions: [
      'Enumerate blocking questions',
      'Record answers with decision owner / source and time',
      'Mark decided / deferred / out-of-scope',
      'Write testable acceptance criteria',
      'Defer non-blocking items with recorded reason',
    ],
    artifacts: ['clarify document / decision log'],
    completion: [
      'Blocking questions answered or explicitly deferred',
      'Acceptance criteria are testable',
    ],
    failure: [
      'Unanswered blockers keep the stage in-progress',
      'Model speculation must not be marked as user confirmation',
    ],
    entries: ['auto after open', '/baf-clarify', 'Tab'],
    routePhase: 'clarify',
    onFullGo: true,
    onFastPath: false,
  },
  design: {
    id: 'design',
    titleKey: 'node.design',
    purpose: 'Produce a verifiable technical design grounded in the real repository (full-go).',
    prerequisites: ['clarify completed'],
    actions: [
      'Read actual repository code; do not invent APIs',
      'Define interfaces, data flow, error paths, risks, and compatibility',
      'Prefer existing abstractions',
      'Attach verifiable file/API citations to each conclusion',
      'Pre-check planned paths against guard policy',
    ],
    artifacts: ['design document', 'risk list'],
    completion: [
      'Design cites real files/APIs and matches baseline',
      'User or rule confirmation recorded',
    ],
    failure: [
      'Repo changed after read → drift',
      'Unverifiable citations block plan',
    ],
    entries: ['auto after clarify', '/baf-design', 'Tab'],
    routePhase: 'design',
    onFullGo: true,
    onFastPath: false,
  },
  plan: {
    id: 'plan',
    titleKey: 'node.plan',
    purpose: 'Break design into verifiable tasks with allowlist, verify commands, and rollback points (full-go).',
    prerequisites: ['design completed'],
    actions: [
      'Split design into tasks (input/output/files/verify/rollback)',
      'Freeze file allowlist',
      'Write per-task verification commands and observable done criteria',
      'Snapshot guard policy',
    ],
    artifacts: ['plan document', 'task list', 'file allowlist', 'guard snapshot'],
    completion: [
      'Every task is executable, verifiable, and rollback-ready',
    ],
    failure: [
      'Plans that only say “implement the feature” are rejected',
      'Scope expansion must emit a new event; silent growth is forbidden',
    ],
    entries: ['auto after design', '/baf-plan', 'Tab'],
    routePhase: 'plan',
    onFullGo: true,
    onFastPath: false,
  },
  implement: {
    id: 'implement',
    titleKey: 'node.implement',
    purpose: 'Implement and test within the allowlist under guard checks.',
    prerequisites: [
      'full-go: plan completed',
      'fast path: open completed with root-cause record',
    ],
    actions: [
      'Before each task, check stage and guard',
      'Edit only allowlisted files (new scope needs reconfirm or escalation)',
      'Prefer minimal implementation + tests before expanding',
      'Sync specs on full-go',
      'Record structured external-command results',
      'Record per-task start/complete/blocked',
    ],
    artifacts: ['source', 'tests', 'spec deltas', 'task result records'],
    completion: [
      'Every task has a result',
      'No out-of-scope edits',
      'Skipped tests are never treated as pass',
    ],
    failure: [
      'Guard deny → blocked + stable reason code',
      'Cancel must not fabricate completed',
      'Fast-path scope growth → escalate to full-go (T15)',
    ],
    entries: ['auto transition', '/baf-implement', 'baf implement', 'Tab'],
    routePhase: 'implement',
    onFullGo: true,
    onFastPath: true,
  },
  verify: {
    id: 'verify',
    titleKey: 'node.verify',
    purpose: 'Run required OpenSpec/quality/guard checks and aggregate a fresh report.',
    prerequisites: [
      'implement tasks finished',
      'report environment available',
    ],
    actions: [
      'Run OpenSpec validate when required',
      'Run baseline C compile/test/coverage/static/format checks',
      'Run secret scan and guard',
      'Fast path must run regression tests',
      'Aggregate structured report bound to baseline, tools, workspace, revision',
      'Check report freshness',
    ],
    artifacts: ['structured quality/guard/openspec report'],
    completion: [
      'All required checks passed',
      'Report not stale',
    ],
    failure: [
      'Any required failure → return to implement (T11)',
      'Tool missing → tool_unavailable blocked',
      'Evidence changed → drift (T12)',
    ],
    entries: ['auto transition', '/baf-verify', 'baf verify', 'Tab'],
    routePhase: 'verify',
    onFullGo: true,
    onFastPath: true,
  },
  archive: {
    id: 'archive',
    titleKey: 'node.archive',
    purpose: 'Human-confirmed atomic archive or final bug record.',
    prerequisites: [
      'verify passed with no drift',
      'human confirmation',
    ],
    actions: [
      'Show change summary, verify results, and audit refs',
      'Request human confirmation',
      'Atomically archive via OpenSpec adapter (full-go) or write final bug record (fast path)',
      'Write final projection state',
    ],
    artifacts: ['archived change / final record', 'summary', 'final projection'],
    completion: [
      'Archive completed atomically; success cannot be faked',
    ],
    failure: [
      'Keep the change recoverable; no half-archived state',
      'Retries must be idempotent',
    ],
    entries: ['/baf-archive', 'Tab confirm archive'],
    routePhase: 'archive',
    onFullGo: true,
    onFastPath: true,
  },
  drift: {
    id: 'drift',
    titleKey: 'node.drift',
    purpose: 'Handle evidence changes without silently repairing state.',
    prerequisites: [
      'Active change',
      'Detected evidence change (files/branch/baseline/spec/composition/report)',
    ],
    actions: [
      'Mark affected stages as drifted',
      'Require re-verify or user reconfirmation',
      'Return to the earliest affected node (T13)',
    ],
    artifacts: ['drift evidence', 'earliest-affected pointer'],
    completion: [
      'Evidence restored or user reconfirmed',
      'Target stage taken from evidence; unfinished/invalidated stages are not skipped',
    ],
    failure: [
      'Do not silently auto-fix',
      'OpenSpec files win over projection index on conflict',
    ],
    entries: ['automatic on evidence change', 'Tab'],
    routePhase: 'drift',
    onFullGo: true,
    onFastPath: true,
  },
}
