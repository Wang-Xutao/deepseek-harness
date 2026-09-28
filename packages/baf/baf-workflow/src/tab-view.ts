/**
 * Workspace-backed Tab view assembly (Host only).
 * @module @deepseek-ai/dsh-baf-workflow/tab-view
 */

import {
  buildEmptyTabView,
  confirmGateOf,
  statusToTabView,
  type AwaitingConfirmSnapshot,
  type ProjectionEvent,
  type WorkflowTabGate,
  type WorkflowTabLanes,
  type WorkflowTabPendingGate,
  type WorkflowTabResume,
  type WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GATE_REGISTRY } from './gate-cards.ts'
import { modeZh } from './command-format.ts'
import { deriveLanes } from './lanes.ts'
import { deriveWorkflowMetrics, type UsagePoint } from './metrics.ts'
import type { ProjectionStore } from './projection.ts'
import { pickActiveChange } from './projection.ts'
import { bugRecordGate, changeArtifactStatus, clarifyGate, designGate, implementGate, planGate, proposalGate, type GateInput, type GateOutcome } from './stages/gates.ts'
import { readLedger } from './stages/implement.ts'
import { parsePlanLedger } from './stages/plan-ledger.ts'
import type { WorkflowStatus } from '@deepseek-ai/dsh-baf-core'

