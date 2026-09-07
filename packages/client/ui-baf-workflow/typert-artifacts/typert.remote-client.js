/* Hand-maintained Host-for-Client Remote contribution (strict codecs). */

/**
 * Minimal schema accepted by Client Remote mount (`mode: 'strict'` + parse()).
 * Values stay opaque JSON; Host Remote methods trust TypeScript in-process.
 * @returns {{ parse: (value: unknown) => unknown }}
 */
function opaqueSchema() {
  return {
    parse(value) {
      return value
    },
  }
}

const requestSchema = opaqueSchema()
const tabViewSchema = opaqueSchema()

/**
 * @param {string} name
 * @param {string} typeSymbol
 */
function jsonParam(name, typeSymbol) {
  return {
    name,
    wire: name,
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol,
      schema: requestSchema,
    },
  }
}

/**
 * @param {string} method
 * @param {string} requestSymbol
 */
function remoteDescriptor(method, requestSymbol) {
  return {
    id: `@deepseek-ai/dsh-client-ui-baf-workflow#bafWorkflowView/${method}`,
    service: 'bafWorkflowView',
    namespace: 'bafWorkflowView',
    method,
    invocation: { kind: 'direct' },
    parameters: [jsonParam('request', requestSymbol)],
    result: {
      mode: 'strict',
      typeSymbol: '@deepseek-ai/dsh-baf-core#WorkflowTabView',
      schema: tabViewSchema,
    },
    sourceLocation: { file: 'packages/client/ui-baf-workflow/src/index.ts', line: 1, column: 1 },
  }
}

/** @type {import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution} */
export const TYPERT_REMOTE = {
  package: '@deepseek-ai/dsh-client-ui-baf-workflow',
  descriptors: [
    remoteDescriptor('getTabView', '@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflowSessionRequest'),
    remoteDescriptor('startIntake', '@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflowStartIntakeRequest'),
    remoteDescriptor('confirmIntake', '@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflowChangeRequest'),
    remoteDescriptor('rejectIntake', '@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflowChangeRequest'),
    remoteDescriptor('transition', '@deepseek-ai/dsh-client-ui-baf-workflow#BafWorkflowTransitionRequest'),
  ],
}

export default TYPERT_REMOTE
