/* Hand-maintained Host-for-Client Remote contribution (strict codecs). */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
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

export interface BafWorkflowResumeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly node?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$bafWorkflowView {
    getTabView: (request: BafWorkflowSessionRequest) => Promise<RemoteResult<unknown>>
    startIntake: (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<unknown>>
    confirmIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    rejectIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    transition: (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<unknown>>
    resume: (request: BafWorkflowResumeRequest) => Promise<RemoteResult<unknown>>
  }
  interface TypertRemoteMap {
    'bafWorkflowView/getTabView': (request: BafWorkflowSessionRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/startIntake': (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/confirmIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/rejectIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/transition': (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<unknown>>
    'bafWorkflowView/resume': (request: BafWorkflowResumeRequest) => Promise<RemoteResult<unknown>>
  }
  interface TypertRemoteNamespaceMap {
    bafWorkflowView: TypertRemoteNamespace$bafWorkflowView
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
