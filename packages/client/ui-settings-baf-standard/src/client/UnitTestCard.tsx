/**
 * 【变更】2026-10-21 (批次八 3.4): the 质量监控 tab's unit-test surface — the
 * 查漏补缺 card. Every value is REAL, read off the shipped baf-quality assets
 * (config.json / project.yml / the Ceedling SKILL — the sources are named per
 * row below); nothing is placeholder. Three sections: 工具栏和环境 (toolchain,
 * frameworks, the baf-quality commands), 路径与覆盖率 (test/source/build dirs,
 * the three report artifacts with workspace-aware 打开, the ≥80% line-coverage
 * threshold, the exclusions), and 相关文档 (the cataloged UT documents, opened
 * in the shared full-screen modal).
 */
import { useEffect, useState } from 'react'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { joinEntry } from './StandardsOverview.tsx'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from './enterprise-docs-catalog.ts'
import css from './StandardsOverview.module.css'

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** The report artifacts config.json names (workspace-relative, mono). */
const REPORT_HTML = 'build/coverage/coverage_report.html'
const REPORT_XML = 'build/coverage/coverage_report.xml'
const REPORT_JSON = '.baf/reports/ut-coverage.json'
const REPORT_RELS: readonly string[] = [REPORT_HTML, REPORT_XML, REPORT_JSON]

/** The cataloged UT documents in presentation order (ids across both catalogs). */
const UT_DOC_IDS: readonly string[] = ['ut', 'utlist', 'uttpl', 'env-ut', 'cfg-project', 'cfg-config']

/** One label-left / mono-value-right info row. */
function UtInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.utRow}>
      <span className={css.utRowLabel}>{label}</span>
      <span className={css.utRowValue}>{value}</span>
    </div>
  )
}

/** One report row — the mono path plus 打开, awake only when the file exists. */
function UtReportRow({ label, rel, exists, onOpen, t }: {
  label: string
  rel: string
  /** undefined = still checking; the button waits. */
  exists: boolean | undefined
  onOpen: (rel: string) => void
  t: StandardsPanelProps['t']
}) {
  return (
    <div className={css.utRow} data-testid={`baf-ut-report-${rel.replace(/[/.]/g, '-')}`}>
      <span className={css.utRowLabel}>{label}</span>
      <span className={css.utRowActions}>
        <span className={css.utRowValue}>{rel}</span>
        {exists === false ? <span className={css.utPending}>{t('utReportMissing')}</span> : null}
        <button
          type="button"
          className={css.miniButton}
          disabled={exists !== true}
          title={rel}
          onClick={() => { onOpen(rel) }}
        >
          {t('utReportOpen')}
        </button>
      </span>
    </div>
  )
}

