/**
 * 工作流 tabbed host for feature-owned workflow rows.
 * 【变更】2026-10-12 (工作流设置 7): General / 项目工程 / 工作流确认门 /
 * 企业规范 / 质量监控 tabs; each tab renders selected `settings.workflow.item`
 * contributions via `{ only: id }`.
 * 【变更】2026-10-19 (主页面三改 3): the title/intro moved up to the
 * WorkflowPage shell when the section left Settings for the main stage; this
 * component is now purely the tab strip + tab panels.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkflowSection.module.css'

/** One settings tab and the workflow item slot ids it renders. */
interface WorkflowSettingsTab {
  id: string
  labelKey:
    | 'tabs.general'
    | 'tabs.project'
    | 'tabs.gates'
    | 'tabs.commands'
    | 'tabs.standard'
    | 'tabs.quality'
  slotIds: readonly string[]
}

const WORKFLOW_TABS: readonly WorkflowSettingsTab[] = [
  { id: 'general', labelKey: 'tabs.general', slotIds: ['trace-graph', 'workflow-tab'] },
  { id: 'project', labelKey: 'tabs.project', slotIds: ['baf-standard-project'] },
  { id: 'gates', labelKey: 'tabs.gates', slotIds: ['baf-gates-overview'] },
  // 【变更】2026-10-21 (指令集): the per-state baf-command chart, between
  // 确认门 and 企业规范 (客户指定位置).
  { id: 'commands', labelKey: 'tabs.commands', slotIds: ['baf-standard-commands'] },
  { id: 'standard', labelKey: 'tabs.standard', slotIds: ['baf-standard-enterprise'] },
  { id: 'quality', labelKey: 'tabs.quality', slotIds: ['baf-standard-quality'] },
]

/** Full component props for the tab-host renderer. */
export type WorkflowSectionProps =
  PropsRenderSlots<'settings.workflow.item'>
  & PropsLocale<'baf.workflow'>

/**
 * Render the 工作流 body — tabbed preference surfaces.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function WorkflowSection({ renderSlot, t }: WorkflowSectionProps) {
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeId, setActiveId] = useState<string>(WORKFLOW_TABS[0]?.id ?? 'general')
  const [visitedIds, setVisitedIds] = useState<ReadonlySet<string>>(() => new Set(['general']))

  useEffect(() => {
    setVisitedIds((previous) => {
      if (previous.has(activeId)) return previous
      return new Set([...previous, activeId])
    })
  }, [activeId])

  return (
    <div className={css.section} data-testid="workflow-section">
      <div className={css.tabs} role="tablist" aria-label={t('tabs.aria')}>
        {WORKFLOW_TABS.map((tab, index) => {
          const selected = tab.id === activeId
          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`${tabsId}-tab-${tab.id}`}
              type="button"
              role="tab"
              className={css.tab}
              aria-selected={selected}
              aria-controls={`${tabsId}-panel-${tab.id}`}
              data-active={selected ? 'true' : undefined}
              data-testid={`workflow-tab-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => { setActiveId(tab.id) }}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % WORKFLOW_TABS.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + WORKFLOW_TABS.length) % WORKFLOW_TABS.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = WORKFLOW_TABS.length - 1; break
                  default: return
                }
                event.preventDefault()
                const nextTab = WORKFLOW_TABS[nextIndex] as WorkflowSettingsTab
                const nextButton = tabRefs.current[nextIndex] as HTMLButtonElement
                setActiveId(nextTab.id)
                nextButton.focus()
              }}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {WORKFLOW_TABS
        .filter(tab => tab.id === activeId || visitedIds.has(tab.id))
        .map((tab) => {
          const selected = tab.id === activeId
          return (
            <div
              key={tab.id}
              id={`${tabsId}-panel-${tab.id}`}
              className={css.panel}
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${tab.id}`}
              hidden={!selected}
              data-testid={`workflow-panel-${tab.id}`}
            >
              <div className={css.rows}>
                {tab.slotIds.map(slotId => (
                  <div key={slotId} className={css.rowSlot}>
                    {renderSlot('settings.workflow.item', {}, { only: slotId })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}
