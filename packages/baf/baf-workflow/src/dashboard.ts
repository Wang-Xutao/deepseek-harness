/**
 * 【变更】2026-09-23 (user issue #6): the 变更总览 dashboard payload — every
 * change in the workspace as one rollup row, newest first.
 *
 * One row = index entry + the metrics fold of its own event log + the
 * plan-ledger task counts (live or archived). Reads are per-change and
 * best-effort: a change whose status or ledger cannot be read still rows
 * (with what the index knows) instead of failing the whole dashboard.
 * @module @deepseek-ai/dsh-baf-workflow/dashboard
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  WorkflowDashboardRow,
  WorkflowDashboardView,
} from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics, type UsagePoint } from './metrics.ts'
import type { ProjectionIndexEntry, ProjectionStore } from './projection.ts'

/**
 * Read one change's plan ledger task counts, live dir first, archive second.
 * @param workspaceRoot - workspace root.
 * @param changeId - change id.
 * @returns the rollup, or undefined when no readable ledger.
 */
async function taskCounts(workspaceRoot: string, changeId: string): Promise<{ done: number; total: number } | undefined> {
  const read = async (path: string): Promise<string | undefined> =>
    await readFile(path, 'utf8').catch(() => undefined)
  const body = await read(join(workspaceRoot, 'openspec', 'changes', changeId, 'plan.json'))
    ?? await read(join(workspaceRoot, 'openspec', 'changes', 'archive', changeId, 'plan.json'))
  if (body === undefined) return undefined
  let tasks: readonly { done?: boolean }[] | undefined
  try {
    const parsed = JSON.parse(body) as { tasks?: readonly { done?: boolean }[] }
    if (Array.isArray(parsed.tasks)) tasks = parsed.tasks
  } catch {
    return undefined
  }
  if (tasks === undefined) return undefined
  return {
    done: tasks.filter(task => task.done === true).length,
    total: tasks.length,
  }
}

/**
 * Build the dashboard view for a workspace.
 * @param store - the workspace projection store.
 * @param usagePoints - the workspace sessions' per-step usage samples, any
 * order. 【变更】2026-09-28 (用户问题 4): attribution is time-window based — a
 * point lands in whichever change's stage window contains it, so the samples
 * of every session that ever drove this workspace fold correctly without a
 * per-change session map; points outside every window (preamble turns) are
 * unattributed by design. Absent (the old call shape) keeps rows token-less.
 * @returns every change row (newest first) plus the header rollups.
 */
export async function buildWorkflowDashboard(
  store: ProjectionStore,
  usagePoints: readonly UsagePoint[] = [],
): Promise<WorkflowDashboardView> {
  const workspaceRoot = store.workspaceRoot()
  const index = await store.readIndex()
  const rows: WorkflowDashboardRow[] = []
  for (const entry of index.changes) {
    const row = await dashboardRowFor(store, workspaceRoot, entry, usagePoints)
    rows.push(row)
  }
  // Newest activity first — the same ranking pickActiveChange applies.
  rows.sort((a, b) =>
    a.changeId === b.changeId ? 0 : rankOf(index, b) - rankOf(index, a) || a.changeId.localeCompare(b.changeId))
  const summary = {
    active: rows.filter(r => r.current !== 'completed' && r.current !== 'abandoned').length,
    archived: rows.filter(r => r.current === 'completed').length,
    abandoned: rows.filter(r => r.current === 'abandoned').length,
    tasksDone: rows.reduce((sum, r) => sum + (r.tasks?.done ?? 0), 0),
    tasksTotal: rows.reduce((sum, r) => sum + (r.tasks?.total ?? 0), 0),
  }
  return { rows, summary }
}

/** The index seq of one row's change (0 when unknown — sorts oldest). */
function rankOf(index: { readonly changes: readonly ProjectionIndexEntry[] }, row: WorkflowDashboardRow): number {
  return index.changes.find(c => c.changeId === row.changeId)?.seq ?? 0
}

/** Fold one index entry into a dashboard row, tolerating partial reads. */
async function dashboardRowFor(
  store: ProjectionStore,
  workspaceRoot: string,
  entry: ProjectionIndexEntry,
  usagePoints: readonly UsagePoint[],
): Promise<WorkflowDashboardRow> {
  const base: WorkflowDashboardRow = {
    changeId: entry.changeId,
    mode: entry.mode,
    current: entry.current,
    ...(entry.current === 'completed' || entry.current === 'abandoned' ? { endedAt: entry.updatedAt } : {}),
  }
  try {
    const { events } = await store.readEvents(entry.changeId)
    // 【变更】2026-09-28 (用户问题 4): usage samples ride along so per-node
    // tokens attribute by stage windows — same fold the Tab view runs.
    const { byNode } = deriveWorkflowMetrics(events, Date.now(), usagePoints)
    // Every present node's duration/tokens sum to the row's rollup.
    let durationMs = 0
    let inputTokens = 0
    let outputTokens = 0
    for (const metrics of Object.values(byNode)) {
      durationMs += metrics.durationMs ?? 0
      inputTokens += metrics.inputTokens ?? 0
      outputTokens += metrics.outputTokens ?? 0
    }
    const tasks = await taskCounts(workspaceRoot, entry.changeId)
    return {
      ...base,
      ...(durationMs > 0 ? { durationMs } : {}),
      ...(inputTokens > 0 || outputTokens > 0 ? { inputTokens, outputTokens } : {}),
      ...(tasks === undefined ? {} : { tasks }),
    }
  } catch {
    return base
  }
}
