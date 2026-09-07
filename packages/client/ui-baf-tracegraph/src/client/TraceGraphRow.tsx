/**
 * General-settings row: durable toggle for the 轨迹图 conversation tab.
 * Visibility is driven by `BafWorkflowSettings.showTraceGraph`.
 */
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
      <div className={css.rowText}>
        <div className={css.title}>{t('traceGraph.title')}</div>
        <div className={css.desc}>{t('traceGraph.description')}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showTraceGraph}
        data-state={showTraceGraph ? 'on' : 'off'}
        className={css.toggle}
        onClick={() => { void setShowTraceGraph(!showTraceGraph) }}
      >
        <span className={css.toggleTrack} aria-hidden="true">
          <span className={css.toggleThumb} />
        </span>
        <span className={css.toggleLabel}>
          {showTraceGraph ? t('traceGraph.on') : t('traceGraph.off')}
        </span>
      </button>
    </div>
  )
}
