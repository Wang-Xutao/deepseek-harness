/** The General section: feature-owned item contributions plus desktop prefs. */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DesktopClosePrefs } from './DesktopClosePrefs.tsx'
import { DesktopLaunchPrefs } from './DesktopLaunchPrefs.tsx'
import css from './GeneralSection.module.css'

/** Full component props: section owner share plus item render share and locale. */
export type GeneralSectionComponentProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.general.item'>
  & PropsLocale<'settings'>

/**
 * Render the General section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function GeneralSection({ renderSlot, t, ...rest }: GeneralSectionComponentProps) {
  return (
    <div className={css.section}>
      {renderSlot('settings.general.item', {})}
      {/* 【变更】2026-10-06 (问题 2): 开机自启动 rides above the close pref —
          both rows render only inside Electron (bridge-gated). */}
      <DesktopLaunchPrefs {...rest} t={t} />
      <DesktopClosePrefs {...rest} t={t} />
    </div>
  )
}
