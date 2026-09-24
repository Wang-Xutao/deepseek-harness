/**
 * Client-local wire types for the BAF 工作流 Tab (mirrors baf-core tab-view).
 * Kept browser-safe so the Client face never pulls Node modules from baf-core.
 */
export type WorkflowNodeId =
  | 'intake'
  | 'open'
  | 'clarify'
  | 'design'
  | 'plan'
  | 'implement'
  | 'verify'
  | 'archive'
  | 'drift'

export type TerminalStateId = 'completed' | 'abandoned'

/** Mandatory customer-confirmation gate the change is parked on (§18.5). */
export type ConfirmGateId = 'design-to-plan' | 'verify-to-archive'

/** One path lane in the §18.4.3 dual-lane view. */
export interface WorkflowTabLaneView {
  readonly id: 'bug-fix-path' | 'full-go-path'
  readonly nodes: readonly WorkflowNodeId[]
  /** Status **within this lane's slice** of the event log, not the live one. */
  readonly status: Readonly<Partial<Record<WorkflowNodeId, NodeStatusId>>>
  readonly labelKey: string
}

/** The T15 escalation edge joining the two lanes (§18.4.3). */
export interface WorkflowTabUpgradeEdgeView {
  readonly from: WorkflowNodeId
  readonly to: WorkflowNodeId
  readonly at: string
  readonly cause: string
  readonly labelKey: string
}

/** Dual-lane payload; present only after a `mode-upgraded` event. */
export interface WorkflowTabLanesView {
  readonly lanes: readonly WorkflowTabLaneView[]
  readonly upgrade: WorkflowTabUpgradeEdgeView
  /** Pre-upgrade artifacts, kept for traceability (§18.4.3). */
  readonly preservedArtifacts: readonly string[]
}

export type NodeStatusId =
  | 'locked'
  | 'available'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'drifted'
  | 'skipped'
  | 'template'

export interface WorkflowTabNodeView {
  readonly id: WorkflowNodeId
  readonly status: NodeStatusId
  readonly catalog: {
    readonly id: WorkflowNodeId
    readonly titleKey: string
    readonly purpose: string
    readonly prerequisites: readonly string[]
    readonly actions: readonly string[]
    readonly artifacts: readonly string[]
    readonly completion: readonly string[]
    readonly failure: readonly string[]
    readonly entries: readonly string[]
  }
  readonly onPath: boolean
  readonly reasonCodes?: readonly string[]
  readonly artifacts?: readonly string[]
  readonly detail?: string
  readonly metrics?: {
    readonly durationMs?: number
    readonly inputTokens?: number
    readonly outputTokens?: number
  }
  readonly transitionsIn: readonly { id: string; condition: string; from: WorkflowNodeId | null }[]
  readonly transitionsOut: readonly {
    id: string
    condition: string
    to: WorkflowNodeId | TerminalStateId
  }[]
}

