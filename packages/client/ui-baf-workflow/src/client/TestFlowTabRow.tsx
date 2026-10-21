/**
 * 【变更】2026-10-21 (批次十 测试流图): the 工作流通用 settings row for the
 * 测试流图 tab — the exact WorkflowTabRow pattern (shared Switch primitive,
 * same row css), one key later in the same snapshot. Read `!== false` so a
 * snapshot persisted before the key existed keeps the tab visible.
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafWorkflowTabSettings } from '../workflow-tab-settings.ts'
import css from './WorkflowTabRow.module.css'

const identity = <T,>(value: T): T => value

/** Injected face for the 测试流图 settings row. */
export interface TestFlowTabRowInjected {
  hooks: {
    /** Observable reflecting the persisted preference snapshot. */
    settings: HostObservable<BafWorkflowTabSettings | undefined>
  }
  /** Persist the 测试流图 tab-visibility switch. */
  setShowTestFlowTab: (value: boolean) => Promise<void>
}

/** Full component props for the 测试流图 settings row. */
export type TestFlowTabRowProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<TestFlowTabRowInjected>

/**
 * Render the 测试流图 Tab toggle inside the 工作流 settings section.
 * @param props - composed slot + inject props.
 * @returns the preference row.
 */
export function TestFlowTabRow({ useSettings, setShowTestFlowTab, t }: TestFlowTabRowProps) {
  const value = useSettings(identity<BafWorkflowTabSettings | undefined>)
  const showTestFlowTab = value?.showTestFlowTab !== false
  return (
    <div className={css.row} data-testid="test-flow-tab-row">
      <div>
        <div className={css.title}>{t('settings.testFlowTab.title')}</div>
        <div className={css.description}>{t('settings.testFlowTab.description')}</div>
      </div>
      <Switch
        checked={showTestFlowTab}
        label={t('settings.testFlowTab.title')}
        onChange={(next) => { void setShowTestFlowTab(next) }}
      />
    </div>
  )
}
