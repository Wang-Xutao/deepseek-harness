/**
 * BAF workflow Tab Remote request types.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/types
 */

import type {
  TerminalState, WorkflowDashboardRow, WorkflowNode, WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Mirrors `WorkflowMode` from baf-core (declared locally to avoid pulling
 * the full intake module across the Remote boundary).
 */
export type BafWorkflowMode = 'full-go-path' | 'bug-fix-path' | 'clarify-required'

/** Request carrying the session whose cwd owns the projection. */
export interface BafWorkflowSessionRequest {
  readonly sessionId: SessionId
  readonly changeId?: string
}

/** Confirm / reject intake for one change. */
export interface BafWorkflowChangeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  /**
   * 【变更】2026-09-25 (用户需求 工作流 1): advance 的 Tab 顶部对话框已经是
   * 客户确认，置 true 时 host 走 confirm 正向路径、不再弹第二次会话式
   * 确认框（派单通道保留，工单照发）。confirmIntake / rejectIntake 忽略它。
   */
  readonly skipAsk?: boolean
}

/** Start intake from a free-form description. */
export interface BafWorkflowStartIntakeRequest {
  readonly sessionId: SessionId
  readonly description: string
}

/** Request a legal transition. */
export interface BafWorkflowTransitionRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly to: WorkflowNode | TerminalState
  /**
   * JSON-safe evidence payload attached to the transition. The host flattens
   * arrays into repeated `key=value` pairs (the `driveClassify` parser
   * already understands multi-valued `file=` for fast-path), and skips
   * `undefined` / `null`. Scalars are stringified as-is.
   */
  readonly evidence?: Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]>>
}

/**
 * Drift rollback (§19.5 / T13).
 *
 * Omitting `node` re-reads the candidate set — the Tab calls it that way when
 * the customer opens the 「复位到…」菜单, so the list on screen is the freshly
 * detected one. Passing `node` drives the rollback; the pipeline re-validates
 * the target against its own candidate set and rejects an illegal one.
 */
export interface BafWorkflowResumeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly node?: WorkflowNode
}

/**
 * One row of the workspace change Dashboard (`listChanges` Remote return).
 *
 * Mirrors `ProjectionIndexEntry` from baf-workflow; declared here as the
 * typert boundary contract so the wire payload stays owned by this package.
 */
export interface BafWorkflowChangeRow {
  readonly changeId: string
  readonly mode: BafWorkflowMode
  readonly current: WorkflowNode | TerminalState
  readonly seq: number
  readonly updatedAt: string
}

/**
 * §22.14 Tab gate-card resolve: dispatch the registered command for a chosen
 * `(gateId, optionId)` pair. The Tab renders the options straight from
 * `WorkflowTabGate.options` / `WorkflowTabPendingGate.options` and posts the
 * customer click back as this request.
 *
 * `changeId` is required for change-scoped gates (intake-classify,
 * design-confirm, verify-archive, abandon, resume) and unused for the
 * workspace-scoped scaffold gate — passing it for scaffold is harmless.
 * The host validates the pair against §22 GATE_REGISTRY; unknown `gateId` /
 * `optionId` returns a refusal card (the workflow never re-dispatches
 * something the registry did not advertise).
 */
export interface BafWorkflowGateResolveRequest {
  readonly sessionId: SessionId
  readonly changeId?: string
  readonly gateId: string
  readonly optionId: string
  /**
   * 【变更】2026-09-23 (demo2 user issue #2): per-call `key=value` tokens the
   * host splices into the dispatched slash (§22.17 J) — the Tab's bug-fix
   * five-field form rides the 确认 · 缺陷修复路径 click so one button settles
   * path + fields, exactly like the dialog's confirm dispatch.
   */
  readonly extraArgs?: readonly string[]
}

/**
 * 【变更】2026-09-28 (用户问题 1.7 Tab parity): submit a revision request from
 * the workflow Tab's own decision surfaces (the advance dialog, the parked
 * gate banner) — the ones with no ask carrier to answer. The host maps the
 * request onto the SAME revision dispatch the session dialog's `custom`
 * answer takes: a `gate-revise` work order against the gate's revisable
 * artifact; the gate re-pops after the model reworks the document.
 *
 * `gateId` (banner) and `node`+`mode` (advance dialog — the host derives the
 * stage's advance gate from them) are alternatives; at least one must be set.
 */
export interface BafWorkflowGateReviseRequest {
  readonly sessionId: SessionId
  /** Parked gate id (design-confirm / verify-archive). */
  readonly gateId?: string
  /** Completed stage the advance dialog rests on (open / clarify / … / implement). */
  readonly node?: WorkflowNode
  /** The change's mode (bug-fix open quotes the clipped proposal.md conditions). */
  readonly mode?: BafWorkflowMode
  readonly changeId?: string
  /** The customer's modification request (non-empty). */
  readonly text: string
}

