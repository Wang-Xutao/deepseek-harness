/**
 * N8 drift detector (§12 Phase 5.8). Compares the durable evidence that the
 * projection locked at open against the workspace/baseline state at observe
 * time and writes a single `drift-detected` event when any trigger fires.
 * T13 (drift → earliest affected node) is executed by the caller through
 * {@link decideTransition}; this module never moves the projection itself.
 *
 * Drift triggers (per enterprise-workflow §5.3 N8):
 * - Git revision or branch changed since open
 * - Baseline manifest changed (different baseline id, or same id but content)
 * - Verify report's sourceRevision/baselineId no longer matches current
 * - Workspace-relative artifact files that a completed stage recorded have
 *   been deleted
 *
 * @module @deepseek-ai/dsh-baf-workflow/stages/drift
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { BaselineManifest, WorkflowNode, WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import type { StageContext } from './context.ts'
import type { VerifyReport } from './check-runner.ts'
import { ARTIFACT_FILES, changeDir } from '@deepseek-ai/dsh-baf-openspec'
import { readVerifyReport } from './verify.ts'

/** One drift trigger category. */
export type DriftTrigger =
  | 'git-revision-changed'
  | 'baseline-id-changed'
  | 'baseline-content-changed'
  | 'verify-report-stale'
  | 'artifact-missing'

/** One detected drift signal; first signal triggers `drift-detected`. */
export interface DriftSignal {
  readonly trigger: DriftTrigger
  /** Workspace-relative path or value affected (omit when no concrete location). */
  readonly source?: string
  /** Human-readable summary suitable for projection `cause`. */
  readonly detail: string
}

/** Observed workspace/baseline facts the detector compares against projection. */
export interface DriftObservation {
  readonly gitRevision?: string
  readonly baseline?: BaselineManifest
}

/**
 * Stage order used to pick the earliest affected node for T13. The earliest
 * completed (or in-progress) stage whose downstream artifact the drift
 * invalidates is the resume target. Anything after `intake`/`open` is
 * considered re-runnable.
 */
const STAGE_ORDER: readonly WorkflowNode[] = [
  'intake',
  'open',
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
]

/**
 * Files that a completed stage depends on. Removing any of them is a drift
 * trigger that requires re-entering the owning stage.
 */
const ARTIFACTS_BY_NODE: Readonly<Record<WorkflowNode, readonly string[]>> = {
  intake: [],
  open: [],
  clarify: [ARTIFACT_FILES.proposal, ARTIFACT_FILES.clarify],
  design: [ARTIFACT_FILES.design],
  plan: [ARTIFACT_FILES.plan, ARTIFACT_FILES.planJson, ARTIFACT_FILES.tasks],
  implement: [],
  verify: [],
  archive: [],
  drift: [],
}

/** What the projection captured at open for one baseline. */
interface LockedBaseline {
  readonly baselineId: string
  /** Absent in pre-Phase-8.9 logs; the content check is then skipped. */
  readonly contentHash?: string
}

/** Probe projection state captured at open. */
interface LockedState {
  readonly changeId: string
  readonly sourceRevision?: string
  readonly baseline?: LockedBaseline
}

/**
 * Reconstruct the locked-at-open projection facts from current events.
 *
 * The lock carries both anchors: `baseline.sourceRevision` is the revision
 * recorded when open ran, and `baseline.contentHash` the manifest content
 * hash taken at that same moment. `status.sourceRevision` is only a fallback
 * for a projection that locked a revision without a baseline.
 * @param status - recovered status.
 * @returns locked state, or null when projection carries no anchor.
 */
export function lockedFromStatus(status: WorkflowStatus): LockedState | null {
  const revision = status.baseline?.sourceRevision ?? status.sourceRevision
  if (revision === undefined && status.baseline === undefined) {
    return null
  }
  const locked: LockedBaseline | undefined = status.baseline === undefined ? undefined : {
    baselineId: status.baseline.baselineId,
    ...(status.baseline.contentHash === undefined
      ? {}
      : { contentHash: status.baseline.contentHash }),
  }
  return {
    changeId: status.changeId,
    ...(revision === undefined ? {} : { sourceRevision: revision }),
    ...(locked === undefined ? {} : { baseline: locked }),
  }
}

/**
 * Canonicalize a value into stable JSON for hashing. Order-independent for
 * object keys, recursive into arrays.
 * @param value - input.
 * @returns canonical string.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`
}

/**
 * Short hash of canonicalized content for baseline drift detection.
 * @param value - input.
 * @returns 16-hex hash.
 */
export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex').slice(0, 16)
}

