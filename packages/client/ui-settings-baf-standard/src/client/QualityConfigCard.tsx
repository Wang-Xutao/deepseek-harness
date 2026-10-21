/**
 * 【变更】2026-10-21 (质量监控重构 1.4): the 质量监控 tab's 配置 card — the
 * workspace's unit-test config values (test/report/build directories, the
 * line-coverage threshold, gate mode), each quoting what the workspace will
 * actually run (workspace file → shipped-default fallback, source noted at the
 * card foot). The 测试报告 row previews the configured HTML report in a
 * full-screen modal (HTML only, customer decision) — rendered in a sandboxed
 * iframe so the report's markup can never script the app.
 */
import { useEffect, useRef, useState } from 'react'
import type { StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import css from './StandardsOverview.module.css'

/** One label-left / mono-value-right config row (the utRow anatomy). */
function CfgRow({ label, value, children, testid }: {
  label: string
  value: string
  /** Optional right-side action (the 测试报告 row's 预览 button). */
  children?: React.ReactNode
  testid: string
}) {
  return (
    <div className={css.utRow} data-testid={testid}>
      <span className={css.utRowLabel}>{label}</span>
      <span className={css.utRowActions}>
        <span className={css.utRowValue}>{value}</span>
        {children}
      </span>
    </div>
  )
}

/** The report preview modal — same scrim/Escape contract as the doc viewer. */
function ReportModal({ report, t, onOpenFile, onClose }: {
  report: StandardsOverviewState['qualityReport']
  t: StandardsPanelProps['t']
  /** Fire-and-forget open of the report file with its default app. */
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Escape is the keyboard route out (the scrim click is the visual one).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const path = report !== undefined && (report.status === 'ready' || report.status === 'missing')
    ? report.path
    : undefined

  return (
    <div className={css.docModalScrim} data-testid="baf-quality-report-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className={css.docModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('qolReportTitle')}
        tabIndex={-1}
        data-testid="baf-quality-report-modal"
        onClick={(event) => { event.stopPropagation() }}
      >
        <div className={css.docViewerHead}>
          <span className={css.docViewerTitle}>{path ?? t('qolReportTitle')}</span>
          <span className={css.titleActions}>
            {report?.status === 'ready' ? (
              <button
                type="button"
                className={css.miniButton}
                data-testid="baf-quality-report-open-file"
                title={report.path}
                onClick={() => { onOpenFile(report.path) }}
              >
                {t('enterpriseDocOpenFile')}
              </button>
            ) : null}
          </span>
        </div>
        {report === undefined ? (
          <div className={css.status}>{t('qolReportLoading')}</div>
        ) : report.status === 'ready' ? (
          // sandbox="" → styles render, scripts/origin access stay off: the
          // coverage report is static markup, and it must never script the app.
          <iframe
            className={css.reportFrame}
            data-testid="baf-quality-report-frame"
            title={t('qolReportTitle')}
            srcDoc={report.content}
            sandbox=""
          />
        ) : report.status === 'missing' ? (
          <div className={css.status} data-testid="baf-quality-report-missing">{t('qolReportMissing')}</div>
        ) : report.status === 'no-workspace' ? (
          <div className={css.status}>{t('qolCfgNoWorkspace')}</div>
        ) : (
          <div className={css.statusError} data-testid="baf-quality-report-error">
            {t('qolReportUnreadable')}{report.reason}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The 配置 card — five read-only value rows + the 测试报告 preview modal.
 */
export function QualityConfigCard({ state, t, onPreview, onClosePreview, onOpenPath }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  /** Fetch + open the 测试报告 modal. */
  onPreview: () => void
  /** Close the modal (drops any in-flight fetch). */
  onClosePreview: () => void
  /** The modal's 打开文件 gesture. */
  onOpenPath: (path: string) => void
}) {
  const config = state.qualityConfig
  const [modalOpen, setModalOpen] = useState(false)

  const openPreview = (): void => {
    setModalOpen(true)
    onPreview()
  }
  const closePreview = (): void => {
    setModalOpen(false)
    onClosePreview()
  }

  return (
    <div className={css.card} data-testid="baf-quality-config-card">
      <div className={css.cardTitle}>{t('qolCfgTitle')}</div>

      {config === undefined ? (
        <div className={css.status}>{t('qolCfgLoading')}</div>
      ) : config.status === 'no-workspace' ? (
        <div className={css.status}>{t('qolCfgNoWorkspace')}</div>
      ) : (
        <>
          <CfgRow testid="baf-quality-config-test-dir" label={t('qolCfgTestDir')} value={config.testDir} />
          <CfgRow testid="baf-quality-config-report-dir" label={t('qolCfgReportDir')} value={config.reportDir} />
          <CfgRow testid="baf-quality-config-build-dir" label={t('qolCfgBuildDir')} value={config.buildDir} />
          <CfgRow
            testid="baf-quality-config-threshold"
            label={t('qolCfgThreshold')}
            value={`≥ ${String(Math.round(config.thresholdLine * 100))}%（${config.gateMode} ${t('qolCfgGateMode')}）`}
          />
          <CfgRow
            testid="baf-quality-config-report"
            label={t('qolCfgReport')}
            value={config.reportHtmlRel}
          >
            {config.reportHtmlExists ? (
              <button
                type="button"
                className={css.miniButton}
                data-testid="baf-quality-config-report-preview"
                title={config.reportHtmlRel}
                onClick={openPreview}
              >
                {t('qolCfgPreview')}
              </button>
            ) : (
              <span className={css.utPending}>{t('qolCfgReportMissing')}</span>
            )}
          </CfgRow>
          <div className={css.cfgSource} data-testid="baf-quality-config-source">
            {config.source === 'workspace' ? t('qolCfgSourceWorkspace') : t('qolCfgSourceBuiltin')}
          </div>
        </>
      )}

      {modalOpen ? (
        <ReportModal
          report={state.qualityReport}
          t={t}
          onOpenFile={onOpenPath}
          onClose={closePreview}
        />
      ) : null}
    </div>
  )
}
