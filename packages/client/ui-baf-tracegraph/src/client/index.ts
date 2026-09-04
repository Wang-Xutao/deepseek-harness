/**
 * Browser half temporarily stubbed after upstream removed `dsh-client-runtime`
 * and reshaped Conversation/Chat snapshots (LegacyConversationSlice moved to
 * ui-chat). Host settings registration in `../index.ts` remains active.
 *
 * TODO(baf): rewrite TraceGraphView against ui-chat LegacyConversationSlice +
 * ui-trajectory before re-enabling the conversation view tab.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** No client services required while the view is stubbed. */
export const inject = [] as const

/**
 * No-op client apply until the trace-graph view is ported to 0.1.3-alpha.1 APIs.
 * @param _ctx - client root context.
 */
export function apply(_ctx: ClientContext): void {}
