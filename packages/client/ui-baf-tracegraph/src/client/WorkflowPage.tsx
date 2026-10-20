/**
 * 工作流 main panel page: first-level shell hosting the tabbed workflow rows.
 * 【变更】2026-10-19 (主页面三改 3): the 工作流 section left the Settings modal
 * for the main stage, as a sibling first-level page under 插件 / 自动化任务 —
 * same 960px content frame and 20px title step those pages use. The tabbed
 * body (WorkflowSection) and every `settings.workflow.item` row registrant
 * are unchanged; only the declaring parent moved.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { WorkflowSection } from './WorkflowSection.tsx'
import css from './WorkflowPage.module.css'

/** Full component props for the main-panel page renderer. */
export type WorkflowPageProps =
  PropsRuntime<'main'>
  & PropsRenderSlots<'settings.workflow.item'>
  & PropsLocale<'baf.workflow'>

/**
 * Render the 工作流 page — heading plus the tabbed preference surfaces.
 * @param props - composed slot props.
 * @returns the page element tree.
 */
export function WorkflowPage({ renderSlot, t }: WorkflowPageProps) {
  return (
    <div className={css.page} data-testid="workflow-page">
      <div className={css.pageScroll}>
        <div className={css.pageContent}>
          <div className={css.pageHeading}>
            <h1>{t('section.title')}</h1>
          </div>
          <p className={css.intro}>{t('section.intro')}</p>
          <WorkflowSection renderSlot={renderSlot} t={t} />
        </div>
      </div>
    </div>
  )
}
