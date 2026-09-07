/**
 * 工作流 settings section: placeholder for future BAF workflow preferences.
 * The 轨迹图 toggle lives under General settings (`TraceGraphRow`).
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkflowSection.module.css'

/** Full component props for the section renderer. */
export type WorkflowSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'baf.workflow'>

/**
 * Render the 工作流 settings page body with placeholder rows.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function WorkflowSection({ t }: WorkflowSectionProps) {
  return (
    <div className={css.section} data-testid="workflow-section">
      <h2 className={css.title}>{t('section.title')}</h2>
      <p className={css.intro}>{t('section.intro')}</p>
      <ul className={css.rows}>
        <li className={css.row} data-placeholder="true">
          <div className={css.rowText}>
            <span className={css.rowTitle}>{t('placeholder.stage.title')}</span>
            <span className={css.rowDesc}>{t('placeholder.stage.description')}</span>
          </div>
          <span className={css.comingSoon}>{t('placeholder.badge')}</span>
        </li>
        <li className={css.row} data-placeholder="true">
          <div className={css.rowText}>
            <span className={css.rowTitle}>{t('placeholder.intake.title')}</span>
            <span className={css.rowDesc}>{t('placeholder.intake.description')}</span>
          </div>
          <span className={css.comingSoon}>{t('placeholder.badge')}</span>
        </li>
      </ul>
    </div>
  )
}
