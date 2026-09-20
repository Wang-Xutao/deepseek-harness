/**
 * Legal-drive pipeline binding stage handlers to WorkflowService.transition
 * (§5.6): transition adjudicates first, the handler produces artifacts, and
 * only then is `stage-completed` recorded. Model narration never drives this.
 * @module @deepseek-ai/dsh-baf-workflow/stages/pipeline
 */

import { join } from 'node:path'
import {
  BafError,
  type BaselineManifest,
  type GuardPolicy,
  isHumanSource,
  type StackAdapter,
  type TransitionSource,
  type WorkflowStatus,
  type WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES, createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'
import { assertTransitionAccepted, decideTransition } from '../transition.ts'
import { ProjectionStore } from '../projection.ts'
import { createStageContext, type StageContext } from './context.ts'
import { driveOpen, type OpenStageResult } from './open.ts'
import {
  driveClarify,
  renderClarifyBody,
  type ClarifyInput,
  type ClarifyStageResult,
} from './clarify.ts'
import { driveDesign, renderDesignBody, type DesignInput, type DesignStageResult } from './design.ts'
import {
  drivePlan,
  renderPlanBody,
  type PlanInput,
  type PlanStageResult,
} from './plan.ts'
import {
  driveImplementComplete,
  readLedger,
  type ImplementStageResult,
} from './implement.ts'
import { driveVerify, type VerifyStageResult } from './verify.ts'
import { driveArchive, type ArchiveStageResult } from './archive.ts'
import {
  detectAndRecord,
  detectDrift,
  earliestAffectedNode,
  hashCanonical,
  resumeCandidates,
  type DriftObservation,
  type DriftSignal,
} from './drift.ts'
import { clarifyGate, designGate, planGate } from './gates.ts'
import { stageArtifactPaths } from './artifacts.ts'
import { writeArtifact } from './write.ts'
import {
  driveAbandon,
  type AbandonOptions,
  type AbandonStageResult,
} from './abandon.ts'
import {
  driveBugFixPathOpen,
  rootCauseRecorded,
  type BugFixPathBugInput,
} from './bug-fix-path.ts'
import {
  driveEscalate,
  scopeGrowthFiles,
  type EscalateOptions,
  type EscalateStageResult,
} from './escalate.ts'

/** Options for {@link StagePipeline}. */
export interface StagePipelineOptions {
  readonly store: ProjectionStore
  /** Workspace root for artifacts and projection. */
  readonly workspaceRoot: string
  /** Git facts; full-go-path open blocks without a revision. */
  readonly gitRevision?: string
  /** Baseline governing the chain; full-go-path open requires it. */
  readonly baseline?: BaselineManifest
  /** Phase 7 quality adapter (wired rows gate verify). */
  readonly stack?: StackAdapter
  /** Phase 7 guard policy (wired rows gate verify). */
  readonly guard?: GuardPolicy
}

/** Result of {@link StagePipeline.driveDriftStage}. */
export interface DriftStageResult {
  readonly signals: readonly DriftSignal[]
  readonly recorded: boolean
}

/** Result of {@link StagePipeline.resumeOptions} — the T13 candidate card. */
export interface ResumeOptionsResult {
  readonly status: WorkflowStatus
  readonly signals: readonly DriftSignal[]
  /** Legal T13 targets, latest-first; index 0 is the recommended default. */
  readonly candidates: readonly WorkflowNode[]
  /** The evidence-derived anchor (`earliestAffectedNode`). */
  readonly anchor: WorkflowNode
}

/** Result of {@link StagePipeline.driveResumeStage}. */
export interface ResumeStageResult {
  readonly target: WorkflowNode
  readonly anchor: WorkflowNode
  readonly signals: readonly DriftSignal[]
  readonly candidates: readonly WorkflowNode[]
}

/** Discriminated drive results per node. */
export type DriveResult =
  | { readonly node: 'open'; readonly result: OpenStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'clarify'; readonly result: ClarifyStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'design'; readonly result: DesignStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'plan'; readonly result: PlanStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'drift'; readonly result: DriftStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'resume'; readonly result: ResumeStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'abandon'; readonly result: AbandonStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'implement'; readonly result: ImplementStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'escalate'; readonly result: EscalateStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'verify'; readonly result: VerifyStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'archive'; readonly result: ArchiveStageResult; readonly status: WorkflowStatus }

/**
 * End-to-end driver for one change chain over one workspace.
 * Each `drive*` call follows: decideTransition → handler artifacts →
 * stage-completed (when the node finishes).
 */
export class StagePipeline {
  private readonly store: ProjectionStore
  private readonly ctx: StageContext

  constructor(options: StagePipelineOptions) {
    this.store = options.store
    this.ctx = createStageContext({
      store: options.store,
      adapter: createLocalOpenSpecAdapter({ workspaceRoot: options.workspaceRoot }),
      workspace: {
        root: options.workspaceRoot,
        ...(options.gitRevision === undefined
          ? {}
          : { git: { revision: options.gitRevision } }),
      },
      ...(options.baseline === undefined ? {} : { baseline: options.baseline }),
      ...(options.stack === undefined ? {} : { stack: options.stack }),
      ...(options.guard === undefined ? {} : { guard: options.guard }),
    })
  }

  /**
   * Shared stage context (handlers/tests may close over the same binding).
   * @returns frozen context.
   */
  context(): StageContext {
    return this.ctx
  }

  /**
   * Drive open (T2/T3): transition intake → open, create the skeleton.
   * @param changeId - change id.
   * @param title - change title.
   * @returns drive result.
   */
  async driveOpenStage(changeId: string, title: string, source?: TransitionSource): Promise<DriveResult> {
    // Preconditions (Git/baseline/OpenSpec probe) run before any projection
    // write so a blocked open leaves the change at intake with only a
    // transition-rejected audit event.
    const pre = await this.store.readStatus(changeId)
    if (pre.mode === 'bug-fix-path') {
      // Fast-path changes carry a bug record, not an OpenSpec skeleton.
      await this.recordRejectionQuiet(changeId, pre, 'open', 'invalid_transition')
      throw new BafError(
        'invalid_transition',
        'bug-fix-path change must use driveBugFixPathOpenStage',
        { changeId },
      )
    }
    if (pre.mode === 'full-go-path') {
      if (this.ctx.baseline === undefined) {
        throw new BafError('baseline_unavailable', 'full-go-path open requires a parsed baseline', {
          changeId,
        })
      }
      if (this.ctx.workspace.git?.revision === undefined) {
        await this.recordRejectionQuiet(changeId, pre, 'open', 'invalid_transition')
        throw new BafError(
          'invalid_transition',
          'full-go-path open blocks when local Git is unavailable',
          { changeId },
        )
      }
    }
    const status = await this.enterStage(changeId, 'open', undefined, undefined, source)
    const result = await driveOpen(this.ctx, changeId, title)
    // Lock the baseline + source revision the moment open succeeds so drift
    // detection can compare against immutable anchors for the rest of the chain.
    const baseline = this.ctx.baseline
    const revision = this.ctx.workspace.git?.revision
    if (baseline !== undefined && revision !== undefined) {
      await this.store.append(changeId, status.projectionVersion, meta => ({
        type: 'baseline-locked',
        lock: {
          baselineId: baseline.baselineId,
          sourceRevision: revision,
          lockedAt: meta.at,
          // The content hash must be taken from the *manifest* here, while the
          // full manifest is in hand — the lock only stores identity fields,
          // so hashing it later can never reproduce this value.
          contentHash: hashCanonical(baseline),
        },
        ...meta,
      }))
    }
    await this.completeStage(changeId, 'open', [result.changeDir])
    return { node: 'open', result, status }
  }

  /**
   * Drive the fast-path open (T3): minimal bug record + fast-path implement
   * ledger instead of the OpenSpec skeleton (§12 Phase 6). Git-unavailable
   * warns in the record instead of blocking; baseline-locked still applies
   * when both anchors are known.
   * @param input - bug fields (problem/root cause/regression test/scope).
   * @returns drive result.
   */
  async driveBugFixPathOpenStage(input: BugFixPathBugInput, source?: TransitionSource): Promise<DriveResult> {
    const pre = await this.store.readStatus(input.changeId)
    if (pre.mode !== 'bug-fix-path') {
      await this.recordRejectionQuiet(input.changeId, pre, 'open', 'invalid_transition')
      throw new BafError(
        'invalid_transition',
        'full-go-path change must use driveOpenStage',
        { changeId: input.changeId },
      )
    }
    const status = await this.enterStage(input.changeId, 'open', undefined, undefined, source)
    const result = await driveBugFixPathOpen(this.ctx, input)
    // Same anchor discipline as full-go-path open: lock the baseline + revision
    // when both are observable; a missing revision only warns (recorded in
    // the bug record by the handler).
    const baseline = this.ctx.baseline
    const revision = this.ctx.workspace.git?.revision
    if (baseline !== undefined && revision !== undefined) {
      await this.store.append(input.changeId, status.projectionVersion, meta => ({
        type: 'baseline-locked',
        lock: {
          baselineId: baseline.baselineId,
          sourceRevision: revision,
          lockedAt: meta.at,
          contentHash: hashCanonical(baseline),
        },
        ...meta,
      }))
    }
    const changeDirPath = join(
      this.ctx.workspace.root,
      'openspec',
      'changes',
      input.changeId,
    )
    await this.completeStage(input.changeId, 'open', result.artifacts)
    return {
      node: 'open',
      result: { status: result.status, changeDir: changeDirPath },
      status,
    }
  }

  /**
   * Drive clarify (T4 entry + T6 completion).
   * @param input - clarify fields.
   * @returns drive result.
   */
  async driveClarifyStage(input: ClarifyInput): Promise<DriveResult> {
    const status = await this.enterStage(input.changeId, 'clarify')
    const result = await driveClarify(this.ctx, input)
    await this.completeStage(input.changeId, 'clarify', result.artifacts)
    return { node: 'clarify', result, status }
  }

  /**
   * Drive design (T6 + T7).
   * @param input - design fields.
   * @returns drive result.
   */
  async driveDesignStage(input: DesignInput): Promise<DriveResult> {
    const status = await this.enterStage(input.changeId, 'design')
    const result = await driveDesign(this.ctx, input)
    await this.completeStage(input.changeId, 'design', result.artifacts)
    return { node: 'design', result, status }
  }

  /**
   * Drive plan (T7 + T8).
   * @param input - plan fields.
   * @returns drive result.
   */
  async drivePlanStage(input: PlanInput, source?: TransitionSource): Promise<DriveResult> {
    const status = await this.enterStage(input.changeId, 'plan', undefined, undefined, source)
    const result = await drivePlan(this.ctx, input)
    await this.completeStage(input.changeId, 'plan', result.artifacts)
    return { node: 'plan', result, status }
  }

  /**
   * Enter implement (T8 full-go-path / T5 fast-path) without running the
   * completion gate. The fast-path edge carries machine evidence read back
   * from the bug record — never a caller assertion.
   * Callers run per-task work (recordTouched/completeTask) and then finish
   * with {@link driveImplementStage}.
   * @param changeId - change id.
   * @returns status after entering implement.
   */
  async enterImplementStage(changeId: string, source?: TransitionSource): Promise<WorkflowStatus> {
    const pre = await this.readCurrent(changeId)
    if (pre.mode === 'bug-fix-path') {
      return this.enterStage(changeId, 'implement', {
        rootCauseRecorded: await rootCauseRecorded(this.ctx.workspace.root, changeId),
      }, undefined, source)
    }
    return this.enterStage(changeId, 'implement', undefined, undefined, source)
  }

  /**
   * Drive implement completion (T9 exit): every task done and touched ⊆
   * allowlist. On a fast-path change, out-of-allowlist touched files first
   * trigger the T15 auto-escalation (§12 Phase 6) instead of a plain gate
   * failure. Refuses when not inside implement.
   * @param changeId - change id.
   * @returns drive result.
   */
  async driveImplementStage(changeId: string): Promise<DriveResult> {
    const status = await this.readCurrent(changeId)
    if (status.current !== 'implement') {
      throw new BafError('invalid_transition', `implement gate driven from ${status.current}`, {
        changeId,
        from: status.current,
      })
    }
    if (status.mode === 'bug-fix-path') {
      const ledger = await readLedger(this.ctx.workspace.root, changeId)
      const growth = scopeGrowthFiles(ledger)
      if (growth.length > 0) {
        const escalated = await driveEscalate(this.ctx, {
          changeId,
          cause: `scope growth: ${growth.join(', ')} outside allowlist`,
        })
        return {
          node: 'implement',
          result: {
            status: escalated.status,
            artifacts: [],
            ledger,
            escalated: { cause: escalated.cause },
          },
          status: escalated.status,
        }
      }
    }
    const result = await driveImplementComplete(this.ctx, changeId)
    await this.completeStage(changeId, 'implement', result.artifacts)
    return { node: 'implement', result, status }
  }

  /**
   * Drive an explicit T15 escalation (semantic causes the structural
   * scope-growth check cannot see, e.g. public-API impact discovered during
   * the fix). Only legal from fast-path implement.
   * @param options - change id + cause.
   * @returns drive result.
   */
  async driveEscalateStage(options: EscalateOptions): Promise<DriveResult> {
    const result = await driveEscalate(this.ctx, options)
    return { node: 'escalate', result, status: result.status }
  }

  /**
   * Adjudicate completion of a documentation stage whose artifact the model
   * authored through guarded writes after a `begin` drive installed the
   * template (§5.6: model writes artifacts, domain adjudicates completion).
   * Runs the node's durable gate and records `stage-completed` only when it
   * passes; never writes the artifact itself.
   * @param changeId - change id.
   * @param node - documentation node to complete (clarify/design/plan).
   * @returns status after the completion attempt.
   * @throws {BafError} invalid_transition when not in-progress on that node
   * or the gate refuses the current artifact.
   */
  async completeDocStage(
    changeId: string,
    node: 'clarify' | 'design' | 'plan',
  ): Promise<WorkflowStatus> {
    const status = await this.readCurrent(changeId)
    if (status.current !== node || status.nodes[node] !== 'in-progress') {
      throw new BafError(
        'invalid_transition',
        `${node} completion requires an in-progress ${node} stage (current: ${String(status.current)})`,
        { changeId, node, reasonCodes: ['stage_incomplete'] },
      )
    }
    const mode = status.mode === 'bug-fix-path' ? 'bug-fix-path' as const : 'full-go-path' as const
    const gateInput = { workspaceRoot: this.ctx.workspace.root, changeId, mode }
    const gate = node === 'clarify'
      ? await clarifyGate(gateInput)
      : node === 'design'
        ? await designGate(gateInput)
        : await planGate(gateInput)
    if (!gate.ok) {
      throw new BafError(
        'invalid_transition',
        `${node} gate failed: ${gate.reasonCodes.join(', ')} — ${gate.detail ?? ''}`,
        { changeId, node, reasonCodes: gate.reasonCodes },
      )
    }
    const artifacts = stageArtifactPaths(this.ctx.workspace.root, changeId, [
      node === 'clarify' ? ARTIFACT_FILES.clarify : node === 'design' ? ARTIFACT_FILES.design : ARTIFACT_FILES.plan,
    ])
    await this.completeStage(changeId, node, artifacts)
    return this.readCurrent(changeId)
  }

  /**
   * Begin a documentation stage: adjudicate entry (transition table) and
   * install the unfilled template artifacts without running the completion
   * gate. The model then authors the real content through guarded writes and
   * the caller finishes with {@link completeDocStage}.
   * @param changeId - change id.
   * @param node - documentation node to begin (clarify/design/plan).
   * @returns status after entering the node.
   * @throws {BafError} invalid_transition when the entry edge is illegal.
   */
  async beginDocStage(
    changeId: string,
    node: 'clarify' | 'design' | 'plan',
    source?: TransitionSource,
  ): Promise<WorkflowStatus> {
    await this.enterStage(changeId, node, undefined, undefined, source)
    if (node === 'clarify') {
      await writeArtifact(this.ctx.workspace.root, changeId, ARTIFACT_FILES.clarify, renderClarifyBody({
        changeId, questions: [], acceptanceCriteria: [],
      }))
    } else if (node === 'design') {
      await writeArtifact(this.ctx.workspace.root, changeId, ARTIFACT_FILES.design, renderDesignBody({
        changeId, approach: 'TODO: chosen approach — interfaces, data flow, error paths, compatibility.', references: [],
      }))
    } else {
      await writeArtifact(this.ctx.workspace.root, changeId, ARTIFACT_FILES.plan, renderPlanBody({
        changeId, tasks: [], allowlist: [],
      }))
      await writeArtifact(
        this.ctx.workspace.root,
        changeId,
        ARTIFACT_FILES.planJson,
        `${JSON.stringify({ tasks: [], allowlist: [], touched: [] }, null, 2)}\n`,
      )
    }
    return this.readCurrent(changeId)
  }

  /**
   * Drive verify (T9 entry + check run + T10/T11 verdict).
   * @param changeId - change id.
   * @param signal - cancellation for the check run.
   * @returns drive result with the T11 verdict.
   */
  async driveVerifyStage(
    changeId: string,
    signal: AbortSignal = new AbortController().signal,
    source?: TransitionSource,
  ): Promise<DriveResult> {
    const status = await this.enterStage(changeId, 'verify')
    const result = await driveVerify(this.ctx, changeId, signal)
    if (result.backToImplement) {
      await this.failStage(changeId, 'verify', 'required checks failed')
      // T11: required check failed → re-enter implement for the fix loop.
      const statusAfterFail = await this.store.readStatus(changeId)
      const decision = decideTransition({
        status: statusAfterFail,
        to: 'implement',
      })
      if (decision.accepted) {
        const { status: returned } = await this.store.append(
          changeId,
          statusAfterFail.projectionVersion,
          meta => ({
            type: 'stage-entered',
            node: 'implement',
            ...(source === undefined ? {} : { source }),
            ...meta,
          }),
        )
        return { node: 'verify', result, status: returned }
      }
      return { node: 'verify', result, status: statusAfterFail }
    }
    await this.completeStage(changeId, 'verify', [result.reportPath])
    return { node: 'verify', result, status }
  }

  /**
   * Drive archive (T10 entry + T14 completion).
   * @param changeId - change id.
   * @param humanConfirmed - explicit user confirmation.
   * @returns drive result.
   */
  async driveArchiveStage(
    changeId: string,
    humanConfirmed: boolean,
    source?: TransitionSource,
  ): Promise<DriveResult> {
    // §22.15 B: archive never passes through `decideTransition` (the
    // change-archived event is appended raw), so the confirm-edge source
    // guard cannot reach it from `checkEvidence`. Re-check here.
    if (!isHumanSource(source)) {
      throw new BafError(
        'gate_confirmation_required',
        'archive (T14) requires a human-originated drive; use /baf-workflow-archive confirm or the 工作流 Tab',
        { changeId, source: source ?? null },
      )
    }
    // T10 requires the verify gate's machine evidence, not narration.
    await this.enterStage(changeId, 'archive', { checksPassed: true }, undefined, source)
    const result = await driveArchive(this.ctx, changeId, humanConfirmed)
    const { status: final } = await this.store.append(changeId, result.status.projectionVersion, meta => ({
      type: 'change-archived',
      ...(source === undefined ? {} : { source }),
      ...meta,
    }))
    return { node: 'archive', result, status: final }
  }

  /**
   * Detect drift against the projection's locked evidence and record a
   * `drift-detected` event when any signal fires (Phase 5.8).
   *
   * Pure detection: T13 (drift → earliest affected node) is the caller's
   * decision through {@link driveResumeStage}; this method only records
   * the drift signal set.
   * @param changeId - change id.
   * @param observation - optional override for current Git/baseline facts.
   * @returns drive result with detected signals.
   */
  async driveDriftStage(
    changeId: string,
    observation?: DriftObservation,
  ): Promise<DriveResult> {
    const status = await this.store.readStatus(changeId)
    const signals = await detectAndRecord(this.ctx, status, this.observe(observation), { record: true })
    const recorded = signals.length > 0
    const next = recorded ? await this.store.readStatus(changeId) : status
    const result: DriftStageResult = { signals, recorded }
    return { node: 'drift', result, status: next }
  }

  /**
   * Compute the T13 candidate set for a drifted change **without** touching
   * the projection (§19.2). Read-only: safe to call from a card render, from
   * `/baf-go`'s drift route, or from the session gate's state check.
   * @param changeId - change id.
   * @param observation - optional override for current Git/baseline facts.
   * @returns status, signals, evidence-derived anchor and legal targets.
   */
  async resumeOptions(
    changeId: string,
    observation?: DriftObservation,
  ): Promise<ResumeOptionsResult> {
    const status = await this.store.readStatus(changeId)
    const signals = await detectDrift(this.ctx, status, this.observe(observation))
    const anchor = earliestAffectedNode(status, signals)
    const candidates = resumeCandidates(status, signals)
    return { status, signals, candidates, anchor }
  }

  /**
   * Drive the T13 drift exit: re-enter the customer-chosen node (§19.3).
   *
   * The target is validated against the evidence-derived candidate set, so a
   * customer can roll back *earlier* than the anchor but never skip forward
   * past it. An already-resolved change (not parked on `drift`) is refused —
   * there is nothing to resume.
   * @param changeId - change id.
   * @param target - chosen candidate node.
   * @param observation - optional override for current Git/baseline facts.
   * @returns drive result with the entered node.
   */
  async driveResumeStage(
    changeId: string,
    target: WorkflowNode,
    observation?: DriftObservation,
    source?: TransitionSource,
  ): Promise<DriveResult> {
    const options = await this.resumeOptions(changeId, observation)
    const { status } = options
    if (status.current !== 'drift') {
      throw new BafError('invalid_transition', 'change is not parked in drift', {
        changeId,
        current: status.current,
      })
    }
    if (!options.candidates.includes(target)) {
      await this.recordRejection(changeId, status, target, 'invalid_transition')
      throw new BafError('invalid_transition', `resume target ${target} outside the candidate set`, {
        changeId,
        target,
        anchor: options.anchor,
        candidates: [...options.candidates],
      })
    }
    const signals = options.signals
    const primary = signals[0]
    const cause = primary === undefined
      ? `drift-resume: ${options.anchor} → ${target}`
      : `drift-resume: ${options.anchor} → ${target} (${primary.trigger})`
    const entered = await this.enterStage(changeId, target, undefined, cause, source)
    const result: ResumeStageResult = {
      target,
      anchor: options.anchor,
      signals,
      candidates: options.candidates,
    }
    return { node: 'resume', result, status: entered }
  }

  /**
   * Drive abandon (T16): explicit user confirmation → `change-abandoned`.
   * Refuses without confirmation; idempotent when already terminal.
   * @param options - change id and human confirmation.
   * @returns drive result.
   */
  async driveAbandonStage(options: AbandonOptions, source?: TransitionSource): Promise<DriveResult> {
    const merged: AbandonOptions = source === undefined ? options : { ...options, source }
    const result = await driveAbandon(this.ctx, merged)
    return { node: 'abandon', result, status: result.status }
  }

  /**
   * Resolve the drift observation: the caller override **merged over** the
   * pipeline's own Git/baseline binding, so a caller may override one field
   * (e.g. simulate a moved HEAD) without the other being read as "now
   * unavailable", which would fabricate a signal.
   * @param observation - optional caller override.
   * @returns observation.
   */
  private observe(observation?: DriftObservation): DriftObservation {
    const bound: DriftObservation = {
      ...(this.ctx.workspace.git?.revision === undefined
        ? {}
        : { gitRevision: this.ctx.workspace.git.revision }),
      ...(this.ctx.baseline === undefined ? {} : { baseline: this.ctx.baseline }),
    }
    if (observation === undefined) return bound
    return { ...bound, ...observation }
  }

  /**
   * Adjudicate and record entry into a node (stage-entered).
   * @param changeId - change id.
   * @param to - target node.
   * @param evidence - optional machine evidence for evidence-gated edges.
   * @param cause - optional reason recorded on the event (§19.3).
   * @returns status before entering (for evidence).
   */
  private async enterStage(
    changeId: string,
    to: WorkflowNode,
    evidence?: Readonly<Record<string, unknown>>,
    cause?: string,
    source?: TransitionSource,
  ): Promise<WorkflowStatus> {
    const status = await this.store.readStatus(changeId)
    // Idempotent resume: the node is already in-progress (e.g. clarify was
    // entered by a T15 escalation) — re-adjudicating would reject on the
    // self-edge that does not exist in the table.
    if (status.current === to && status.nodes[to] === 'in-progress') return status
    // §22.15 B: the confirm-edge source guard runs inside `checkEvidence`,
    // which reads `evidence.source`. Forward `source` so the guard sees the
    // drive origin; non-confirm edges ignore the field.
    const evidenceWithSource: Record<string, unknown> = {
      ...(evidence ?? {}),
      ...(source === undefined ? {} : { source }),
    }
    const decision = decideTransition({
      status,
      to,
      evidence: evidenceWithSource,
    })
    if (!decision.accepted) {
      await this.recordRejection(changeId, status, to, decision.reason ?? 'invalid_transition')
      const from = status.current === 'completed' || status.current === 'abandoned'
        ? null
        : status.current
      assertTransitionAccepted(decision, from, to)
    }
    const { status: next } = await this.store.append(changeId, status.projectionVersion, meta => ({
      type: 'stage-entered',
      node: to,
      ...(cause === undefined ? {} : { cause }),
      ...(source === undefined ? {} : { source }),
      ...meta,
    }))
    return next
  }

  /**
   * Record stage-completed with artifact evidence.
   * @param changeId - change id.
   * @param node - finished node.
   * @param artifacts - artifact paths.
   */
  private async completeStage(
    changeId: string,
    node: WorkflowNode,
    artifacts: readonly string[],
  ): Promise<void> {
    const status = await this.readCurrent(changeId)
    const { status: next } = await this.store.append(changeId, status.projectionVersion, meta => ({
      type: 'stage-completed',
      node,
      artifacts: [...artifacts],
      ...meta,
    }))
    void next
  }

  /**
   * Record stage-failed (verify T11 stays in projection as failed).
   * @param changeId - change id.
   * @param node - failed node.
   * @param reason - stable reason summary.
   */
  private async failStage(changeId: string, node: WorkflowNode, reason: string): Promise<void> {
    const status = await this.readCurrent(changeId)
    await this.store.append(changeId, status.projectionVersion, meta => ({
      type: 'stage-failed',
      node,
      reason,
      ...meta,
    }))
  }

  /**
   * Append a transition-rejected audit event (mirror of WorkflowService).
   * @param changeId - change id.
   * @param status - observed status.
   * @param to - attempted target.
   * @param reason - rejection reason code.
   */
  private async recordRejection(
    changeId: string,
    status: WorkflowStatus,
    to: WorkflowNode,
    reason: string,
  ): Promise<void> {
    const from = status.current === 'completed' || status.current === 'abandoned'
      ? null
      : status.current
    await this.store.append(changeId, status.projectionVersion, meta => ({
      type: 'transition-rejected',
      from,
      to,
      reason,
      ...meta,
    })).catch(() => undefined)
  }
  /**
   * Append a transition-rejected audit event without throwing (pre-gate
   * blocks that bypass decideTransition).
   * @param changeId - change id.
   * @param status - observed status.
   * @param to - attempted target.
   * @param reason - rejection reason code.
   */
  private async recordRejectionQuiet(
    changeId: string,
    status: WorkflowStatus,
    to: WorkflowNode,
    reason: string,
  ): Promise<void> {
    await this.store.append(changeId, status.projectionVersion, meta => ({
      type: 'transition-rejected',
      from: status.current,
      to,
      reason,
      ...meta,
    })).catch(() => undefined)
  }

  private async readCurrent(changeId: string): Promise<WorkflowStatus> {
    return this.store.readStatus(changeId)
  }
}
