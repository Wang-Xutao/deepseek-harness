/**
 * Client-side module merge for the bafWorkflowView Remote namespace.
 * Mirrors lib/typert.remote-client.d.ts so the Client face typechecks without
 * depending on Host build artifacts beyond the committed remote contribution.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkflowTabView } from '@deepseek-ai/dsh-baf-core/types'
import type {
  BafWorkflowChangeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
  BafWorkflowTransitionRequest,
} from '../types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$626166576f726b666c6f7756696577 {
    confirmIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<WorkflowTabView>>
    getTabView: (request: BafWorkflowSessionRequest) => Promise<RemoteResult<WorkflowTabView>>
    rejectIntake: (request: BafWorkflowChangeRequest) => Promise<RemoteResult<WorkflowTabView>>
    startIntake: (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<WorkflowTabView>>
    transition: (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<WorkflowTabView>>
  }
  interface TypertRemoteMap {
    'bafWorkflowView/confirmIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<WorkflowTabView>>
    'bafWorkflowView/getTabView': (request: BafWorkflowSessionRequest) => Promise<RemoteResult<WorkflowTabView>>
    'bafWorkflowView/rejectIntake': (request: BafWorkflowChangeRequest) => Promise<RemoteResult<WorkflowTabView>>
    'bafWorkflowView/startIntake': (request: BafWorkflowStartIntakeRequest) => Promise<RemoteResult<WorkflowTabView>>
    'bafWorkflowView/transition': (request: BafWorkflowTransitionRequest) => Promise<RemoteResult<WorkflowTabView>>
  }
  interface TypertRemoteNamespaceMap {
    'bafWorkflowView': TypertRemoteNamespace$626166576f726b666c6f7756696577
  }
}

export {}