export type {
  WorkflowTabAction,
  WorkflowTabNode,
  WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'

export { buildEmptyTabView, statusToTabView } from '@deepseek-ai/dsh-baf-core'

/** Workspace path where the governing baseline is expected. */
const WORKSPACE_BASELINE_PATH = '.baf/baseline.yml'

/**
 * Read a gate spec from the §22 registry as a `WorkflowTabGate` payload.
 * Pure projection — no I/O, no workflow state mutation. Falls back to the
 * `gateToTabView()` shape if the registry lacks the §22 fields (e.g. the
 * caller omits `gateId` in its gate payload, which only happens for
 * pre-P1 fixtures).
 *
 * §13 R5 — when the caller passes a `snapshot` captured onto the matching
 * `awaiting-confirm` event, that snapshot wins over the live registry.
 * This keeps replay honest: a §22 edit after the park cannot silently
 * change what an already-parked customer sees.
 * @param confirmId - the change-level confirm gate id from `confirmGateOf`.
 * @param snapshot - optional frozen copy from the awaiting-confirm event.
 * @returns Tab gate payload, or undefined if registry has no mapping.
 */
function enrichTabGate(
  confirmId: WorkflowTabGate['id'],
  snapshot?: AwaitingConfirmSnapshot,
): WorkflowTabGate | undefined {
  const gateId = confirmId === 'design-to-plan' ? 'design-confirm'
    : confirmId === 'verify-to-archive' ? 'verify-archive'
      : undefined
  if (gateId === undefined) return undefined
  const spec = snapshot === undefined ? GATE_REGISTRY[gateId] : undefined
  if (spec === undefined && snapshot === undefined) return undefined
  const node = confirmId === 'design-to-plan' ? 'design' as const
    : 'verify' as const
  const actionKey = confirmId === 'design-to-plan' ? 'gate.confirmIntoPlan'
    : 'gate.confirmArchive'
  const question = snapshot?.question ?? spec?.question
  if (question === undefined) return undefined
  const options = snapshot !== undefined
    ? snapshot.options
      .filter(opt => opt.command !== '__noop__' && opt.command !== '__continued__')
      .map(opt => ({ id: opt.id, label: opt.label }))
    : (spec?.options ?? [])
      .filter(opt => opt.command !== '__noop__' && opt.command !== '__continued__')
      .map(opt => ({ id: opt.id, label: opt.label }))
  return {
    id: confirmId,
    node,
    actionKey,
    gateId,
    question,
    options,
  }
}

/**
 * Build the workspace-level `pendingGate` payload when `.baf/baseline.yml`
 * is missing. Reads the registry's `scaffold` spec verbatim so the Tab
 * renders the same question/options the session card and CLI do (§22.4).
 * @param cwd - workspace root.
 * @returns pendingGate payload, or undefined if baseline is present.
 */
function deriveWorkspacePendingGate(cwd: string): WorkflowTabPendingGate | undefined {
  const present = existsSync(join(cwd, WORKSPACE_BASELINE_PATH))
  if (present) return undefined
  const spec = GATE_REGISTRY['scaffold']
  return {
    gateId: 'scaffold',
    question: spec.question,
    options: spec.options.map(opt => ({ id: opt.id, label: opt.label })),
  }
}

/** Assembly options for {@link buildWorkflowTabView}. */
export interface BuildWorkflowTabViewOptions {
  /** Fold the event log into per-stage durations / tokens (default true). */
  readonly includeMetrics?: boolean
  /**
   * 【变更】2026-09-23 (user issue #3): the driving session's per-step
   * provider usage, for per-stage token attribution inside the metrics fold.
   * Absent (CLI, tests, cold sessions) leaves the token fields empty — the
   * card shows 「—」 — exactly like before.
   */
  readonly usagePoints?: readonly UsagePoint[]
  /**
   * Resolve the T13 rollback targets for a change parked in drift (§19.5).
   *
   * Only called when `status.current === 'drift'`, because the authoritative
   * answer needs live drift detection (Git + artifact probes) that must not run
   * on every repaint. The Tab supplies it from its own cwd; omitting it simply
   * means the Tab shows no rollback menu.
   * @param changeId - drifted change.
   * @returns anchor + legal targets, or undefined.
   */
  readonly resume?: (changeId: string) => Promise<WorkflowTabResume | undefined>
}

/**
 * Build a Tab view for a workspace, optionally selecting one change.
 *
 * The event log is always read: the §18.4.3 dual-lane view is derived from it
 * and the Tab cannot draw the right picture without it. Only the metrics fold —
 * the O(n) cost the first paint cares about — is gated by `includeMetrics`.
 * @param store - projection store.
 * @param selectedChangeId - change to focus; when omitted picks the newest.
 * @param options - optional assembly flags.
 * @returns tab view.
 */
export async function buildWorkflowTabView(
  store: ProjectionStore,
  selectedChangeId?: string | null,
  options: BuildWorkflowTabViewOptions = {},
): Promise<WorkflowTabView> {
  const includeMetrics = options.includeMetrics !== false
  const index = await store.readIndex()
  const changes = index.changes.map(c => ({
    changeId: c.changeId,
    mode: c.mode,
    current: c.current,
  }))

  if (changes.length === 0) {
    const empty = buildEmptyTabView([])
    return attachWorkspaceGates(empty, store.workspaceRoot())
  }

  // §22.19 — selection fallback unified with every other surface: active
  // changes ranked by `pickActiveChange` (highest seq, tie lexical), most
  // recent first on ambiguity; only when every change is terminal does the
  // Tab show the most recently ended one. The old lexical-last-over-all
  // fallback happily picked an abandoned change beside a running one and
  // stranded the Tab on a dead view (session 7.jsonl R5).
  const picked = pickActiveChange(index.changes)
  const fallbackRow = picked.kind === 'one'
    ? { changeId: picked.changeId }
    : picked.kind === 'ambiguous'
      ? picked.candidates[0]
      : [...index.changes].sort((a, b) =>
        a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId))[0]
  if (fallbackRow === undefined) {
    const empty = buildEmptyTabView([])
    return attachWorkspaceGates(empty, store.workspaceRoot())
  }
  const selected = selectedChangeId ?? fallbackRow.changeId

  try {
    const status = await store.readStatus(selected)
    const { events } = await store.readEvents(selected)
    const lanes = deriveLanes(events)
    const resume = status.current === 'drift' && options.resume !== undefined
      ? await options.resume(selected)
      : undefined
    // §13 R5 — pick the most recent awaiting-confirm snapshot for this
    // change (eventually-consistent with the §18.5 confirmation guard).
    const gateSnapshot = lastAwaitingConfirmSnapshot(events)
    const extras: { lanes?: WorkflowTabLanes; resume?: WorkflowTabResume } = {
      ...(lanes === undefined ? {} : { lanes }),
      ...(resume === undefined ? {} : { resume }),
    }
    const derived = includeMetrics ? deriveWorkflowMetrics(events, Date.now(), options.usagePoints) : undefined
    // 2026-09-21 (session 5.jsonl): classify every customer-editable artifact
    // of the focused change so the Tab rail can render one open button per
    // file with its live state — same single source (`changeArtifactStatus`)
    // the /baf-status card uses, so the two surfaces can never disagree.
    const artifacts = await changeArtifactStatus({
      workspaceRoot: store.workspaceRoot(),
      changeId: selected,
      mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
    })
    // 【变更】2026-09-24 (demo6 问题 2): the frozen allowlist rides the same
    // payload once the plan completed — the rail's 影响范围 reads the real
    // file count (and the tooltip lists the files) instead of the keyword
    // pre-judgment alone. Terminal changes read theirs from the archive
    // directory (the same fallback the artifact rows use).
    const planAllowlist = await readPlanAllowlist(store.workspaceRoot(), selected, status).catch(() => undefined)
    const view = statusToTabView(status, changes, derived, extras)
    // 2026-09-22 (user report #4): the Tab 「推进」 button's readiness — same
    // file gates the drives run, so a click can never promise an advance the
    // coordinator would refuse. A gate read failure fails closed (not ready)
    // rather than letting the button free-run.
    const advance = await deriveAdvanceReadiness(store.workspaceRoot(), selected, status)
      .catch(() => ({ ready: false, missing: ['产物检查失败——刷新重试'] }))
    const withArtifacts: WorkflowTabView = {
      ...view,
      ...(advance === undefined ? {} : { advance }),
      artifacts,
      ...(planAllowlist === undefined ? {} : { planAllowlist }),
    }
    // 【变更】2026-09-23 (demo2 user issue #2): a change parked at a pending
    // classification surfaces as the change-scoped pendingGate — the 完整流程 /
    // 缺陷修复路径 choice renders as buttons at the top of the workflow page
    // at exactly the moment the session dialog would pop, clicking dispatches
    // through the same gateResolve channel, and the projection push/poll keeps
    // the two surfaces in sync (mint → appears, classify-confirm → disappears).
    const withIntakeGate = attachIntakePendingGate(withArtifacts, status)
    const enriched = gateSnapshot !== undefined ? enrichTabGateWithSnapshot(withIntakeGate, gateSnapshot) : withIntakeGate
    return attachWorkspaceGates(enriched, store.workspaceRoot())
  } catch (error) {
    return attachWorkspaceGates({
      ...buildEmptyTabView(changes),
      selectedChangeId: selected,
      blockedReason: error instanceof Error ? error.message : String(error),
    }, store.workspaceRoot())
  }
}

