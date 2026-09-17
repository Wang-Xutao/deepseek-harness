/**
 * Host Typert Remote for the BAF 工作流 Tab.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow
 */

import { Context } from '@deepseek-ai/cordis'
import {
  BafError,
  isBafError,
} from '@deepseek-ai/dsh-baf-core'
import {
  ProjectionStore,
  buildWorkflowTabView,
  confirmIntake,
  createWorkflowService,
  pipelineFor,
  rejectIntake,
} from '@deepseek-ai/dsh-baf-workflow'
import type { WorkflowTabResume, WorkflowTabView } from '@deepseek-ai/dsh-baf-core'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowResumeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
  BafWorkflowTransitionRequest,
} from './types.ts'

export type { WorkflowTabView }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-facing BAF workflow Tab Remote. */
    bafWorkflowView: BafWorkflowTabRemote
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'baf-workflow/session-not-found': { readonly sessionId: string }
    'baf-workflow/no-cwd': { readonly sessionId: string }
    'baf-workflow/domain': { readonly code: string; readonly message: string }
  }
}

/** Request carrying the session whose cwd owns the projection. */
export type {
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowResumeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
  BafWorkflowTransitionRequest,
} from './types.ts'

/**
 * Host Remote: assembles {@link WorkflowTabView} and applies semi-interactive mutations.
 */
export class BafWorkflowTabRemote extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence']

  constructor(ctx: Context) {
    super(ctx, 'bafWorkflowView')
  }

  /**
   * Read the Tab view for a session workspace.
   * @param request - session (+ optional change).
   * @returns tab view.
   */
  @Remote('getTabView')
  async getTabView(request: BafWorkflowSessionRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    // Skip the full-log metrics fold on the interactive path so the Tab paints
    // quickly; the dual-lane view still comes through, it only needs the events.
    return buildWorkflowTabView(store, request.changeId, {
      includeMetrics: false,
      resume: this.resumeProvider(cwd),
    })
  }

  /**
   * Classify a new change (pending confirmation).
   * @param request - session + description.
   * @returns updated tab view focused on the new change.
   */
  @Remote('startIntake')
  async startIntake(request: BafWorkflowStartIntakeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    const service = createWorkflowService({ store })
    const cwd = await this.requireCwd(request.sessionId)
    const result = await this.guardDomain(() => service.intake({
      description: request.description,
      workspace: { root: cwd },
    }))
    return buildWorkflowTabView(store, result.intake.changeId)
  }

  /**
   * Confirm pending intake.
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('confirmIntake')
  async confirmIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    await this.guardDomain(() => confirmIntake(store, request.changeId, 'user'))
    return buildWorkflowTabView(store, request.changeId)
  }

  /**
   * Reject pending intake (abandon).
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('rejectIntake')
  async rejectIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    await this.guardDomain(() => rejectIntake(store, request.changeId))
    return buildWorkflowTabView(store, request.changeId)
  }

  /**
   * Request a legal stage transition.
   * @param request - transition request.
   * @returns updated tab view.
   */
  @Remote('transition')
  async transition(request: BafWorkflowTransitionRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    const service = createWorkflowService({ store })
    const status = await store.readStatus(request.changeId)
    await this.guardDomain(() => service.transition({
      changeId: request.changeId,
      from: status.current === 'completed' || status.current === 'abandoned'
        ? null
        : status.current,
      to: request.to,
      ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
    }))
    return buildWorkflowTabView(store, request.changeId)
  }

  /**
   * Drift rollback (§19.5 / T13).
   *
   * Without `node` this only re-reads: the Tab opens its 「复位到…」菜单, and the
   * returned view carries candidates recomputed from live drift evidence. With
   * `node` it drives the rollback — the pipeline re-validates the target
   * against that same candidate set and refuses an illegal one, so the Tab can
   * never roll a change back to a stage the evidence does not support (§19.4:
   * the model must not pick the node, and neither may the UI).
   * @param request - session + change (+ chosen rollback target).
   * @returns updated tab view.
   */
  @Remote('resume')
  async resume(request: BafWorkflowResumeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    const options = { includeMetrics: false, resume: this.resumeProvider(cwd) }
    const target = request.node
    if (target === undefined) {
      return buildWorkflowTabView(store, request.changeId, options)
    }
    const pipeline = await pipelineFor(cwd)
    await this.guardDomain(() => pipeline.driveResumeStage(request.changeId, target))
    return buildWorkflowTabView(store, request.changeId, options)
  }

  /**
   * Read every change in the workspace (Dashboard list view).
   *
   * Returns the full derived index: one row per change with its current stage,
   * mode, projection seq, and timestamp. Drives the Dashboard's archive
   * overview alongside the focused tab view.
   * @param request - session (workspace = session.header.cwd).
   * @returns one entry per change, in projection order.
   */
  @Remote('listChanges')
  async listChanges(request: BafWorkflowSessionRequest): Promise<readonly BafWorkflowChangeRow[]> {
    const { store } = await this.contextFor(request.sessionId)
    const index = await store.readIndex()
    return index.changes.map(c => ({
      changeId: c.changeId,
      mode: c.mode as 'full-go' | 'bug-fast-path' | 'clarify-required',
      current: c.current,
      seq: c.seq,
      updatedAt: c.updatedAt,
    }))
  }

  private async contextFor(sessionId: SessionId): Promise<{ cwd: string; store: ProjectionStore }> {
    const cwd = await this.requireCwd(sessionId)
    return { cwd, store: new ProjectionStore({ workspaceRoot: cwd }) }
  }

  /**
   * Rollback menu for a change parked in drift (§19.5).
   *
   * `detectDrift` probes Git and the stage artifacts, so this is deliberately
   * *not* run on every Tab paint — `buildWorkflowTabView` only calls it once
   * the change is actually parked in `drift`. The anchors and targets come from
   * `StagePipeline.resumeOptions`, the same read the `/baf-workflow-resume`
   * card uses, so the menu and the card can never disagree.
   * @param cwd - session workspace root.
   * @returns provider for {@link buildWorkflowTabView}.
   */
  private resumeProvider(
    cwd: string,
  ): (changeId: string) => Promise<WorkflowTabResume | undefined> {
    return async (changeId: string) => {
      const pipeline = await pipelineFor(cwd)
      const options = await pipeline.resumeOptions(changeId)
      return { anchor: options.anchor, candidates: options.candidates }
    }
  }

  private async requireCwd(sessionId: SessionId): Promise<string> {
    const live = this.ctx.sessions.get(sessionId)
    if (live?.header.cwd !== undefined) return live.header.cwd
    const snap = await this.ctx.sessionPersistence.stat(sessionId)
    if (snap === undefined) {
      throw new RemoteError('baf-workflow/session-not-found', 'session not found', {
        sessionId: String(sessionId),
      })
    }
    const handle = await this.ctx.sessionPersistence.open(sessionId, 'read')
    try {
      const cwd = handle.header.cwd
      if (cwd === undefined) {
        throw new RemoteError('baf-workflow/no-cwd', 'session has no cwd', {
          sessionId: String(sessionId),
        })
      }
      return cwd
    } finally {
      await handle.close()
    }
  }

  private async guardDomain<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof RemoteError) throw error
      if (isBafError(error) || error instanceof BafError) {
        throw new RemoteError('baf-workflow/domain', error.message, {
          code: isBafError(error) ? error.code : 'unknown',
          message: error.message,
        })
      }
      throw error
    }
  }
}

export default BafWorkflowTabRemote
