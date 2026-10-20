/**
 * The sidebar's 工作流 entry icon.
 * 【变更】2026-10-19 (主页面三改 3): the panel kept the baf marking as a corner
 * tag on the glyph. 【变更】2026-10-20 (批次四 3.1): the baf tag MOVED to the
 * row label's top-right corner — it rides as the registration's `badge`
 * option now (rendered by the sidebar next to 工作流), so the glyph is a
 * plain branch icon again and the tag survives icon-size changes.
 */
import type { ReactNode } from 'react'
import { IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the branch glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function WorkflowPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconBranchOutlineRegular size={size} />
}
