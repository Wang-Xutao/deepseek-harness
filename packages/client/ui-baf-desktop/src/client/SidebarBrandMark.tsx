/** Monochrome Sora mark for the sidebar brand row. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SORA_MONO_DATA_URL } from './assets/sora-mono.ts'
import css from './HeroTrailingMark.module.css'

export type SidebarBrandMarkProps = PropsRuntime<'sidebar.brand.mark'>

/**
 * Render the monochrome Sora mark beside the product title.
 * @param props - brand-mark owner props from the sidebar shell.
 */
export function SidebarBrandMark({ size }: SidebarBrandMarkProps) {
  const edge = size > 0 ? size : 24
  return (
    <img
      className={css.mark}
      src={SORA_MONO_DATA_URL}
      width={edge}
      height={edge}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
