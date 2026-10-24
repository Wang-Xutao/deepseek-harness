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

/** 多模型路由 tier (mirror of baf-core `RouteTier`; M3 批次C). */
export type RouteTier = 'high' | 'mid' | 'low'

/**
 * One phase row of the「当前路由」fold (mirror of baf-core
 * `TierRoutePhaseRow`; M3 批次C): preferred tier from the config, actual from
 * the session's last `baf/route-resolved` audit.
 */
export interface WorkflowTabRoutePhaseRow {
  readonly phase: WorkflowNodeId
  readonly preferredTier: RouteTier
  readonly preferred: { readonly provider: string; readonly model: string }
  readonly actual?: {
    readonly provider: string
    readonly model: string
    readonly source: string
    /** Effective tier when the turn was tier-routed (pre-M2 audits omit it). */
    readonly tier?: RouteTier
    /** Whether the frozen keyword tier decided the turn, or the M4 verify-escalation floor raised it. */
    readonly tierReason?: 'keyword' | 'phase' | 'verify-escalation'
    readonly fallbackActive: boolean
    readonly at: string
  }
}

/** Mirror of baf-core `WorkflowTabRouteStatus` (M3 批次C; sessionModel 九点批 问题 5). */
export type WorkflowTabRouteStatus =
  | { readonly state: 'off' }
  | {
    readonly state: 'routed'
    readonly tiers: Readonly<Record<RouteTier, { readonly provider: string; readonly model: string }>>
    readonly phases: readonly WorkflowTabRoutePhaseRow[]
    /**
     * 【变更】2026-10-07 (九点批 问题 5): the session's CURRENT raw model (last
     * `request/header` epoch) + whether it is the Auto pseudo entry — the
     * empty state explains itself (Auto engaged vs. pinned) instead of a
     * bare「暂无派单路由」.
     */
    readonly sessionModel?: {
      readonly provider: string
      readonly model: string
      readonly auto: boolean
    }
    /**
     * 【变更】2026-10-07 (九点批 问题 4): last audit per changeId — the
     * 变更总览 rows badge each change with the tier·model that last served
     * it (mirror of baf-core `TierRouteChangeRow`).
     */
    readonly byChange?: Readonly<Record<string, WorkflowTabRouteChangeRow>>
  }

/** One change's last-served model (九点批 问题 4 dashboard badge; baf-core mirror). */
export interface WorkflowTabRouteChangeRow {
  readonly provider: string
  readonly model: string
  readonly tier?: RouteTier
  readonly at: string
}

/**
 * 【变更】2026-10-07 (九点批 问题 2): what a gate/advance confirm would
 * dispatch the next work order on — the client mirror of the host's
 * routePreview payload. `off` carries WHY (config disabled vs. session not on
 * Auto); only `routed` renders a badge line.
 */
export type WorkflowTabRoutePreview =
  | { readonly state: 'off'; readonly why: 'config' | 'session' }
  | { readonly state: 'unresolved' }
  | {
    readonly state: 'routed'
    readonly tier: RouteTier
    readonly reason: string
    readonly provider: string
    readonly model: string
  }

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
  /** 【变更】2026-09-30 (demo31 问题 4): bug-fix 路径裁剪掉的 full-go 节点（clarify/design/plan）——已裁剪，流程经过时直接跳过. */
  | 'clipped'

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
  /**
   * 【变更】2026-10-24 (批次十九 1.4): ISO timestamp of the change's FIRST
   * projection event — its start time. The strip shows it next to the elapsed
   * duration.
   */
  readonly startedAt?: string
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
    /** 【变更】2026-09-25 (用户需求 工作流 3): host epoch-ms stamp of the derivation — the per-second timer anchors here. */
    readonly computedAt?: number
    /** 【变更】2026-09-28 (用户问题 4 停表): false = the change rests on a customer decision;
     * the live timer freezes (wait time is not workflow time). */
    readonly running?: boolean
  }
  /**
   * 多模型路由 M3 批次C — the「当前路由」fold: preferred tiers from the config,
   * actual/fallback from the driving session's route audits. `off` renders
   * nothing (M3 验收: enabled=false 与今天一致).
   */
  readonly routeStatus?: WorkflowTabRouteStatus
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
    /** 【变更】2026-09-23 (demo5 issue #4): `planned` — tasks.md 计划完成、实现未完成的中间态.
     * 【变更】2026-09-28 (用户问题 3): `clipped` — bug-fix 路径裁剪的 full-go 产物行（已裁剪，无打开按钮）. */
    readonly state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'
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

