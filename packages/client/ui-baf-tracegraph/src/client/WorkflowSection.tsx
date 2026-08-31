/**
 * 工作流 settings section: durable toggle for the 轨迹图 conversation tab.
 * The section is the user-visible surface; the actual tab visibility is
 * driven by `BafWorkflowSettings.showTraceGraph`, observed by the trace-graph
 * plugin at registration time.
 *
 * The page mirrors the Versions & updates section design language: title,
 * intro, and a single bordered row carrying the toggle, on the same panel
 * chrome that the rest of the settings surface uses.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowSettings,
} from '../workflow-settings.ts'
import css from './WorkflowSection.module.css'

/** Identity selector for the bound baf-workflow snapshot. */
const identity = <T,>(value: T): T => value

/**
 * Section-injected face: a host observable exposing the namespace snapshot
 * (status + value) and a typed setter for the durable field.
 */
export interface WorkflowSectionInjected {
  hooks: {
    /** Observable reflecting the baf-workflow namespace scope snapshot. */
    settings: HostObservable<BafWorkflowSettings | undefined>
  }
  /** Persist the visibility switch. */
  setShowTraceGraph: (value: boolean) => Promise<void>
}

/** Full component props for the section renderer. */
export type WorkflowSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'baf.workflow'>
  & InjectFace<WorkflowSectionInjected>

/**
 * Render the 工作流 settings page body, in the shared settings-panel design
 * language (title + intro + bordered rows).
 * @param props - composed slot + inject props.
 * @returns the section element tree.
 */
export function WorkflowSection({ useSettings, setShowTraceGraph, t }: WorkflowSectionProps) {
  const value = useSettings(identity<BafWorkflowSettings | undefined>)
  const showTraceGraph = value?.showTraceGraph === true
  return (
    <div className={css.section} data-testid="workflow-section">
      <h2 className={css.title}>{t('section.title')}</h2>
      <p className={css.intro}>{t('section.intro')}</p>
      <ul className={css.rows}>
        <li className={css.row}>
          <div className={css.rowText}>
            <span className={css.rowTitle}>{t('traceGraph.title')}</span>
            <span className={css.rowDesc}>{t('traceGraph.description')}</span>
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
        </li>
      </ul>
    </div>
  )
}