/** The unit-test card — real toolchain values + report opens + UT documents. */
export function UnitTestCard({ state, summary, t, openEnterpriseDoc, openPath, statWorkspacePath }: {
  state: StandardsOverviewState
  summary: StandardsOverviewState['summary']
  t: StandardsPanelProps['t']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
  openPath: StandardsOverviewFace['openPath']
  statWorkspacePath: StandardsOverviewFace['statWorkspacePath']
}) {
  const openId = state.enterpriseDocId

  // Which report artifacts exist in the CURRENT workspace (no workspace → the
  // rows show the paths but no awake 打开 — nothing to open yet).
  const [reportExists, setReportExists] = useState<Record<string, boolean | undefined>>({})
  const cwd = summary?.cwd
  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    for (const rel of REPORT_RELS) {
      void statWorkspacePath(rel).then((exists) => {
        if (!cancelled) setReportExists(prev => ({ ...prev, [rel]: exists }))
      })
    }
    return () => { cancelled = true }
  }, [cwd, statWorkspacePath])

  // The cataloged doc rows resolve their display fields from the mirrors so
  // titles can never drift from the catalogs.
  const docRows = UT_DOC_IDS
    .map(id => ({
      id,
      enterprise: ENTERPRISE_DOC_ROWS.find(row => row.id === id),
      quality: QUALITY_DOC_ROWS.find(row => row.id === id),
    }))
    .filter(row => row.enterprise !== undefined || row.quality !== undefined)
    .map(row => ({
      id: row.id,
      titleZh: row.enterprise?.titleZh ?? row.quality?.titleZh ?? row.id,
      titleEn: row.enterprise?.titleEn ?? row.quality?.titleEn ?? row.id,
    }))

  const openReport = (rel: string): void => {
    if (cwd !== undefined) void openPath(joinEntry(cwd, rel))
  }

  return (
    <div className={join(css.card, css.utCard)} data-testid="baf-ut-card">
      <div className={css.cardTitle}>{t('utTitle')}</div>

      <div className={css.utSection} data-testid="baf-ut-section-env">
        <div className={css.utSectionLabel}>{t('utGroupEnv')}</div>
        {/* Values read from quality/ceedling/project.yml (:which_ceedling gem /
            :ceedling_version 1.0.1, :plugins gcov + report_tests_pretty_stdout)
            and the toolchain README (gcc · ruby · ceedling · gcovr). */}
        <UtInfoRow label={t('utToolchain')} value="gcc · ruby · ceedling 1.0.1 (gem) · gcovr" />
        <UtInfoRow label={t('utFramework')} value="Unity · CMock · gcov" />
        {/* Commands from the Ceedling SKILL §2 / §9 (the slash forms map onto
            these CLI verbs). */}
        <UtInfoRow label={t('utCmdDaily')} value="baf-quality test <suite>" />
        <UtInfoRow label={t('utCmdCheck')} value="baf-quality check" />
        <UtInfoRow label={t('utCmdDelta')} value="baf-quality check --delta" />
        <UtInfoRow label={t('utCmdClean')} value="baf-quality check --clean" />
        <UtInfoRow label={t('utCmdOpen')} value="baf-quality check --open" />
      </div>

      <div className={css.utSection} data-testid="baf-ut-section-paths">
        <div className={css.utSectionLabel}>{t('utGroupPaths')}</div>
        {/* Layout convention from the UT SKILL §4 (test mirrors source, test_
            prefix); thresholds/excludes from quality/ceedling/config.json
            (threshold_line 0.8, gate_mode shadow, exclude list). */}
        <UtInfoRow label={t('utTestDir')} value="test/<rel>/test_<module>.c（与 source 镜像）" />
        <UtInfoRow label={t('utSourceDir')} value="source/<rel>/<module>.c|.h" />
        <UtInfoRow label={t('utBuildDir')} value="build/（gcov 对象 build/gcov）" />
        <UtInfoRow label={t('utThreshold')} value="行覆盖 ≥ 80%（threshold_line 0.8 · shadow）" />
        <UtInfoRow label={t('utExclude')} value="test/** · third_party/** · build/**" />
        {/* The three artifacts config.json names — 打开 wakes only when the
            file exists in the current workspace (a run of baf-quality check
            generates them). */}
        <UtReportRow label={t('utReportHtml')} rel={REPORT_HTML} exists={reportExists[REPORT_HTML]} onOpen={openReport} t={t} />
        <UtReportRow label={t('utReportXml')} rel={REPORT_XML} exists={reportExists[REPORT_XML]} onOpen={openReport} t={t} />
        <UtReportRow label={t('utReportJson')} rel={REPORT_JSON} exists={reportExists[REPORT_JSON]} onOpen={openReport} t={t} />
      </div>

      <div className={css.utSection} data-testid="baf-ut-section-docs">
        <div className={css.utSectionLabel}>{t('utGroupDocs')}</div>
        <div className={css.docList}>
          {docRows.map(row => (
            <button
              key={row.id}
              type="button"
              className={join(css.docRow, openId === row.id ? css.docRowSelected : undefined)}
              data-testid={`baf-ut-doc-${row.id}`}
              aria-pressed={openId === row.id}
              onClick={() => { void openEnterpriseDoc(row.id) }}
            >
              <span className={css.docRowMain}>
                <span className={css.docRowTitle}>{row.titleZh}</span>
                <span className={css.docRowEn}>{row.titleEn}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={css.docHint}>{t('utPick')}</div>
      </div>
    </div>
  )
}
