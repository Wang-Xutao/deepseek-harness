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
import { join } from 'node:path'
import { GATE_REGISTRY } from './gate-cards.ts'
import { deriveLanes } from './lanes.ts'
import { deriveWorkflowMetrics } from './metrics.ts'
import type { ProjectionStore } from './projection.ts'

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
      .filter(opt => opt.command !== '__noop__')
      .map(opt => ({ id: opt.id, label: opt.label }))
    : (spec?.options ?? [])
      .filter(opt => opt.command !== '__noop__')
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

  const fallback = changes.slice().sort((a, b) => a.changeId.localeCompare(b.changeId)).at(-1)
  if (fallback === undefined) {
    const empty = buildEmptyTabView([])
    return attachWorkspaceGates(empty, store.workspaceRoot())
  }
  const selected = selectedChangeId ?? fallback.changeId

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
    const derived = includeMetrics ? deriveWorkflowMetrics(events) : undefined
    const view = statusToTabView(status, changes, derived, extras)
    const enriched = gateSnapshot !== undefined ? enrichTabGateWithSnapshot(view, gateSnapshot) : view
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
 * Augment a tab view with workspace-level gates derived from the §22
 * registry. The change-level `gate` field stays the source of truth for
 * change-parked confirmations; `pendingGate` only carries workspace-scope
 * gates (currently scaffold), keeping the two scopes distinguishable.
 * @param view - tab view to enrich.
 * @param cwd - workspace root for the `.baf/baseline.yml` probe.
 * @returns view with `pendingGate` (and an enriched `gate` if parked).
 */
function attachWorkspaceGates(view: WorkflowTabView, cwd: string): WorkflowTabView {
  const pendingGate = deriveWorkspacePendingGate(cwd)
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