/**
 * 【变更】2026-10-07 (九点批 问题 2/4): what the gate click would dispatch on —
 * the advance dialog / gate cards render a 「确认后派单：<档位>·<模型>」 line
 * from this preview. Same pure core a real dispatch runs (`tierRouteSelection`),
 * but no pin and no audit: the decision previewed is the decision that would
 * run, not one that ran.
 */
export type BafWorkflowRoutePreview =
  | {
    readonly state: 'off'
    /** Why no routing: config off, or the session is not on the Auto entry. */
    readonly why: 'config' | 'session'
  }
    | { readonly state: 'unresolved' }
    | {
      readonly state: 'routed'
      readonly tier: 'high' | 'mid' | 'low'
      readonly reason: 'keyword' | 'phase' | 'verify-escalation'
      readonly provider: string
      readonly model: string
    }

/** `routePreview` request — session + change + the stage the gate rests on. */
export interface BafWorkflowRoutePreviewRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly node: WorkflowNode
}

/**
 * 【变更】2026-10-21 (批次十 测试流图): the coverage half of the session Tab's
 * 测试流图 verdict — a defensive read of `.baf/reports/ut-coverage.json`
 * (written by the quality pipeline's check chain; every field optional).
 */
export interface BafWorkflowTestFlowCoverage {
  /** Line coverage in percent, when the report carries it. */
  readonly line?: number
  /** The gate's minimum in percent, when the report carries it. */
  readonly minimum?: number
  /** The gate verdict the report settled on. */
  readonly passed?: boolean
  /** Report timestamp (ISO-ish), when present. */
  readonly generatedAt?: string
}

/**
 * The static-analysis half — a defensive read of
 * `.baf/reports/static-analysis.json` (cpplint + cppcheck run inside one
 * `/baf-quality lint`; the JSON carries no per-tool split, so the 测试流图
 * feeds the same read to both lint nodes with a footnote).
 */
export interface BafWorkflowTestFlowStatic {
  readonly errors?: number
  readonly passed?: boolean
  readonly generatedAt?: string
}

/**
 * The full `testFlowStatus` payload: what the session's 测试流图 paints.
 * `no-cwd` (session without a workspace) renders the tab's guidance hint
 * instead of a fake all-idle chart.
 */
export interface BafWorkflowTestFlowStatus {
  readonly status: 'ready' | 'no-cwd'
  readonly coverage?: BafWorkflowTestFlowCoverage
  readonly staticAnalysis?: BafWorkflowTestFlowStatic
  /** Gate threshold from the workspace quality config (0-1 fraction). */
  readonly thresholdLine?: number
  /** Gate mode (`shadow` = observe-only). */
  readonly gateMode?: string
  /** Workspace-relative HTML coverage report path (from the same config). */
  readonly reportHtmlRel?: string
  /** Whether that HTML report exists on disk right now. */
  readonly reportHtmlExists?: boolean
  /**
   * 【变更】2026-10-22 (批次十三 4): the workspace's 测试流 stage switches
   * (工作流 · 测试流 canvas), keyed by stage id — mirrors the settings
   * package's `.baf/quality/test-flow.json` envelope. Absent when the
   * file doesn't exist yet (all-on defaults apply client-side).
   */
  readonly stages?: Readonly<Record<string, BafWorkflowTestFlowStageToggle>>
}

/** One stage's switch pair inside `BafWorkflowTestFlowStatus.stages`. */
export interface BafWorkflowTestFlowStageToggle {
  readonly enabled: boolean
  readonly haltOnError: boolean
}

/**
 * 【变更】2026-10-22 (批次十二 2.1): `runTestFlowStage` request — a node's
 * 运行 button. `stage` picks the baf-wrapped command (testFlowStageCommand);
 * `arg` carries the format node's configurable path (empty otherwise). All
 * fields required (typert arity is exact — no optional params).
 */
export interface BafWorkflowStageRunRequest {
  readonly sessionId: SessionId
  readonly stage: 'build' | 'test' | 'instrument' | 'report' | 'gate' | 'lint' | 'analyze' | 'format'
  /** Extra argument (the format node's configured path; '' for none). */
  readonly arg: string
}

/** `runTestFlowStage` result — the spawned command's real outcome. */
export interface BafWorkflowStageRunResult {
  readonly status: 'ready' | 'no-cwd' | 'tool-missing' | 'disabled'
  /** The command the host actually spawned (echoed for the result card). */
  readonly command?: string
  readonly exitCode?: number
  /** Truncated combined output tail. */
  readonly output?: string
  /** Wall-clock duration in ms. */
  readonly durationMs?: number
}

