/**
 * 工作流-settings row: the 是否显示工作流 Tab toggle (demo23 问题 5).
 * Visibility is driven by {@link BafWorkflowTabSettings.showWorkflowTab}.
 *
 * 【变更】2026-09-30 (demo31 问题 3): the toggle is the shared `Switch`
 * primitive — the exact control the 开发者工具 row uses in General settings —
 * so every settings checkbox (轨迹图 here, 工作流 Tab here, 开发者工具) renders
 * identically; the bespoke capsule + 开/关 text label is gone.
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafWorkflowTabSettings } from '../workflow-tab-settings.ts'
import css from './WorkflowTabRow.module.css'

const identity = <T,>(value: T): T => value

/** Injected face for the 工作流 settings row. */
export interface WorkflowTabRowInjected {
  hooks: {
    /** Observable reflecting the persisted preference snapshot. */
    settings: HostObservable<BafWorkflowTabSettings | undefined>
  }
  /** Persist the tab-visibility switch. */
  setShowWorkflowTab: (value: boolean) => Promise<void>
}

/** Full component props for the 工作流 settings row. */
export type WorkflowTabRowProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<WorkflowTabRowInjected>

/**
 * Render the 工作流 Tab toggle inside the 工作流 settings section.
 * @param props - composed slot + inject props.
 * @returns the preference row.
 */
export function WorkflowTabRow({ useSettings, setShowWorkflowTab, t }: WorkflowTabRowProps) {
  const value = useSettings(identity<BafWorkflowTabSettings | undefined>)
  const showWorkflowTab = value?.showWorkflowTab === true
  return (
    <div className={css.row} data-testid="workflow-tab-row">
      <div>
        <div className={css.title}>{t('settings.workflowTab.title')}</div>
        <div className={css.description}>{t('settings.workflowTab.description')}</div>
      </div>
      <Switch
        checked={showWorkflowTab}
        label={t('settings.workflowTab.title')}
        onChange={(next) => { void setShowWorkflowTab(next) }}
      />
    </div>
  )
}
