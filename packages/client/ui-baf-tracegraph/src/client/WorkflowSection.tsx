/**
 * 工作流 settings section: the slot host for feature-owned workflow rows.
 * 【变更】2026-09-29 (demo23 问题 5): the placeholder rows are gone — the
 * section now renders the `settings.workflow.item` child slot (declared by
 * this plugin's registration in client/index.ts), so each feature package
 * contributes its own workflow preference row the same way General settings
 * composes `settings.general.item`.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkflowSection.module.css'

/** Full component props for the section renderer. */
export type WorkflowSectionProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.workflow.item'>
  & PropsLocale<'baf.workflow'>

/**
 * Render the 工作流 settings page body — the contributed preference rows.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function WorkflowSection({ renderSlot, t }: WorkflowSectionProps) {
  return (
    <div className={css.section} data-testid="workflow-section">
      <h2 className={css.title}>{t('section.title')}</h2>
      <p className={css.intro}>{t('section.intro')}</p>
      <div className={css.rows}>
        {renderSlot('settings.workflow.item', {})}
      </div>
    </div>
  )
}
