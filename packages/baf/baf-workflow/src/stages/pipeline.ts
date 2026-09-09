/**
 * Legal-drive pipeline binding stage handlers to WorkflowService.transition
 * (§5.6): transition adjudicates first, the handler produces artifacts, and
 * only then is `stage-completed` recorded. Model narration never drives this.
 * @module @deepseek-ai/dsh-baf-workflow/stages/pipeline
 */

import {
  BafError,
  type BaselineManifest,
  type WorkflowStatus,
  type WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'
import { createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'
import { assertTransitionAccepted, decideTransition } from '../transition.ts'
import { ProjectionStore } from '../projection.ts'
import { createStageContext, type StageContext } from './context.ts'
import { driveOpen, type OpenStageResult } from './open.ts'
import {
  driveClarify,
  type ClarifyInput,
  type ClarifyStageResult,
} from './clarify.ts'
import { driveDesign, type DesignInput, type DesignStageResult } from './design.ts'
import { drivePlan, type PlanInput, type PlanStageResult } from './plan.ts'
import {
  driveImplementComplete,
  type ImplementStageResult,
} from './implement.ts'
import { driveVerify, type VerifyStageResult } from './verify.ts'
import { driveArchive, type ArchiveStageResult } from './archive.ts'

/** Options for {@link StagePipeline}. */
export interface StagePipelineOptions {
  readonly store: ProjectionStore
  /** Workspace root for artifacts and projection. */
  readonly workspaceRoot: string
  /** Git facts; full-go open blocks without a revision. */
  readonly gitRevision?: string
  /** Baseline governing the chain; full-go open requires it. */
  readonly baseline?: BaselineManifest
}

/** Discriminated drive results per node. */
export type DriveResult =
  | { readonly node: 'open'; readonly result: OpenStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'clarify'; readonly result: ClarifyStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'design'; readonly result: DesignStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'plan'; readonly result: PlanStageResult; readonly status: WorkflowStatus }
  | { readonly node: 'implement'; readonly result: ImplementStageResult; readonly status: WorkflowStatus }
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
  async driveOpenStage(changeId: string, title: string): Promise<DriveResult> {
    // Preconditions (Git/baseline/OpenSpec probe) run before any projection
    // write so a blocked open leaves the change at intake with only a
    // transition-rejected audit event.
    const pre = await this.store.readStatus(changeId)
    if (pre.mode === 'full-go') {
      if (this.ctx.baseline === undefined) {
        throw new BafError('baseline_unavailable', 'full-go open requires a parsed baseline', {
          changeId,
        })
      }
      if (this.ctx.workspace.git?.revision === undefined) {
        await this.recordRejectionQuiet(changeId, pre, 'open', 'invalid_transition')
        throw new BafError(
          'invalid_transition',
          'full-go open blocks when local Git is unavailable',
          { changeId },
        )
      }
    }
    const status = await this.enterStage(changeId, 'open')
    const result = await driveOpen(this.ctx, changeId, title)
    await this.completeStage(changeId, 'open', [result.changeDir])
    return { node: 'open', result, status }
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
  async drivePlanStage(input: PlanInput): Promise<DriveResult> {
    const status = await this.enterStage(input.changeId, 'plan')
    const result = await drivePlan(this.ctx, input)
    await this.completeStage(input.changeId, 'plan', result.artifacts)
    return { node: 'plan', result, status }
  }

  /**
   * Enter implement (T8) without running the completion gate. Callers run
   * per-task work (recordTouched/completeTask) and then finish with
   * {@link driveImplementStage}.
   * @param changeId - change id.
   * @returns status after entering implement.
   */
  async enterImplementStage(changeId: string): Promise<WorkflowStatus> {
    return this.enterStage(changeId, 'implement')
  }

  /**
   * Drive implement completion (T9 exit): every task done and touched ⊆
   * allowlist. Refuses when not inside implement.
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
    const result = await driveImplementComplete(this.ctx, changeId)
    await this.completeStage(changeId, 'implement', result.artifacts)
    return { node: 'implement', result, status }
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
  ): Promise<DriveResult> {
    const status = await this.enterStage(changeId, 'verify')
    const result = await driveVerify(this.ctx, changeId, signal)
    if (result.backToImplement) {
      await this.failStage(changeId, 'verify', 'required checks failed')
      return { node: 'verify', result, status }
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
  async driveArchiveStage(changeId: string, humanConfirmed: boolean): Promise<DriveResult> {
    // T10 requires the verify gate's machine evidence, not narration.
    await this.enterStage(changeId, 'archive', { checksPassed: true })
    const result = await driveArchive(this.ctx, changeId, humanConfirmed)
    const { status: final } = await this.store.append(changeId, result.status.projectionVersion, meta => ({
      type: 'change-archived',
      ...meta,
    }))
    return { node: 'archive', result, status: final }
  }

  /**
   * Adjudicate and record entry into a node (stage-entered).
   * @param changeId - change id.
   * @param to - target node.
   * @param evidence - optional machine evidence for evidence-gated edges.
   * @returns status before entering (for evidence).
   */
  private async enterStage(
    changeId: string,
    to: WorkflowNode,
    evidence?: Readonly<Record<string, unknown>>,
  ): Promise<WorkflowStatus> {
    const status = await this.store.readStatus(changeId)
    const decision = decideTransition({
      status,
      to,
      ...(evidence === undefined ? {} : { evidence }),
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