/** One generated-artifact chip of a dashboard row (mirrors baf-core, issue 3). */
export interface WorkflowDashboardArtifact {
  readonly file: string
  readonly path: string
  readonly state: 'template' | 'planned' | 'filled'
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
  /** 【变更】2026-09-29 (demo23 问题 3): files the change actually generated. */
  readonly artifacts?: readonly WorkflowDashboardArtifact[]
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

/**
 * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 「变更总览」 payload
 * (client mirror of the host's `BafWorkflowChangeOverviewResult`) — every
 * change of the current project, the abandoned ones included.
 */
export type BafWorkflowChangeOverviewResult =
  | {
    /** No live session names a workspace — the page shows its empty state. */
    readonly status: 'no-workspace'
  }
  | {
    readonly status: 'ready'
    /** Absolute workspace root the rows were read from. */
    readonly cwd: string
    /** Every change row, newest first. */
    readonly rows: readonly WorkflowDashboardRow[]
    /** Header rollups (active / archived / abandoned / task counts). */
    readonly summary: {
      readonly active: number
      readonly archived: number
      readonly abandoned: number
      readonly tasksDone: number
      readonly tasksTotal: number
    }
  }

/**
 * 【变更】2026-10-24 (批次十九 1.3): one change's detail request — the
 * 变更总览 tab's row drill-down (client mirror of the host's request).
 */
export interface BafWorkflowChangeDetailRequest {
  /** The change to describe. */
  readonly changeId: string
}

/**
 * 【变更】2026-10-24 (批次十九 1.3): one flattened projection event (client
 * mirror of the host's history row).
 */
export interface BafWorkflowChangeHistoryEntry {
  /** ISO timestamp of the event. */
  readonly at: string
  /** The projection event type (e.g. `stage-completed`). */
  readonly type: string
  /** The stage the event belongs to, when it names one. */
  readonly node?: string
  /** The confirm gate the event parked on, when it names one. */
  readonly gate?: string
  /** Why the event happened (failure / drift / rejection reason). */
  readonly reason?: string
  /** A short extra line (artifact list, mode change, …). */
  readonly detail?: string
}

/**
 * 【变更】2026-10-24 (批次十九 1.3): the 变更总览 tab's per-change drill-down
 * payload (client mirror of the host's `BafWorkflowChangeDetailResult`).
 */
export type BafWorkflowChangeDetailResult =
  | {
    /** No live session names a workspace — the page shows its empty state. */
    readonly status: 'no-workspace'
  }
  | {
    /** The change id is not in this workspace's projection. */
    readonly status: 'unknown-change'
    readonly changeId: string
  }
  | {
    readonly status: 'ready'
    /** Absolute workspace root the change was read from. */
    readonly cwd: string
    readonly changeId: string
    /** The change's projection view (graph, nodes, artifacts, intake). */
    readonly view: WorkflowTabView
    /** Every projection event of the change, oldest first. */
    readonly history: readonly BafWorkflowChangeHistoryEntry[]
  }

/** Empty template used when Remote is unavailable — still shows the full graph. */
export { buildClientTemplateTabView as buildClientEmptyTabView } from './graph-template.ts'

/*
 * 【变更】2026-10-21 (批次十 测试流图): the session Tab「测试流图」— client mirror
 * of the host's `testFlowStatus` payload (defensive reads of the workspace's
 * `.baf/reports/*.json` + quality config) and the same 8-step execution order
 * baf-quality's TEST_FLOW_STEPS owns. Labels ride the locale keys; a spec
 * asserts id/tool/required parity against the host list.
 */

/** Coverage half of the mirror (`ut-coverage.json`, every field optional). */
export interface WorkflowTabTestFlowCoverage {
  readonly line?: number
  readonly minimum?: number
  readonly passed?: boolean
  readonly generatedAt?: string
}

/** Static-analysis half (`static-analysis.json`; cpplint+cppcheck run as one lint). */
export interface WorkflowTabTestFlowStatic {
  readonly errors?: number
  readonly passed?: boolean
  readonly generatedAt?: string
}

/** The full `testFlowStatus` mirror. */
export interface WorkflowTabTestFlowStatus {
  readonly status: 'ready' | 'no-cwd'
  readonly coverage?: WorkflowTabTestFlowCoverage
  readonly staticAnalysis?: WorkflowTabTestFlowStatic
  readonly thresholdLine?: number
  readonly gateMode?: string
  readonly reportHtmlRel?: string
  readonly reportHtmlExists?: boolean
  /**
   * 【变更】2026-10-22 (批次十三 4): the workspace's 测试流 stage switches
   * (工作流 · 测试流 canvas) — a stage whose `enabled` reads false renders
   * greyed-out with a disabled 运行 button. Absent = all-on defaults.
   */
  readonly stages?: Readonly<Record<string, WorkflowTabTestFlowStageToggle>>
}

/** One stage's switch pair inside `WorkflowTabTestFlowStatus.stages`. */
export interface WorkflowTabTestFlowStageToggle {
  readonly enabled: boolean
  readonly haltOnError: boolean
}

/** Step ids in the normative execution order (check 链 → lint → 最终 format). */
export type TestFlowStepId =
  | 'build' | 'test' | 'instrument' | 'report'
  | 'gate' | 'lint' | 'analyze' | 'format'

/** What one step's status dot renders. */
export type TestFlowStepState = 'passed' | 'failed' | 'idle'

/** One chart step: display fields only (the zh label lives in the locale keys). */
export interface WorkflowTabTestFlowStep {
  readonly id: TestFlowStepId
  readonly tool: string
  readonly required: boolean
  readonly command: string
  /**
   * 【变更】2026-10-22 (批次十二 2.6): workspace config files this step reads —
   * git-managed quality assets (project.yml / CPPLINT.cfg / …). Rendered as
   * preview-able chips in the detail pane (modal preview + sidebar open).
   */
  readonly configFiles: readonly string[]
}

/**
 * The 8 steps, mirroring baf-quality TEST_FLOW_STEPS in execution order.
 * 【变更】2026-10-22 (批次十二 2.4): every command is the baf-wrapped form —
 * the `baf-quality` CLI subcommand that owns the stage (raw ceedling/gcovr
 * strings are gone; the wrapper's own contract: test→ceedling test:all,
 * check→gcov 插桩+gcovr+门禁, lint→cpplint+cppcheck). format keeps the raw
 * `clang-format -i` (the wrapper has no format subcommand — the discipline's
 * final step is raw by design; 批次十二 2.5 makes its path configurable).
 */
export const TEST_FLOW_STEPS: readonly WorkflowTabTestFlowStep[] = [
  {
    id: 'build',
    tool: 'gcc',
    required: true,
    command: 'baf-quality test（gcc 编译 + 测试桩）',
    configFiles: ['project.yml'],
  },
  {
    id: 'test',
    tool: 'ceedling',
    required: true,
    command: 'baf-quality test',
    configFiles: ['project.yml', '.baf/quality/ceedling-config.json'],
  },
  {
    id: 'instrument',
    tool: 'gcov',
    required: true,
    command: 'baf-quality check（gcov 插桩）',
    configFiles: ['project.yml'],
  },
  {
    id: 'report',
    tool: 'gcovr',
    required: true,
    command: 'baf-quality check（gcovr 报告）',
    configFiles: ['.baf/quality/ceedling-config.json'],
  },
  {
    id: 'gate',
    tool: 'baf-quality',
    required: true,
    command: 'baf-quality check（覆盖率门禁）',
    configFiles: ['.baf/quality/ceedling-config.json'],
  },
  {
    id: 'lint',
    tool: 'cpplint',
    required: true,
    command: 'baf-quality lint（cpplint）',
    configFiles: ['CPPLINT.cfg'],
  },
  {
    id: 'analyze',
    tool: 'cppcheck',
    required: true,
    command: 'baf-quality lint（cppcheck）',
    configFiles: ['cppcheck-suppressions.xml'],
  },
  {
    id: 'format',
    tool: 'clang-format',
    required: true,
    command: 'clang-format -i <配置路径>',
    configFiles: ['.clang-format'],
  },
]

/**
 * 【变更】2026-10-22 (批次十二 2.1): one per-stage manual run's outcome — the
 * host Remote spawned the stage's baf-wrapped command in the workspace root
 * and this is what came back (exit code + captured tail; never a fabricated
 * verdict).
 */
export interface WorkflowTabStageRunResult {
  /**
   * ready = the command ran (exit 0 or not); missing = no workspace;
   * absent = the wrapper/tool was not found; disabled = the stage is off.
   */
  readonly status: 'ready' | 'no-cwd' | 'tool-missing' | 'disabled'
  /** The command the host actually spawned (echo for the result card). */
  readonly command?: string
  readonly exitCode?: number
  /** Truncated combined output tail. */
  readonly output?: string
  /** Wall-clock duration in ms. */
  readonly durationMs?: number
}

/**
 * 【变更】2026-10-22 (批次十三 1): the 全部运行 sweep's per-stage outcome —
 * `runTestFlowChain` walked the enabled stages in canonical order and this is
 * each one's verdict (skipped = OFF in the test-flow config, never spawned).
 */
export interface WorkflowTabChainStageOutcome {
  readonly stage: TestFlowStepId
  /** True = zero exit (or skipped-as-off). */
  readonly ok: boolean
  /** True when the stage was OFF and skipped. */
  readonly skipped?: boolean
  /** True when the failure was classified as a missing tool. */
  readonly toolMissing?: boolean
  readonly exitCode?: number
  readonly command?: string
  /** Truncated combined output tail. */
  readonly output?: string
  readonly durationMs?: number
}

/** The `runTestFlowChain` result mirror. */
export interface WorkflowTabChainRunResult {
  readonly status: 'ready' | 'no-cwd'
  readonly stages: readonly WorkflowTabChainStageOutcome[]
  /** Whole-sweep wall clock in ms. */
  readonly durationMs: number
}

/** 【变更】2026-10-22 (批次十二 2.6): one config file's preview payload. */
export interface WorkflowTabFileReadResult {
  readonly status: 'ready' | 'missing' | 'unreadable'
  /** Absolute path (for the open button + the modal header). */
  readonly path?: string
  /** Full text (size-capped host-side). */
  readonly content?: string
  readonly reason?: string
}

/** How one step resolved, plus the metric line the row appends (already localized by the view). */
// metric explicitly admits undefined: projectTestFlowSteps computes it from
// optional report fields, and exactOptionalPropertyTypes would reject the
// `string | undefined` assignment against a bare optional.
export interface TestFlowStepOutcome {
  readonly state: TestFlowStepState
  /** Extra fact for the row's metric slot (percent / error count / timestamp). */
  readonly metric?: string | undefined
}

/**
 * Pure projection: the status payload → per-step outcome. The check-chain
 * steps (build/test/instrument/report) share the coverage report's presence;
 * the gate reads its verdict; lint/analyze share the static report (cpplint +
 * cppcheck run inside ONE `/baf-quality lint`, so one JSON feeds both rows);
 * format keeps no on-disk report and stays idle with its discipline note.
 * @param status - the host payload.
 * @returns outcome per step id.
 */
export function projectTestFlowSteps(status: WorkflowTabTestFlowStatus | undefined): Readonly<Record<TestFlowStepId, TestFlowStepOutcome>> {
  // Object.fromEntries loses key literal types; every TEST_FLOW_STEPS id is a
  // TestFlowStepId so the Record shape holds — assert once, the return spread
  // below then overrides all eight keys explicitly.
  const empty = Object.fromEntries(TEST_FLOW_STEPS.map(step => [step.id, { state: 'idle' } as TestFlowStepOutcome])) as Record<TestFlowStepId, TestFlowStepOutcome>
  if (status === undefined || status.status !== 'ready') return empty
  const coverage = status.coverage
  const statics = status.staticAnalysis
  const chainState: TestFlowStepState = coverage === undefined ? 'idle' : 'passed'
  const gateState: TestFlowStepState = coverage === undefined
    ? 'idle'
    : coverage.passed === true
      ? 'passed'
      : coverage.passed === false
        ? 'failed'
        // Report present but no verdict field — 未判定, not a fake pass.
        : 'idle'
  const staticState: TestFlowStepState = statics === undefined
    ? 'idle'
    : statics.passed === true || statics.errors === 0
      ? 'passed'
      : statics.passed === false || (statics.errors ?? 0) > 0
        ? 'failed'
        : 'idle'
  const percent = (value: number | undefined): string | undefined =>
    value === undefined ? undefined : `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1)}%`
  // The report carries percents (line=83.3, minimum=80); thresholdLine from
  // the config is a 0-1 fraction — normalize both to display percents.
  const linePct = coverage?.line !== undefined ? `${coverage.line}%` : undefined
  const minPct = coverage?.minimum !== undefined
    ? `${coverage.minimum}%`
    : status.thresholdLine !== undefined ? percent(status.thresholdLine) : undefined
  return {
    ...empty,
    build: { state: chainState },
    test: { state: chainState },
    instrument: { state: chainState },
    report: {
      state: chainState,
      metric: coverage?.generatedAt,
    },
    gate: {
      state: gateState,
      metric: linePct === undefined && minPct === undefined ? undefined
        : `${linePct ?? '—'}（≥ ${minPct ?? '—'}）`,
    },
    lint: { state: staticState },
    analyze: {
      state: staticState,
      metric: statics?.errors === undefined ? statics?.generatedAt : `${statics.errors}`,
    },
    format: { state: 'idle' },
  }
}