export interface WorkflowTabView {
  readonly empty: boolean
  readonly changeId: string | null
  readonly mode: string
  readonly current: WorkflowNodeId | TerminalStateId | null
  readonly intake?: {
    readonly changeId: string
    readonly kind: string
    readonly mode: string
    readonly affectedScope: string
    readonly confidence: number
    readonly reasonCodes: readonly string[]
    readonly openspecRequired: boolean
    readonly requiresUserConfirmation: boolean
    readonly confirmation: string
    readonly summary: string
  }
  readonly nodes: readonly WorkflowTabNodeView[]
  readonly graph: {
    readonly mode: string
    readonly nodes: readonly {
      readonly id: WorkflowNodeId | TerminalStateId
      readonly column: number
      readonly row: number
      readonly onPath: boolean
    }[]
    readonly edges: readonly {
      readonly id: string
      readonly from: WorkflowNodeId | null
      readonly to: WorkflowNodeId | TerminalStateId
      readonly kind: string
      readonly condition: string
    }[]
  }
  readonly projectionVersion: number
  readonly updatedAt?: string
  readonly sourceRevision?: string
  readonly baselineId?: string
  readonly openspecSkipped?: {
    readonly skipped: boolean
    readonly reasonCodes: readonly string[]
  }
  readonly changes: readonly {
    changeId: string
    mode: string
    current: WorkflowNodeId | TerminalStateId
  }[]
  readonly selectedChangeId: string | null
  readonly actions: readonly {
    readonly id: string
    readonly enabled: boolean
    readonly reason?: string
    readonly target?: WorkflowNodeId | TerminalStateId
    readonly labelKey: string
  }[]
  readonly blockedReason?: string
  readonly metrics?: {
    readonly totalDurationMs?: number
    readonly totalInputTokens?: number
    readonly totalOutputTokens?: number
  }
  /** Set while the change is parked on gate A/B (§18.5). */
  readonly gate?: {
    readonly id: ConfirmGateId
    readonly node: WorkflowNodeId
    readonly actionKey: string
    /** §22 registered gateId (`design-confirm` / `verify-archive`) — lets the
     * Tab dispatch the click back through `gateResolve`. */
    readonly gateId?: string
    /** §22 question, verbatim from the registry — Tab card body. */
    readonly question?: string
    /** §22 registered options, in registry order — rendered as one button each
     * so the Tab is equivalent to the slash/CLI option list (each option maps
     * to a single registered slash command; the host validates the pair). */
    readonly options?: readonly { readonly id: string; readonly label: string }[]
  }
  /**
   * Pending decision gate — workspace-scoped `scaffold` (no baseline) or,
   * 【变更】2026-09-23 (demo2 user issue #2), the change-scoped
   * `intake-classify` resting point (a change parked at a pending
   * classification). The Tab renders one button per option at the top of the
   * workflow page, mirroring the session dialogs so the two surfaces are
   * equivalent (§22.14 principle: card = button row). Clicks dispatch back
   * through `gateResolve` with `changeId` when the gate is change-scoped.
   */
  readonly pendingGate?: {
    readonly gateId: 'scaffold' | 'intake-classify'
    readonly changeId?: string
    readonly question: string
    readonly options: readonly { readonly id: string; readonly label: string }[]
    /** Extra context lines under the question (intake-classify: the verdict). */
    readonly detail?: readonly string[]
  }
  /** Set after a T15 escalation, so the Tab draws both paths (§18.4.3). */
  readonly lanes?: WorkflowTabLanesView
  /**
   * 【变更】2026-09-24 (demo6 问题 2): the plan ledger's frozen file allowlist,
   * attached once the plan stage completed (the rail's 影响范围 reads the real
   * file count from it). Absent before plan / on unreadable ledgers.
   */
  readonly planAllowlist?: readonly string[]
  /** Set while the change is parked in drift, so the Tab offers a rollback (§19.5). */
  readonly resume?: {
    readonly anchor: WorkflowNodeId
    /** Legal targets, latest-first; index 0 is the recommended default. */
    readonly candidates: readonly WorkflowNodeId[]
  }
  /**
   * Customer-editable artifacts of the focused change, one row per file in
   * stage order (2026-09-21 §22 follow-up). The rail renders one
   * open-in-sidebar button per row; `missing` rows disable the button and
   * carry the fill-work list instead.
   */
  readonly artifacts?: readonly {
    readonly file: string
    readonly path: string
    /** 【变更】2026-09-23 (demo5 issue #4): `planned` — tasks.md 计划完成、实现未完成的中间态. */
    readonly state: 'missing' | 'template' | 'planned' | 'filled'
    readonly missing: readonly string[]
  }[]
  /**
   * Whether the strip 「推进」 button may advance the change right now
   * (2026-09-22 user report #4): `ready` mirrors the current node's file gate
   * (the same judgment /baf-go runs), `missing` carries the customer-facing
   * gap lines for the disabled state. Absent on empty/blocked views — the
   * button hides rather than free-running.
   */
  readonly advance?: {
    readonly ready: boolean
    readonly missing: readonly string[]
  }
}

/**
 * 【变更】2026-09-23 (user issue #6): 变更总览 dashboard row — one per change
 * (active and terminal), mirroring `WorkflowDashboardRow` in baf-core.
 */
export interface WorkflowDashboardRow {
  readonly changeId: string
  readonly mode: 'full-go-path' | 'bug-fix-path' | 'clarify-required'
  readonly current: WorkflowNodeId | TerminalStateId
  /** Set only for terminal rows. */
  readonly endedAt?: string
  /** Plan-ledger task rollup (absent when no readable ledger). */
  readonly tasks?: { readonly done: number; readonly total: number }
  readonly durationMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
}

/** The dashboard payload: every change row, newest first, plus summary tiles. */
export interface WorkflowDashboardView {
  readonly rows: readonly WorkflowDashboardRow[]
  readonly summary: {
    readonly active: number
    readonly archived: number
    readonly abandoned: number
    readonly tasksDone: number
    readonly tasksTotal: number
  }
}

/** Empty template used when Remote is unavailable — still shows the full graph. */
export { buildClientTemplateTabView as buildClientEmptyTabView } from './graph-template.ts'
