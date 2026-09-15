/**
 * Sidebar brand name slot — BAF DSH product name + version badge.
 *
 * Overrides `ui-brand-official`'s "DeepSeek Harness" wordmark so the title row
 * reads "BAF DSH v0.0.14" instead of the upstream product label. The version
 * rides the same inverted capsule the official wordmark uses for its build
 * label (`ui-primitives/BrandWordmark`: a `rx=2` pill filled with the label
 * ink, glyphs knocked out in `--dsw-alias-label-primary-inverted`).
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './SidebarBrandName.module.css'

export type SidebarBrandNameProps = PropsRuntime<'sidebar.brand.name'>

/**
 * Render the BAF DSH product name with its shipped version.
 *
 * The version is hard-coded to match `overlay/desktop/VERSION` (the source of
 * truth for the desktop shell bump). When the desktop bump script advances
 * VERSION, this string is bumped in lockstep so the sidebar wordmark stays in
 * sync.
 */
export function SidebarBrandName(_props: SidebarBrandNameProps) {
  return (
    <>
      <span className={css.name}>BAF DSH</span>
      <span className={css.version}>v0.0.14</span>
    </>
  )
}