/**
 * The frozen file allowlist of the focused change's plan ledger, once the
 * plan stage completed (demo6 问题 2). Live changes read the change
 * directory; terminal ones fall back to the archive directory (the same
 * location rule the artifact rows follow). Absent while the plan hasn't
 * completed or no ledger parses.
 * @param cwd - workspace root.
 * @param changeId - focused change.
 * @param status - recovered workflow status.
 * @returns allowlist file paths, or undefined.
 */
async function readPlanAllowlist(
  cwd: string,
  changeId: string,
  status: WorkflowStatus,
): Promise<readonly string[] | undefined> {
  const planDone = status.nodes.plan === 'completed'
  const terminal = status.terminal !== undefined
  if (!planDone && !terminal) return undefined
  const ledger = await readLedger(cwd, changeId).catch(() => undefined)
  if (ledger !== undefined) return ledger.allowlist.length > 0 ? ledger.allowlist : undefined
  if (!terminal) return undefined
  try {
    const body = await readFile(join(cwd, 'openspec', 'changes', 'archive', changeId, 'plan.json'), 'utf8')
    const parsed = parsePlanLedger(body)
    return parsed !== undefined && parsed.allowlist.length > 0 ? parsed.allowlist : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether the Tab 「推进」 button may advance the change right now, and what
 * stands in the way when it may not (2026-09-22 user report #4).
 *
 * The readiness judgment is the current node's file gate — the SAME judgment
 * `/baf-go` and the coordinator run — so the button can never offer an
 * advance the drives would refuse one click later. verify and intake are not
 * authoring stages: verify's readiness is the projection marker (the parked
 * verify-archive gate takes over the UI anyway), intake's is the
 * classification state the classify card settles.
 * @param cwd - workspace root.
 * @param changeId - focused change.
 * @param status - recovered workflow status.
 * @returns advance payload, or undefined when the resting point has no
 * advance semantics (terminal / drift / blocked read).
 */
async function deriveAdvanceReadiness(
  cwd: string,
  changeId: string,
  status: WorkflowStatus,
): Promise<{ readonly ready: boolean; readonly missing: readonly string[] } | undefined> {
  if (status.terminal !== undefined || status.current === 'drift') return undefined
  const input: GateInput = { workspaceRoot: cwd, changeId, mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path' }
  const of = (outcome: GateOutcome): { ready: boolean; missing: readonly string[] } => ({
    ready: outcome.ok,
    missing: outcome.ok ? [] : outcome.missing !== undefined && outcome.missing.length > 0 ? outcome.missing : [outcome.detail ?? '阶段产物未达完成门'],
  })
  switch (status.current) {
    // 【变更】2026-09-26 (用户需求 工作流 3): mode-aware — a bug-fix open rests
    // on the bug record, so the Tab advance dialog gates on bugRecordGate
    // (the same judgment /baf-go and the turn-end pop run).
    case 'open': return of(status.mode === 'bug-fix-path'
      ? await bugRecordGate(input)
      : await proposalGate(input))
    case 'clarify': return of(await clarifyGate(input))
    case 'design': return of(await designGate(input))
    case 'plan': return of(await planGate(input))
    case 'implement': {
      const ledger = await readLedger(cwd, changeId).catch(() => undefined)
      if (ledger === undefined) return { ready: false, missing: ['plan.json 账本不可读——补齐 tasks 结构（每任务 id / title / files / done / touched）'] }
      return of(await implementGate(input, ledger.touched))
    }
    case 'verify':
      return status.nodes.verify === 'completed'
        ? { ready: true, missing: [] }
        : { ready: false, missing: ['系统验证尚未完成——验证跑完会自动弹归档确认卡'] }
    case 'intake':
      return status.intake?.confirmation === 'confirmed'
        ? { ready: true, missing: [] }
        : { ready: false, missing: ['需求分类待确认——先在分类确认卡上点选'] }
    default:
      return undefined
  }
}

/**
 * 【变更】2026-09-23 (demo2 user issue #2): attach the change-scoped
 * `intake-classify` pendingGate when the focused change rests at a pending
 * classification — the same resting-point judgment `dueGateFor` applies
 * (`explicitGatesFor`'s intake case), so the Tab button row and the session
 * dialog can never offer the decision at different times. The classifier's
 * verdict rides as `detail` (§22.17 I parity: the two path buttons confirm a
 * visible judgment).
 * @param view - the assembled tab view.
 * @param status - the focused change's recovered status.
 * @returns the view with the intake pendingGate attached, or unchanged.
 */
function attachIntakePendingGate(view: WorkflowTabView, status: WorkflowStatus): WorkflowTabView {
  if (status.terminal !== undefined || status.current !== 'intake') return view
  const pending = status.intake === undefined
    || status.intake.confirmation !== 'confirmed'
    || status.intake.mode === 'clarify-required'
  if (!pending) return view
  const spec = GATE_REGISTRY['intake-classify']
  return {
    ...view,
    pendingGate: {
      gateId: 'intake-classify' as const,
      changeId: status.changeId,
      question: spec.question,
      options: spec.options
        .filter(opt => opt.command !== '__noop__' && opt.command !== '__continued__')
        .map(opt => ({ id: opt.id, label: opt.label })),
      ...(status.intake === undefined ? {} : {
        detail: [
          `系统初步判断：${modeZh(status.intake.mode)} · 置信 ${status.intake.confidence.toFixed(2)}`,
          `需求摘要：${status.intake.summary}`,
        ],
      }),
    },
  }
}

/**
 * Augment a tab view with workspace-level gates derived from the §22
 * registry. The change-level `gate` field stays the source of truth for
 * change-parked confirmations; `pendingGate` carries the scaffold gate
 * (workspace scope) and the change-scoped intake-classify resting point.
 * The scaffold gate wins when both apply — the environment is initialized
 * before any change decision is offered.
 * @param view - tab view to enrich.
 * @param cwd - workspace root for the `.baf/baseline.yml` probe.
 * @returns view with `pendingGate` (and an enriched `gate` if parked).
 */
function attachWorkspaceGates(view: WorkflowTabView, cwd: string): WorkflowTabView {
  const pendingGate = deriveWorkspacePendingGate(cwd) ?? view.pendingGate
  const parked = confirmGateOf({ current: view.current ?? 'intake', nodes: {} })
  const enrichedGate = parked === undefined
    ? view.gate
    : enrichTabGate(parked) ?? view.gate
  return {
    ...view,
    ...(enrichedGate === undefined ? {} : { gate: enrichedGate }),
    ...(pendingGate === undefined ? {} : { pendingGate }),
  }
}

/**
 * §13 R5 — walk the event log from the tail and return the snapshot
 * carried on the most recent `awaiting-confirm` event. Old events without
 * `snapshot` simply pass through (return undefined → caller falls back to
 * the live registry).
 * @param events - full event log for a single change (ascending seq).
 * @returns last snapshot or undefined.
 */
function lastAwaitingConfirmSnapshot(events: readonly ProjectionEvent[]): AwaitingConfirmSnapshot | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event !== undefined && event.type === 'awaiting-confirm' && event.snapshot !== undefined) {
      return event.snapshot
    }
  }
  return undefined
}

/**
 * §13 R5 — apply a snapshot to the view's `gate` field. Replaces the
 * live-registry-derived gate with the snapshot-backed one. Returns the
 * view unchanged when no parked gate exists (the snapshot is only useful
 * for parked gates).
 * @param view - tab view to mutate.
 * @param snapshot - frozen copy from the awaiting-confirm event.
 * @returns view with the snapshot-backed gate.
 */
function enrichTabGateWithSnapshot(view: WorkflowTabView, snapshot: AwaitingConfirmSnapshot): WorkflowTabView {
  if (view.gate === undefined) return view
  const enriched = enrichTabGate(view.gate.id, snapshot)
  if (enriched === undefined) return view
  return { ...view, gate: enriched }
}
