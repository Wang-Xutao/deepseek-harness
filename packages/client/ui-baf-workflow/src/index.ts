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
  rejectIntake,
} from '@deepseek-ai/dsh-baf-workflow'
import type { WorkflowTabView } from '@deepseek-ai/dsh-baf-core'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
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
    const store = await this.storeFor(request.sessionId)
    // Skip full-log metrics on the interactive path so the Tab paints quickly.
    return buildWorkflowTabView(store, request.changeId, { includeMetrics: false })
  }

  /**
   * Classify a new change (pending confirmation).
   * @param request - session + description.
   * @returns updated tab view focused on the new change.
   */
  @Remote('startIntake')
  async startIntake(request: BafWorkflowStartIntakeRequest): Promise<WorkflowTabView> {
    const store = await this.storeFor(request.sessionId)
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
    const store = await this.storeFor(request.sessionId)
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
    const store = await this.storeFor(request.sessionId)
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
    const store = await this.storeFor(request.sessionId)
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
    const store = await this.storeFor(request.sessionId)
    const index = await store.readIndex()
    return index.changes.map(c => ({
      changeId: c.changeId,
      mode: c.mode as 'full-go' | 'bug-fast-path' | 'clarify-required',
      current: c.current,
      seq: c.seq,
      updatedAt: c.updatedAt,
    }))
  }

  private async storeFor(sessionId: SessionId): Promise<ProjectionStore> {
    const cwd = await this.requireCwd(sessionId)
    return new ProjectionStore({ workspaceRoot: cwd })
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