/**
 * 【变更】2026-10-22 (批次十三 1/4): `runTestFlowChain` request — the 测试流图's
 * 全部运行 button. Same shape as a single-stage run: `arg` feeds the format
 * node's configured path. All fields required (typert arity).
 */
export interface BafWorkflowChainRunRequest {
  readonly sessionId: SessionId
  readonly arg: string
}

/** One stage's outcome inside a `runTestFlowChain` sweep. */
export interface BafWorkflowChainStageOutcome {
  readonly stage: 'build' | 'test' | 'instrument' | 'report' | 'gate' | 'lint' | 'analyze' | 'format'
  /** Whether the stage ran to a zero exit (or was skipped as disabled). */
  readonly ok: boolean
  /** True when the stage was OFF in the test-flow config and skipped. */
  readonly skipped?: boolean
  /** True when the failure was classified as a missing tool (not a real run failure). */
  readonly toolMissing?: boolean
  readonly exitCode?: number
  readonly command?: string
  /** Truncated combined output tail. */
  readonly output?: string
  readonly durationMs?: number
}

/** `runTestFlowChain` result — the whole enabled chain in canonical order. */
export interface BafWorkflowChainRunResult {
  readonly status: 'ready' | 'no-cwd'
  readonly stages: readonly BafWorkflowChainStageOutcome[]
  /** Wall-clock duration of the whole sweep in ms. */
  readonly durationMs: number
}

/**
 * 【变更】2026-10-22 (批次十二 2.6): `readWorkspaceFile` request — one
 * workspace-relative config file's preview payload (the detail pane's 配置文件
 * chips). All fields required (typert arity).
 */
export interface BafWorkflowFileReadRequest {
  readonly sessionId: SessionId
  /** Workspace-relative path (validated: no absolute, no `..` traversal). */
  readonly path: string
}

/** `readWorkspaceFile` result — full text or its absence, size-capped. */
export interface BafWorkflowFileReadResult {
  readonly status: 'ready' | 'missing' | 'unreadable'
  /** Absolute path (modal header + the open button). */
  readonly path?: string
  /** Full text (capped at {@link WORKSPACE_FILE_PREVIEW_CAP} chars). */
  readonly content?: string
  readonly reason?: string
}

/**
 * 【变更】2026-10-25 (批次二十四 3): `formatDraft` request — the composer's raw
 * draft plus the session whose model arranges it. The session is what names the
 * route: the formatter runs on the conversation's OWN model, so the answer
 * comes from the model the user is already talking to (no second provider, no
 * config to pick).
 */
export interface BafWorkflowDraftFormatRequest {
  readonly sessionId: SessionId
  /** The author's raw draft text. */
  readonly draft: string
}

/**
 * `formatDraft` result — the model's arranged Markdown, or the reason the call
 * could not run. `no-model` means the session has no routed model yet (a fresh
 * session never sent a request); the caller then falls back to the local
 * arranger instead of showing an error.
 */
export type BafWorkflowDraftFormatResult =
  | {
    readonly status: 'ready'
    /** The arranged draft (the model's Markdown answer, sanitized). */
    readonly text: string
    /** The route that produced it. */
    readonly provider: string
    readonly model: string
  }
  | {
    readonly status: 'unavailable'
    /** Machine-readable cause: `no-model`, `failed` or `empty`. */
    readonly reason: string
  }

/**
 * 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 payload — a read-only
 * projection of both gate layers (the confirm-gate registry and the per-stage
 * completion gates), declared here as the typert boundary contract.
 */
export interface BafWorkflowGateOptionRow {
  readonly id: string
  readonly label: string
  readonly command: string
}

/** One 客户确认门 row (a GATE_REGISTRY entry, verbatim). */
export interface BafWorkflowGateConfirmRow {
  readonly id: string
  readonly title: string
  readonly question: string
  readonly options: readonly BafWorkflowGateOptionRow[]
  /** Stage node the gate rests on (advance gates); absent for one-shot gates. */
  readonly node?: string
  /** Bug-fix-path variant of the same rest (open only). */
  readonly bugFix?: boolean
  /** Registry marker that options are populated at runtime (bind-workflow). */
  readonly dynamicOptions?: string
}

/** One 阶段完成门 row: what a stage must produce before it may advance. */
export interface BafWorkflowGateStageRow {
  readonly node: string
  readonly gateFn: string
  readonly artifact: string
  readonly conditions: readonly string[]
  readonly advanceGateId?: string
  readonly note?: string
}

/** The full `gateOverview` payload. */
export interface BafWorkflowGateOverview {
  readonly confirmGates: readonly BafWorkflowGateConfirmRow[]
  readonly stageGates: readonly BafWorkflowGateStageRow[]
}

