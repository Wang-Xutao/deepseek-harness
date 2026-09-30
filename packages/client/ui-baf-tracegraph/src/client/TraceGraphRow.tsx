/**
 * General-settings row: durable toggle for the 轨迹图 conversation tab.
 * Visibility is driven by `BafWorkflowSettings.showTraceGraph`.
 *
 * 【变更】2026-09-30 (demo31 问题 3): the toggle is the shared `Switch`
 * primitive — the exact control the 开发者工具 row uses in General settings —
 * so the two checkbox styles on one settings page cannot drift apart again
 * (the bespoke capsule + 开/关 text label is gone).
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafWorkflowSettings } from '../workflow-settings.ts'
import css from './TraceGraphRow.module.css'

const identity = <T,>(value: T): T => value

/** Injected face for the General-settings row. */
export interface TraceGraphRowInjected {
  hooks: {
    /** Observable reflecting the baf-workflow namespace scope snapshot. */
    settings: HostObservable<BafWorkflowSettings | undefined>
  }
  /** Persist the visibility switch. */
  setShowTraceGraph: (value: boolean) => Promise<void>
}

/** Full component props for the General-settings row. */
export type TraceGraphRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'baf.workflow'>
  & InjectFace<TraceGraphRowInjected>

/**
 * Render the 轨迹图 toggle inside General settings.
 * @param props - composed slot + inject props.
 * @returns the preference row.
 */
export function TraceGraphRow({ useSettings, setShowTraceGraph, t }: TraceGraphRowProps) {
  const value = useSettings(identity<BafWorkflowSettings | undefined>)
  const showTraceGraph = value?.showTraceGraph === true
  return (
    <div className={css.row} data-testid="trace-graph-row">
      <div>
        <div className={css.title}>{t('traceGraph.title')}</div>
        <div className={css.description}>{t('traceGraph.description')}</div>
      </div>
      <Switch
        checked={showTraceGraph}
        label={t('traceGraph.title')}
        onChange={(next) => { void setShowTraceGraph(next) }}
      />
    </div>
  )
}
