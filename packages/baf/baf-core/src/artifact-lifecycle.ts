/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the stage-artifact lifecycle,
 * shared by the workflow engine (which renders it) and the guard (which locks
 * it).
 *
 * A customer-facing document walks one ladder:
 *
 *   未生成（灰）→ 未填写（黄）→ 已填写（蓝）→ 已完成（绿）
 *
 * and leaves it in one of two ways:
 *
 *   已更新（橙）— a 已完成 document was edited after its gate was passed
 *   待更新（红）— a document of a LATER stage, now out of sync with it
 *
 * The facts that decide the state are the projection events (which stage ran,
 * and when) and the file's last write stamp — so the same rule answers
 * 「what does the rail show」 and 「may the model still rewrite this file」.
 *
 * @module @deepseek-ai/dsh-baf-core/artifact-lifecycle
 */

import type { ProjectionEvent } from './events.ts'
import type { WorkflowNode } from './workflow.ts'

/**
 * The customer-facing state of one stage artifact.
 */
export type ArtifactLifecycleState =
  | 'missing'
  | 'template'
  | 'planned'
  | 'filled'
  | 'completed'
  | 'updated'
  | 'stale'
  | 'clipped'

/**
 * The stage flow of every customer-facing document.
 *
 * `fill` is the stage that PRODUCES the document's content, `confirm` is the
 * stage whose entry means the customer passed the gate in front of it — the
 * moment the document becomes 已完成 (and, from that moment, locked).
 *
 * proposal.md is the case the customer reported: the OPEN stage only writes
 * its template (未填写); the CLARIFY stage is where the customer really fills
 * it (已填写); passing the clarify gate into DESIGN confirms it (已完成).
 */
export const ARTIFACT_FLOW: Readonly<Record<string, { readonly fill: WorkflowNode; readonly confirm: WorkflowNode }>> = {
  'proposal.md': { fill: 'clarify', confirm: 'design' },
  'clarify.md': { fill: 'clarify', confirm: 'design' },
  'design.md': { fill: 'design', confirm: 'plan' },
  'plan.md': { fill: 'plan', confirm: 'implement' },
  'plan.json': { fill: 'plan', confirm: 'implement' },
  'tasks.md': { fill: 'plan', confirm: 'implement' },
  'checklist.md': { fill: 'implement', confirm: 'verify' },
  'verify.md': { fill: 'verify', confirm: 'archive' },
}

/** The stage order the documents follow — an earlier stage's document is
 * upstream of a later one's. */
export const ARTIFACT_FLOW_ORDER: readonly WorkflowNode[] = [
  'open',
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
]

/**
 * The flow index of one document (its fill stage's position in the flow).
 * @param file - the artifact file name.
 * @returns the index, or undefined for a document without a flow.
 */
export function artifactFlowIndex(file: string): number | undefined {
  const flow = ARTIFACT_FLOW[file]
  if (flow === undefined) return undefined
  const index = ARTIFACT_FLOW_ORDER.indexOf(flow.fill)
  return index < 0 ? undefined : index
}

/**
 * The stamp of the event that CONFIRMS one document — the stage that follows
 * its gate, or the archive for the acceptance document.
 * @param events - the change's projection events.
 * @param confirm - the confirming stage.
 * @returns epoch ms, or undefined when the gate has not been passed yet.
 */
export function artifactConfirmedAt(
  events: readonly ProjectionEvent[],
  confirm: WorkflowNode,
): number | undefined {
  for (const event of events) {
    if (event.type === 'stage-entered' && event.node === confirm) {
      const ms = Date.parse(event.at)
      if (!Number.isNaN(ms)) return ms
    }
    if (confirm === 'archive' && event.type === 'change-archived') {
      const ms = Date.parse(event.at)
      if (!Number.isNaN(ms)) return ms
    }
  }
  return undefined
}

/**
 * The lifecycle state of one document.
 *
 * A document with real content is 已填写 (blue) until the gate in front of it
 * is passed; from that moment it is 已完成 (green) and locked. A completed
 * document edited afterwards is 已更新 (orange) — the customer's own edit or
 * an unauthorized one.
 * @param file - the artifact file name.
 * @param base - the content-derived state (missing / template / planned / filled).
 * @param events - the change's projection events.
 * @param mtimeMs - the file's last modification stamp, when it exists.
 * @returns the lifecycle state.
 */
export function artifactLifecycleState(
  file: string,
  base: ArtifactLifecycleState,
  events: readonly ProjectionEvent[],
  mtimeMs: number | undefined,
): ArtifactLifecycleState {
  if (base !== 'filled' && base !== 'planned') return base
  const flow = ARTIFACT_FLOW[file]
  if (flow === undefined) return base
  const confirmed = artifactConfirmedAt(events, flow.confirm)
  if (confirmed === undefined) return base
  if (mtimeMs !== undefined && mtimeMs > confirmed) return 'updated'
  return 'completed'
}

/**
 * The documents the model may no longer rewrite — the ones the customer
 * confirmed (已完成) and that were NOT edited afterwards.
 *
 * The guard uses this list as the hard lock: a confirmed document is the
 * customer's own word, and only the customer may change it (or the 同步
 * order, which the customer triggers).
 * @param events - the change's projection events.
 * @param mtimes - each document's last write stamp, keyed by file name.
 * @returns the locked document file names.
 */
export function lockedArtifactDocuments(
  events: readonly ProjectionEvent[],
  mtimes: Readonly<Record<string, number>>,
): readonly string[] {
  const locked: string[] = []
  for (const file of Object.keys(ARTIFACT_FLOW)) {
    const flow = ARTIFACT_FLOW[file]
    if (flow === undefined) continue
    const confirmed = artifactConfirmedAt(events, flow.confirm)
    if (confirmed === undefined) continue
    const mtime = mtimes[file]
    if (mtime !== undefined && mtime > confirmed) continue
    locked.push(file)
  }
  return locked
}