/**
 * Compare the projection's locked state against current facts.
 * @param locked - what open locked (may be null when nothing was locked).
 * @param observation - current Git/baseline facts.
 * @returns signals; empty when projection is consistent.
 */
export function compareToLocked(
  locked: LockedState | null,
  observation: DriftObservation,
): readonly DriftSignal[] {
  const signals: DriftSignal[] = []
  if (locked === null) return signals

  if (locked.sourceRevision !== undefined
    && observation.gitRevision !== undefined
    && locked.sourceRevision !== observation.gitRevision) {
    signals.push({
      trigger: 'git-revision-changed',
      detail: `Git HEAD moved from ${locked.sourceRevision} to ${observation.gitRevision}`,
    })
  }

  if (locked.baseline !== undefined && observation.baseline !== undefined) {
    // Every comparison in this module is "both sides observable", so a probe
    // that cannot see a baseline reports nothing rather than "unavailable":
    // the two cases (file deleted vs. probe has no baseline wired) are
    // indistinguishable here, and guessing "deleted" parks healthy changes in
    // drift from every baseline-less entry point.
    if (observation.baseline.baselineId !== locked.baseline.baselineId) {
      signals.push({
        trigger: 'baseline-id-changed',
        source: 'baseline',
        detail: `baseline id changed: ${locked.baseline.baselineId} → ${observation.baseline.baselineId}`,
      })
    } else {
      // Only comparable when open recorded a content hash; a pre-Phase-8.9
      // lock has none, and skipping beats reporting a permanent false drift.
      if (locked.baseline.contentHash !== undefined) {
        const currentHash = hashCanonical(observation.baseline)
        if (currentHash !== locked.baseline.contentHash) {
          signals.push({
            trigger: 'baseline-content-changed',
            source: 'baseline',
            detail: `baseline ${observation.baseline.baselineId} content changed since open`,
          })
        }
      }
    }
  }

  return signals
}

/**
 * Whether the most recent verify report's identity fields match current
 * facts. Reports drift when the workspace moved (revision/baseline) since the
 * check ran.
 * @param report - last persisted report, or undefined when none.
 * @param observation - current facts.
 * @returns stale signal when identity no longer matches.
 */
export function verifyReportStaleness(
  report: VerifyReport | undefined,
  observation: DriftObservation,
): DriftSignal | undefined {
  if (report === undefined) return undefined
  if (observation.gitRevision !== undefined && report.sourceRevision !== undefined
    && report.sourceRevision !== observation.gitRevision) {
    return {
      trigger: 'verify-report-stale',
      source: 'verify-report.json',
      detail: `verify report bound to ${report.sourceRevision}; HEAD now ${observation.gitRevision}`,
    }
  }
  if (observation.baseline !== undefined && report.baselineId !== undefined
    && report.baselineId !== observation.baseline.baselineId) {
    return {
      trigger: 'verify-report-stale',
      source: 'verify-report.json',
      detail: `verify report bound to baseline ${report.baselineId}; current ${observation.baseline.baselineId}`,
    }
  }
  return undefined
}

/**
 * Scan artifact files owned by completed stages; any missing one is a drift
 * signal pointing at the earliest owning stage.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - owning change.
 * @param status - recovered status.
 * @returns signals (in stage order).
 */
export async function scanCompletedArtifacts(
  workspaceRoot: string,
  changeId: string,
  status: WorkflowStatus,
): Promise<readonly DriftSignal[]> {
  const signals: DriftSignal[] = []
  for (const node of STAGE_ORDER) {
    if (status.nodes[node] !== 'completed') continue
    const files = ARTIFACTS_BY_NODE[node]
    if (files.length === 0) continue
    for (const file of files) {
      const path = join(changeDir(workspaceRoot, changeId), file)
      try {
        const s = await stat(path)
        if (!s.isFile()) {
          signals.push({
            trigger: 'artifact-missing',
            source: file,
            detail: `${file} is no longer a regular file (required by ${node})`,
          })
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === undefined) continue
        if (code !== 'ENOENT') throw error
        signals.push({
          trigger: 'artifact-missing',
          source: file,
          detail: `${file} was deleted (required by ${node})`,
        })
      }
    }
  }
  return signals
}

/**
 * Pick the earliest affected node for T13: the first stage whose artifact is
 * flagged by an artifact-missing signal, otherwise the anchor the detector
 * recorded when it parked the change, otherwise the active stage.
 *
 * A *drifted* status parks `current` at the pseudo-node `drift`, so the
 * persisted anchor is recovered from the node the detector marked `drifted`
 * (`drift-detected` sets `nodes[anchor] = 'drifted'`). This keeps the anchor
 * algorithm single-sourced (§21.5): both the recording path and the resume
 * path call this function.
 * @param status - current status.
 * @param signals - detected signals.
 * @returns target node for T13.
 */
