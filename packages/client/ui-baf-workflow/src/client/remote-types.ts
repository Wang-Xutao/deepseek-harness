/**
 * Client-side module merge for the bafWorkflowView Remote namespace.
 * Mirrors lib/typert.remote-client.d.ts so the Client face typechecks without
 * depending on Host build artifacts beyond the committed remote contribution.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface BafWorkflowSessionRequest {
  readonly sessionId: SessionId
  readonly changeId?: string
}

export interface BafWorkflowChangeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
}

export interface BafWorkflowStartIntakeRequest {
  readonly sessionId: SessionId
  readonly description: string
}

export interface BafWorkflowTransitionRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly to: string
  readonly evidence?: Readonly<Record<string, unknown>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$bafWorkflowView {
    getTabView: (request: BafWorkflowSessionRequest) => Promise<RemoteResult<unknown>>
    startIntake: (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<unknown>>
    confirmIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    rejectIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    transition: (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<unknown>>
  }
  interface TypertRemoteMap {
    'bafWorkflowView/getTabView': (request: BafWorkflowSessionRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/startIntake': (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/confirmIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/rejectIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/transition': (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<unknown>>
  }
  interface TypertRemoteNamespaceMap {
    bafWorkflowView: TypertRemoteNamespace$bafWorkflowView
  }
}

export {}
