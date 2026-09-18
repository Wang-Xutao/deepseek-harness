/* Hand-maintained Host Typert contribution (strict codecs; mirror Remote methods). */

/**
 * Minimal zod-v4-shaped codec schema for typert-loader validation.
 * Values are still accepted as opaque JSON at the wire; Host Remote methods
 * trust TypeScript at the same-process boundary.
 * @returns {{ _zod: object, parse: (value: unknown) => unknown }}
 */
function opaqueSchema() {
  return {
    _zod: {},
    parse(value) {
      return value
    },
  }
}

const requestSchema = opaqueSchema()
const tabViewSchema = opaqueSchema()

/**
 * @param {string} method
 * @returns {object}
 */
function remoteInvocation(method) {
  return {
    id: `@deepseek-ai/dsh-client-ui-baf-workflow#bafWorkflowView/${method}`,
    service: 'bafWorkflowView',
    namespace: 'bafWorkflowView',
    method,
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'request',
        wire: 'request',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: `@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflow${method}Request`,
          schema: requestSchema,
        },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: '@deepseek-ai/dsh-baf-core#WorkflowTabView',
      schema: tabViewSchema,
    },
    sourceLocation: { file: 'packages/client/ui-baf-workflow/src/index.ts', line: 1, column: 1 },
  }
}

export const TYPERT = {
  package: '@deepseek-ai/dsh-client-ui-baf-workflow',
  face: 'host',
  schemas: [],
  invocations: [
    remoteInvocation('getTabView'),
    remoteInvocation('startIntake'),
    remoteInvocation('confirmIntake'),
    remoteInvocation('rejectIntake'),
    remoteInvocation('transition'),
    remoteInvocation('resume'),
    remoteInvocation('listChanges'),
    remoteInvocation('gateResolve'),
  ],
  model: {
    services: [
      {
        description: 'Host-facing BAF workflow Tab Remote.',
        summary: 'Host-facing BAF workflow Tab Remote.',
        tags: [],
        jsDoc: '/** Host-facing BAF workflow Tab Remote. */',
        key: 'bafWorkflowView',
        exportName: 'BafWorkflowTabRemote',
        members: [
          {
            kind: 'method',
            name: 'getTabView',
            signature: "@Remote('getTabView') getTabView(request: BafWorkflowSessionRequest): Promise<WorkflowTabView>",
            summary: 'Read the Tab view for a session workspace.',
            jsDoc: '/** Read the Tab view for a session workspace. */',
          },
          {
            kind: 'method',
            name: 'startIntake',
            signature: "@Remote('startIntake') startIntake(request: BafWorkflowStartIntakeRequest): Promise<WorkflowTabView>",
            summary: 'Classify a new change (pending confirmation).',
            jsDoc: '/** Classify a new change (pending confirmation). */',
          },
          {
            kind: 'method',
            name: 'confirmIntake',
            signature: "@Remote('confirmIntake') confirmIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView>",
            summary: 'Confirm pending intake.',
            jsDoc: '/** Confirm pending intake. */',
          },
          {
            kind: 'method',
            name: 'rejectIntake',
            signature: "@Remote('rejectIntake') rejectIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView>",
            summary: 'Reject pending intake (abandon).',
            jsDoc: '/** Reject pending intake (abandon). */',
          },
          {
            kind: 'method',
            name: 'transition',
            signature: "@Remote('transition') transition(request: BafWorkflowTransitionRequest): Promise<WorkflowTabView>",
            summary: 'Request a legal stage transition.',
            jsDoc: '/** Request a legal stage transition. */',
          },
          {
            kind: 'method',
            name: 'resume',
            signature: "@Remote('resume') resume(request: BafWorkflowResumeRequest): Promise<WorkflowTabView>",
            summary: 'Drift rollback (§19.5).',
            jsDoc: '/** Drift rollback (§19.5). */',
          },
          {
            kind: 'method',
            name: 'listChanges',
            signature: "@Remote('listChanges') listChanges(request: BafWorkflowSessionRequest): Promise<readonly BafWorkflowChangeRow[]>",
            summary: 'Read every change in the workspace (Dashboard list view).',
            jsDoc: '/** Read every change in the workspace (Dashboard list view). */',
          },
          {
            kind: 'method',
            name: 'gateResolve',
            signature: "@Remote('gateResolve') gateResolve(request: BafWorkflowGateResolveRequest): Promise<WorkflowTabView>",
            summary: '§22.14 Tab gate-card resolve: dispatch the registered command for a chosen (gateId, optionId) pair.',
            jsDoc: '/** §22.14 Tab gate-card resolve: dispatch the registered command for a chosen (gateId, optionId) pair. */',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