export function earliestAffectedNode(
  status: WorkflowStatus,
  signals: readonly DriftSignal[],
): WorkflowNode {
  for (const signal of signals) {
    if (signal.trigger === 'artifact-missing' && signal.source !== undefined) {
      for (const node of STAGE_ORDER) {
        if (ARTIFACTS_BY_NODE[node].includes(signal.source)) return node
      }
    }
  }
  const anchor = STAGE_ORDER.find(node => status.nodes[node] === 'drifted')
  if (anchor !== undefined) return anchor
  if (status.current !== 'completed' && status.current !== 'abandoned'
    && status.current !== 'drift') {
    return status.current
  }
  return 'verify'
}

/**
 * Stages a drift resume may target, latest-first (§19.2 / §19.3).
 *
 * The set is "the earliest affected node and everything before it", minus the
 * two entry stages (`intake` / `open`) which are not re-runnable — their
 * record stands and a drift never invalidates it. The earliest affected node
 * is always present, so the fallback for a degenerate signal set is just that
 * node.
 * @param status - drifted status.
 * @param signals - detected signals.
 * @returns candidate targets, latest-first (index 0 = recommended default).
 */
export function resumeCandidates(
  status: WorkflowStatus,
  signals: readonly DriftSignal[],
): readonly WorkflowNode[] {
  const target = earliestAffectedNode(status, signals)
  const index = STAGE_ORDER.indexOf(target)
  const upto = index < 0 ? [target] : STAGE_ORDER.slice(0, index + 1)
  const rerunnable = upto.filter(node => node !== 'intake' && node !== 'open')
  return rerunnable.length > 0 ? [...rerunnable].reverse() : [target]
}

/**
 * Stages a drift resume must re-run after re-entering `target`, in order
 * (§19.3). Runs from the target up to and including `verify`; `archive` is
 * excluded because it is the customer's final gate, not a re-run.
 * @param target - chosen resume target.
 * @returns ordered stage names.
 */
export function rerunChain(target: WorkflowNode): readonly WorkflowNode[] {
  const from = STAGE_ORDER.indexOf(target)
  const to = STAGE_ORDER.indexOf('verify')
  if (from < 0 || to < 0 || from > to) return [target]
  return STAGE_ORDER.slice(from, to + 1)
}

/**
 * Detect every drift signal for one change, optionally writing the
 * `drift-detected` projection event when any fires.
 * @param ctx - stage context.
 * @param status - recovered status (must be a non-terminal active change).
 * @param observation - current Git/baseline facts.
 * @param options - record + signal controls.
 * @returns all detected signals (may be empty).
 */
export async function detectAndRecord(
  ctx: StageContext,
  status: WorkflowStatus,
  observation: DriftObservation,
  options: { readonly record: boolean } = { record: true },
): Promise<readonly DriftSignal[]> {
  if (status.terminal !== undefined) return []
  const locked = lockedFromStatus(status)
  const identitySignals = compareToLocked(locked, observation)
  const artifactSignals = await scanCompletedArtifacts(ctx.workspace.root, status.changeId, status)
  const report = await readVerifyReport(ctx.workspace.root, status.changeId)
  const stale = verifyReportStaleness(report, observation)
  const signals: readonly DriftSignal[] = stale === undefined
    ? [...identitySignals, ...artifactSignals]
    : [...identitySignals, ...artifactSignals, stale]

  if (signals.length === 0 || !options.record) return signals

  const primary = signals[0]
  if (primary === undefined) return signals
  await ctx.store.append(status.changeId, status.projectionVersion, meta => ({
    type: 'drift-detected',
    node: earliestAffectedNode(status, signals),
    cause: `${primary.trigger}: ${primary.detail}`,
    ...meta,
  }))
  return signals
}

/**
 * Recover the drift signal set without recording (for read-only probes).
 * @param ctx - stage context.
 * @param status - recovered status.
 * @param observation - current facts.
 * @returns signals.
 */
export async function detectDrift(
  ctx: StageContext,
  status: WorkflowStatus,
  observation: DriftObservation,
): Promise<readonly DriftSignal[]> {
  return detectAndRecord(ctx, status, observation, { record: false })
}

/**
 * Convenience re-exports for callers that prefer the lower-level pieces.
 */
export type { VerifyReport }
