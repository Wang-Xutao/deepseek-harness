/**
 * 【变更】2026-10-26 (批次二十七 1): the update tag's new home.
 *
 * The chip used to sit at the end of the Settings trigger at the sidebar
 * foot. It now rides the sidebar's brand row, right of the version capsule:
 * the version the app runs and the news that a newer one exists read as one
 * line, and the chip opens the 版本与更新 page directly. The occupant is
 * registered into the sidebar's `sidebar.brand.trailing` hole, so the chip
 * lives OUTSIDE the brand's own button (the brand doubles as a New Session
 * shortcut — one button may not nest another).
 */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.brand.trailing' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import type { createSettingsShellStore } from './shell-store.ts'
import { useBafUpdateAvailable } from './baf-update-dot.ts'
import css from './SidebarUpdateTag.module.css'

/**
 * Props of the brand-row update tag: the settings shell's declared store
 * seat (the chip opens a section through it) plus the settings dictionary.
 */
export type SidebarUpdateTagProps = PropsRuntime<'sidebar.brand.trailing'>
  & PropsStore<ReturnType<typeof createSettingsShellStore>>
  & PropsLocale<'settings'>

/**
 * Render the update chip beside the sidebar's version capsule.
 *
 * The chip carries its label only: the brand row is a narrow column, and a
 * glyph next to the version capsule would buy nothing the version does not
 * already say — the words do. The wordmark yields the width instead (it
 * ellipsizes), so the capsule and the chip are never clipped.
 * @param props - The shell's store seat and the settings dictionary.
 * @returns The chip, or nothing while the shell reports no pending update.
 */
export function SidebarUpdateTag({ actions, t }: SidebarUpdateTagProps) {
  const updateAvailable = useBafUpdateAvailable()
  if (!updateAvailable) return null
  return (
    <Tooltip label={t('update.tagHint')} side="bottom">
      <button
        type="button"
        className={css.tag}
        data-testid="sidebar-update-tag"
        aria-label={t('update.tagHint')}
        onClick={() => { actions.openSection('version-updates') }}
      >
        <span>{t('update.tag')}</span>
      </button>
    </Tooltip>
  )
}