/**
 * §22.19 R5 — payload of `baf-workflow/projection-appended`. The interface
 * and the cordis Events declaration live with the projection domain in
 * dsh-baf-workflow (packages/baf/baf-workflow/src/projection-events.ts — a
 * leaf module) so the api-remotes forwarding allowlist and this client read
 * one type; re-exported here for the package's historical import site.
 */
export type { BafWorkflowProjectionAppended } from '@deepseek-ai/dsh-baf-workflow/projection-events'

/**
 * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 「变更总览」 payload —
 * every change of the CURRENT project, the abandoned ones included.
 *
 * The project scope comes from the workspace the newest session runs in (the
 * same resolution the 工程规范 settings row uses), so the page answers
 * 「本项目有哪些变更」 without being bound to one conversation.
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
    /** Every change row, newest first (the dashboard rollup). */
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
 * 变更总览 tab's row drill-down (the flow graph + the full history).
 */
export interface BafWorkflowChangeDetailRequest {
  /** The change to describe. */
  readonly changeId: string
  /**
   * 【变更】2026-10-26 (用户问题 2): the workspace root to read the change
   * from. The client passes the MAIN-VIEW session's cwd so the overview
   * follows the workspace the user is actually looking at; omitted keeps the
   * host's newest-live-session fallback.
   */
  readonly cwd?: string
}

/**
 * 【变更】2026-10-26 (用户问题 2): optional request for the workspace-scoped
 * 变更总览 rollup. `cwd` pins the read to the main-view session's workspace;
 * omitted keeps the host's newest-live-session fallback.
 */
export interface BafWorkflowChangeOverviewRequest {
  /** Absolute workspace root to read the rollup from. */
  readonly cwd?: string
}

/**
 * 【变更】2026-10-27 (同步产物): request for the artifact-sync dispatch — the
 * customer clicked 同步 on a document an upstream edit made stale.
 *
 * `cwd` pins the read to the main-view session's workspace; omitted keeps the
 * host's newest-live-session fallback (the same rule `changeDetail` uses).
 *
 * 【变更】2026-10-27 (批次三十一): `sessionId` is REQUIRED. The work order must
 * land in the conversation the customer clicked from — the workspace's home
 * session can be a different one, and an order sent there reads as a dead
 * click in the customer's own conversation.
 */
export interface BafWorkflowSyncRequest {
  /** The session the customer clicked 同步 in — the order lands here. */
  readonly sessionId: SessionId
  readonly changeId: string
  /** The workspace root to read the change from (the main-view session's cwd). */
  readonly cwd?: string
}

/**
 * 【变更】2026-10-27 (批次三十): request for the workflow PAUSE control — the
 * 工作流图's 暂停/继续 button.
 *
 * `paused: true` brakes the workflow (no automatic gate pops, no automatic
 * work orders); `paused: false` releases it and hands the outstanding gap back
 * to the model.
 */
export interface BafWorkflowPauseRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  /** True to pause, false to resume. */
  readonly paused: boolean
}

/**
 * 【变更】2026-10-27 (批次三十): the outcome of a pause control request.
 *
 * `resumed` reports whether the resume drive actually moved the workflow
 * (the gate popped / the work order went out); `unavailable` carries why it
 * could not (no live session, no dispatch channel).
 */
export type BafWorkflowPauseResult =
  | { readonly status: 'ok'; readonly paused: boolean }
  | { readonly status: 'unavailable'; readonly reason: string }

/**
 * 【变更】2026-10-27 (同步产物): result of the artifact-sync dispatch.
 *
 * `dispatched` names the stale stages the work order covers (the order is
 * addressed at the EARLIEST one — every later stage follows it). `queued` means
 * the very same order is already on its way, so nothing new was sent.
 * `unavailable` carries why no order could be sent (no live session, the model
 * is busy).
 *
 * 【变更】2026-10-27 (批次三十一): `queued` is its own status. The old shape
 * answered `dispatched` for a deduped order too, so the client reported a work
 * order that no model ever received.
 */
export type BafWorkflowSyncResult =
  | { readonly status: 'no-workspace' }
  | { readonly status: 'no-drift' }
  | { readonly status: 'dispatched'; readonly nodes: readonly string[] }
  | { readonly status: 'queued'; readonly nodes: readonly string[] }
  | { readonly status: 'unavailable'; readonly reason: string }

/**
 * 【变更】2026-10-24 (批次十九 1.3): one projection event, flattened for the
 * change-detail modal's history list. The host owns the event union; the
 * client renders the flat shape and localizes the `type` itself.
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
 * payload — the same projection view the session's 工作流图 tab renders (the
 * stage graph, the artifacts, the intake card) plus the change's event
 * history, so the project-level page can open a change WITHOUT a conversation.
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
