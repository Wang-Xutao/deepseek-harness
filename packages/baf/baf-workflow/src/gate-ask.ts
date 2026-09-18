/**
 * Model-facing `baf_gate_ask` tool (§22.9 / §22.14 E).
 *
 * The tool is the model's **only** authorized way to render a confirmation
 * gate card. It does not call any drive, does not touch the projection, and
 * cannot resolve a gate — it only reads the §22 registry and returns the
 * canonical card text. The customer drives the actual transition (Tab
 * button, slash, or CLI), and the matching drive is the one source of
 * transition truth.
 *
 * The tool sits in the **Host** composition (per preset row, outside the
 * `baf-domain` isolate) so the `tools` registry it registers into is the
 * shared one other tools already populate. A broken composition still leaves
 * a session openable: the row is optional, and the tool description
 * explicitly tells the model to read the §22 GATE_REGISTRY even when the
 * tool itself is missing.
 *
 * @module @deepseek-ai/dsh-baf-workflow/gate-ask
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderGate } from './gate-cards.ts'

/** Preset row identity — referenced from `agent.cordis.yml`. */
export const name = 'baf-gate-ask'

/** Service injection list. */
export const inject = ['tools'] as const

/**
 * Tool description — deliberately long. The model reads this verbatim to
 * know the contract: it can ask, never resolve; the §22 registry is the
 * single source of options; the customer must drive the actual command.
 */
const description = [
  'Render a §22 confirmation gate card to the customer. The card comes from',
  'the GATE_REGISTRY — the options are fixed, you cannot add a third path.',
  'Use this tool whenever you would otherwise be tempted to ask the customer',
  '"should I do X or Y?" in prose. Pick the gateId that matches the situation,',
  'call the tool, and copy the rendered text back to the customer. The customer',
  'then drives the actual command (Tab button, `/baf-scaffold`, `/baf-go`, ...).',
  'You MUST NOT synthesize options, paraphrase the card, or call any drive',
  'directly. The customer typing an option number or agreeing in prose is NOT',
  'evidence — point them at the registered command instead.',
].join(' ')

/** Canonical output contract: a single text content block carrying the card. */
const OUTPUT_SCHEMA = {
  type: 'array',
  items: { type: 'json' },
} as const

/**
 * Register the `baf_gate_ask` tool on the host `tools` registry.
 *
 * @param ctx - cordis context; the `tools` service is the only one read.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'baf_gate_ask',
    description,
    parameters: {
      gateId: {
        type: 'string',
        required: true,
        description: 'The §22 gate id. Must be one of: scaffold | intake-classify | design-confirm | verify-archive | abandon | resume. Unknown ids return a refusal card.',
      },
      changeId: {
        type: 'string',
        description: 'Optional active change id. Required for change-scoped gates (intake-classify, design-confirm, verify-archive, abandon, resume). Omit only for workspace-scoped gates (scaffold).',
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => value as unknown as ContentBlock[],
    },
    execute: async (args) => {
      const gateId = typeof args.gateId === 'string' ? args.gateId : ''
      const changeId = typeof args.changeId === 'string' && args.changeId !== '' ? args.changeId : undefined
      // The cwd is not knowable from a tool call alone: Tab and slash pick
      // it from the session header, and the session header is not in the
      // tool-handler context. The card still renders correctly without it —
      // `renderGate` only prepends a "工作区" section when cwd is present,
      // and downstream surfaces (Tab, slash) re-stamp their own cwd. The
      // card is registered registry text either way (§22.3).
      const result = renderGate(gateId, changeId === undefined ? undefined : { cwd: '', changeId })
      const block: ContentBlock = { type: 'text', text: result.text ?? '' }
      return [block] as unknown as JsonValue[]
    },
  }))
}
