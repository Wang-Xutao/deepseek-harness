/**
 * Stubbed TraceGraphView — full UI pending port to ui-chat LegacyConversationSlice.
 */
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Injected face reserved for the future port. */
export type TraceGraphViewInjected = Record<string, never>

/** No-op conversation view placeholder. */
export function TraceGraphView(_props: ConvViewProps & { injected?: TraceGraphViewInjected }): null {
  return null
}
