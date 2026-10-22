/**
 * 【变更】2026-10-22 (批次十三 4, 客户决策「配置/资产/规范进流程图」): the 测试流
 * canvas — REPLACES the 配置 / 质量资产 / 规范 cards with ONE flow diagram in
 * the session 测试流图's numbered-node anatomy. Each of the 8 steps carries,
 * AT ITS FLOW POSITION: the 配置 values it reads (mono value chips), the
 * 资产 files it runs against (chips → the text preview modal), the 规范
 * documents that govern it (chips → the shared full-screen viewer), and the
 * 批次十三 switches — 启用 + 失败中止 — persisted through
 * `saveQualityTestFlowToggle` with the server-side dependency cascade
 * (关上游 → 下游自动停用；开下游 → 上游自动补开). A leading 前置 band holds the
 * environment-setup docs (the toolchain card above is the real prerequisite).
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import type { BafStandardKey } from './locales.ts'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from './enterprise-docs-catalog.ts'
import css from './StandardsOverview.module.css'

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join('')

/** The 8 steps, mirroring the session 测试流图's order/labels/commands.
 * 【变更】2026-10-22 (批次十四 4): each step also carries its 环境 probe key
 * (`envTool`, the live tool-state chip's source — undefined = no probed member
 * to quote) and whether it sits on the coverage 主链 or stands independent. */
const STAGES: ReadonlyArray<{
  readonly id: string
  readonly nameKey: BafStandardKey
  readonly enKey: BafStandardKey
  readonly tool: string
  /** The baf-wrapped command the step runs as (product constant, no locale). */
  readonly command: string
  /** 资产 chips (workspace-relative) — click opens the preview modal. */
  readonly assets: readonly string[]
  /** 规范 chips (catalog ids) — click opens the full-screen viewer. */
  readonly docs: readonly string[]
  /** The 环境 probe row this step's tool-state chip quotes. */
  readonly envTool?: string
  /** True = on the coverage 主链 (build→gate); false = independent step. */
  readonly chain: boolean
}> = [
  {
    id: 'build',
    nameKey: 'qflowNodeBuild',
    enKey: 'qflowEnBuild',
    tool: 'gcc',
    command: 'baf-quality test（编译在测试构建内）',
    assets: ['project.yml'],
    docs: ['cfg-project'],
    envTool: 'gcc',
    chain: true,
  },
  {
    id: 'test',
    nameKey: 'qflowNodeTest',
    enKey: 'qflowEnTest',
    tool: 'ceedling',
    command: 'baf-quality test',
    assets: ['project.yml', '.baf/quality/ceedling-config.json', '.baf/quality/ceedling-README.md'],
    docs: ['ut', 'utlist', 'cfg-config', 'uttpl'],
    envTool: 'ceedling',
    chain: true,
  },
  {
    id: 'instrument',
    nameKey: 'qflowNodeInstrument',
    enKey: 'qflowEnInstrument',
    tool: 'gcov',
    command: 'baf-quality check（gcov 插桩）',
    assets: ['project.yml'],
    docs: [],
    envTool: 'gcc',
    chain: true,
  },
  {
    id: 'report',
    nameKey: 'qflowNodeReport',
    enKey: 'qflowEnReport',
    tool: 'gcovr',
    command: 'baf-quality check（gcovr 报告）',
    assets: ['.baf/quality/ceedling-config.json'],
    docs: [],
    envTool: 'gcovr',
    chain: true,
  },
  {
    id: 'gate',
    nameKey: 'qflowNodeGate',
    enKey: 'qflowEnGate',
    tool: 'baf-quality',
    command: 'baf-quality check（覆盖率门禁）',
    assets: ['.baf/quality/ceedling-config.json'],
    docs: [],
    chain: true,
  },
  {
    id: 'lint',
    nameKey: 'qflowNodeLint',
    enKey: 'qflowEnLint',
    tool: 'cpplint',
    command: 'baf-quality lint（cpplint）',
    assets: ['CPPLINT.cfg', '.baf/quality/static-analysis-README.md'],
    docs: ['static', 'cfg-cpplint'],
    envTool: 'cpplint',
    chain: false,
  },
  {
    id: 'analyze',
    nameKey: 'qflowNodeAnalyze',
    enKey: 'qflowEnAnalyze',
    tool: 'cppcheck',
    command: 'baf-quality lint（cppcheck）',
    assets: ['cppcheck-suppressions.xml'],
    docs: ['cfg-cppcheck'],
    envTool: 'cppcheck',
    chain: false,
  },
  {
    id: 'format',
    nameKey: 'qflowNodeFormat',
    enKey: 'qflowEnFormat',
    tool: 'clang-format',
    command: 'clang-format -i <配置路径>',
    assets: ['.clang-format'],
    docs: ['code'],
    envTool: 'clang-format',
    chain: false,
  },
]

/** The 前置 band's environment-setup docs (the toolchain card above them). */
const PREREQ_DOC_IDS: readonly string[] = ['env-ut', 'env-static']

/** One doc's chip label — short tag when the catalog carries one (zh). */
const docCatalog = (
  id: string,
): { label: string; title: string } | undefined => {
  const enterprise = ENTERPRISE_DOC_ROWS.find(row => row.id === id)
  if (enterprise !== undefined) {
    return { label: enterprise.shortZh, title: `${enterprise.titleZh} · ${enterprise.titleEn}` }
  }
  const quality = QUALITY_DOC_ROWS.find(row => row.id === id)
  if (quality !== undefined) return { label: quality.titleZh, title: quality.titleEn }
  return undefined
}

/** One 资产's existence from the loaded list (absent list → unknown/neutral). */
const assetExists = (state: StandardsOverviewState, rel: string): boolean | undefined =>
  state.qualityAssets?.status === 'ready'
    ? state.qualityAssets.assets.find(asset => asset.rel === rel)?.exists
    : undefined

/** 【变更】2026-10-22 (批次十四 4): one stage's tool verdict from the 环境 probe
 * (undefined when the probe is not ready or the stage has no probed member —
 * the chip simply doesn't render, never a fabricated state). */
const envToolState = (
  state: StandardsOverviewState,
  envTool: string | undefined,
): 'ok' | 'missing' | 'unknown' | undefined => {
  if (envTool === undefined || state.qualityEnv?.status !== 'ready') return undefined
  return state.qualityEnv.tools.find(tool => tool.key === envTool)?.state
}

/** The 测试报告 preview modal — same scrim/Escape contract (migrated from the
 * retired 配置 card; HTML renders in a sandboxed iframe, scripts stay off). */
function ReportModal({ report, t, onOpenFile, onClose }: {
  report: StandardsOverviewState['qualityReport']
  t: StandardsPanelProps['t']
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

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

/** The 资产 preview modal — migrated verbatim from the retired 资产 card.
 * 【变更】2026-10-22 (批次十四 3): exported — the 环境 card's new 配置文件
 * column previews the SAME modal (打开 button top-right included). */
export function AssetModal({ rel, asset, t, onOpenFile, onClose }: {
  rel: string
  asset: StandardsOverviewState['qualityAsset']
  t: StandardsPanelProps['t']
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div className={css.docModalScrim} data-testid="baf-quality-asset-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className={css.docModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('qolAssetModalTitle')}
        tabIndex={-1}
        data-testid="baf-quality-asset-modal"
        onClick={(event) => { event.stopPropagation() }}
      >
        <div className={css.docViewerHead}>
          <span className={css.docViewerTitle}>{rel}</span>
          <span className={css.titleActions}>
            {asset?.status === 'ready' ? (
              <button
                type="button"
                className={css.miniButton}
                data-testid="baf-quality-asset-open-file"
                title={asset.path}
                onClick={() => { onOpenFile(asset.path) }}
              >
                {t('qolAssetOpen')}
              </button>
            ) : null}
          </span>
        </div>
        {asset === undefined ? (
          <div className={css.status}>{t('qolAssetLoading')}</div>
        ) : asset.status === 'ready' ? (
          <pre className={css.assetPre} data-testid="baf-quality-asset-content">{asset.content}</pre>
        ) : asset.status === 'missing' ? (
          <div className={css.status} data-testid="baf-quality-asset-missing">{t('qolAssetMissing')}</div>
        ) : asset.status === 'no-workspace' ? (
          <div className={css.status}>{t('qolCfgNoWorkspace')}</div>
        ) : (
          <div className={css.statusError} data-testid="baf-quality-asset-error">
            {t('qolAssetReadFailed')}{asset.reason}
          </div>
        )}
      </div>
    </div>
  )
}

/** One non-clickable mono value chip (a 配置 value at its flow position). */
function ValueChip({ text, title }: { text: string; title?: string | undefined }) {
  return <span className={css.qflowMonoChip} title={title}>{text}</span>
}

/** 【变更】2026-10-22 (批次十四 4): the connector between two flow nodes — a
 * brand-gradient rail segment ending in a chevron, drawn at the idx bubbles'
 * x-position so the eight numbered steps read as ONE vertical flow. */
function FlowLink() {
  return (
    <div className={css.qflowLink} aria-hidden="true">
      {/* 批次十四 4 复核: 15px chevron so the rail's arrowhead reads at one
          glance with the 2px rail (still centred on the bubbles' axis). */}
      <svg viewBox="0 0 12 10" width="15" height="12" focusable="false">
        <path d="M1 3 L6 8 L11 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/**
 * One flow node — the numbered-node anatomy (idx / name+en / tool / command)
 * plus the two switches and the three chip rows.
 * 【变更】2026-10-22 (批次十四 4): the head also carries the live tool-state
 * chip (环境 probe) and the 主链/独立 phase tag — the canvas reads complete at
 * a glance without leaving the page.
 */
function FlowNode({ stage, index, config, enabled, haltOnError, toolState, exists, saving, t,
  onToggle, onPreviewAsset, onOpenDoc, onPreviewReport }: {
  stage: (typeof STAGES)[number]
  index: number
  /** The 配置 readout (undefined while loading / no-workspace). */
  config: StandardsOverviewState['qualityConfig']
  enabled: boolean
  haltOnError: boolean
  /** The 环境 probe's verdict for this stage's tool (undefined = not probed). */
  toolState: 'ok' | 'missing' | 'unknown' | undefined
  /** Look up one 资产 chip's on-disk existence. */
  exists: (rel: string) => boolean | undefined
  saving: boolean
  t: StandardsPanelProps['t']
  onToggle: StandardsOverviewFace['toggleQualityFlowStage']
  onPreviewAsset: (rel: string) => void
  onOpenDoc: (id: string) => void
  onPreviewReport: () => void
}) {
  // The stage's 配置 chips — the real workspace values at their flow position.
  const valueChips: Array<{ text: string; title?: string }> = []
  if (config?.status === 'ready') {
    if (stage.id === 'build') valueChips.push({ text: `${t('qflowBuildDir')} ${config.buildDir}` })
    if (stage.id === 'test') valueChips.push({ text: `${t('qflowTestDir')} ${config.testDir}` })
    // 批次十四 4 — the instrument step quotes the build tree it gcov-walks
    // (it shares the build node's directory; previously it showed no value).
    if (stage.id === 'instrument') valueChips.push({ text: `${t('qflowBuildDir')} ${config.buildDir}` })
    if (stage.id === 'report') valueChips.push({ text: `${t('qflowReportDir')} ${config.reportDir}` })
    if (stage.id === 'gate') {
      valueChips.push({
        text: `${t('qflowThreshold')} ≥ ${String(Math.round(config.thresholdLine * 100))}%`,
        title: config.reportHtmlRel,
      })
      valueChips.push({ text: `${t('qflowGateMode')} ${config.gateMode}` })
    }
  }
  return (
    <div
      className={join(css.qflowNode, enabled ? undefined : css.qflowNodeOff)}
      data-testid={`baf-quality-flow-node-${stage.id}`}
      data-enabled={enabled}
    >
      <div className={css.qflowNodeHead}>
        <span className={css.qflowIdx} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className={css.qflowNodeMain}>
          <span className={css.qflowName}>
            {t(stage.nameKey)}
            <span className={css.qflowEn}>{t(stage.enKey)}</span>
            <span className={join(css.qflowPhase, stage.chain ? undefined : css.qflowPhaseSide)}>
              {t(stage.chain ? 'qflowChainChip' : 'qflowSideChip')}
            </span>
          </span>
          <span className={css.qflowTool}>
            {stage.tool}
            {toolState !== undefined && (
              <span
                className={join(
                  css.qflowToolState,
                  toolState === 'ok' ? css.qflowToolOk : toolState === 'missing' ? css.qflowToolBad : undefined,
                )}
              >
                {toolState === 'ok' ? t('qflowToolReady') : toolState === 'missing' ? t('qflowToolMissing') : t('qflowToolUnknown')}
              </span>
            )}
          </span>
          <span className={css.qflowCmd} title={stage.command}>{stage.command}</span>
        </span>
        {/* 批次十三 4 — the two per-stage switches. The 失败中止 switch only
            matters while the stage participates, so a disabled stage dims it. */}
        <span className={css.qflowSwitches}>
          <span className={css.qflowSwitchRow}>
            <span className={css.qflowSwitchLabel}>{t('qflowSwitchEnabled')}</span>
            <Switch
              checked={enabled}
              label={`${t('qflowSwitchEnabled')} ${t(stage.nameKey)}`}
              disabled={saving}
              onChange={(next) => { void onToggle(stage.id, 'enabled', next) }}
            />
          </span>
          <span className={css.qflowSwitchRow}>
            <span className={join(css.qflowSwitchLabel, enabled ? undefined : css.qflowDim)}>
              {t('qflowSwitchHalt')}
            </span>
            <Switch
              checked={haltOnError}
              label={`${t('qflowSwitchHalt')} ${t(stage.nameKey)}`}
              disabled={saving || !enabled}
              onChange={(next) => { void onToggle(stage.id, 'haltOnError', next) }}
            />
          </span>
        </span>
      </div>
      {!enabled && <div className={css.qflowDisabledNote}>{t('qflowDisabled')}</div>}
      {/* 配置 values at this flow position. */}
      {valueChips.length > 0 && (
        <div className={css.qflowChipsRow}>
          <span className={css.qflowChipsLabel}>{t('qflowChipCfg')}</span>
          <span className={css.qflowChips}>
            {valueChips.map(chip => <ValueChip key={chip.text} text={chip.text} title={chip.title} />)}
          </span>
        </div>
      )}
      {/* The report node's HTML 测试报告 chip — click previews the real file. */}
      {stage.id === 'report' && config?.status === 'ready' && (
        <div className={css.qflowChipsRow}>
          <span className={css.qflowChipsLabel}>{t('qflowChipCfg')}</span>
          <span className={css.qflowChips}>
            <button
              type="button"
              className={css.qflowDocChip}
              data-testid="baf-quality-flow-report"
              title={config.reportHtmlRel}
              disabled={!config.reportHtmlExists}
              onClick={onPreviewReport}
            >
              {config.reportHtmlExists
                ? `${t('qflowReportPreview')} · ${config.reportHtmlRel}`
                : `${config.reportHtmlRel} · ${t('qolCfgReportMissing')}`}
            </button>
          </span>
        </div>
      )}
      {/* 资产 chips — click opens the text preview modal; missing files dim. */}
      {stage.assets.length > 0 && (
        <div className={css.qflowChipsRow}>
          <span className={css.qflowChipsLabel}>{t('qflowChipAsset')}</span>
          <span className={css.qflowChips}>
            {stage.assets.map((rel) => {
              const onDisk = exists(rel)
              return (
                <button
                  key={rel}
                  type="button"
                  className={join(css.qflowDocChip, onDisk === false ? css.qflowChipMissing : undefined)}
                  data-testid={`baf-quality-flow-${stage.id}-asset-${rel.replace(/[^a-z0-9]+/gi, '-')}`}
                  title={rel}
                  onClick={() => { onPreviewAsset(rel) }}
                >
                  {rel}{onDisk === false ? ` · ${t('qolAssetMissing')}` : ''}
                </button>
              )
            })}
          </span>
        </div>
      )}
      {/* 规范 chips — click opens the shared full-screen document viewer. */}
      {stage.docs.length > 0 && (
        <div className={css.qflowChipsRow}>
          <span className={css.qflowChipsLabel}>{t('qflowChipStd')}</span>
          <span className={css.qflowChips}>
            {stage.docs.map((id) => {
              const doc = docCatalog(id)
              if (doc === undefined) return null
              return (
                <button
                  key={id}
                  type="button"
                  className={css.qflowDocChip}
                  data-testid={`baf-quality-flow-doc-${id}`}
                  title={doc.title}
                  onClick={() => { onOpenDoc(id) }}
                >
                  {doc.label}
                </button>
              )
            })}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * The 测试流 canvas — the 8-node flow diagram with switches + chips.
 */
export function QualityFlowCard({
  state, t, toggleQualityFlowStage, openEnterpriseDoc, openQualityReport, closeQualityReport,
  openQualityAsset, closeQualityAsset, onOpenPath,
}: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  toggleQualityFlowStage: StandardsOverviewFace['toggleQualityFlowStage']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
  /** Fetch + open the 测试报告 modal (the report node's chip). */
  openQualityReport: () => void
  closeQualityReport: () => void
  /** Fetch + open one 资产 chip's preview modal. */
  openQualityAsset: (rel: string) => void
  closeQualityAsset: () => void
  /** The modals' 打开文件 gesture (absolute path → default app). */
  onOpenPath: (path: string) => void
}) {
  const flow = state.qualityFlow
  const stages = flow?.stages
  const [reportOpen, setReportOpen] = useState(false)
  const [assetRel, setAssetRel] = useState<string | undefined>(undefined)

  const openReport = (): void => {
    setReportOpen(true)
    openQualityReport()
  }
  const closeReport = (): void => {
    setReportOpen(false)
    closeQualityReport()
  }
  const openAsset = (rel: string): void => {
    setAssetRel(rel)
    openQualityAsset(rel)
  }
  const closeAsset = (): void => {
    setAssetRel(undefined)
    closeQualityAsset()
  }

  return (
    <div className={css.card} data-testid="baf-quality-flow-card">
      <div className={css.cardTitle}>{t('qflowTitle')}</div>
      <div className={css.cardDesc}>{t('qflowIntro')}</div>

      {/* The 前置 band — environment-setup docs; the real toolchain
          prerequisite is the 环境 card above. */}
      <div className={css.qflowPrereq} data-testid="baf-quality-flow-prereq">
        <span className={css.qflowChipsLabel}>{t('qflowPrereqLabel')}</span>
        <span className={css.qflowChips}>
          {PREREQ_DOC_IDS.map((id) => {
            const doc = docCatalog(id)
            if (doc === undefined) return null
            return (
              <button
                key={id}
                type="button"
                className={css.qflowDocChip}
                data-testid={`baf-quality-flow-doc-${id}`}
                title={doc.title}
                onClick={() => { openEnterpriseDoc(id) }}
              >
                {doc.label}
              </button>
            )
          })}
          <span className={css.qflowPrereqHint}>{t('qflowPrereqHint')}</span>
        </span>
      </div>

      {flow === undefined ? (
        <div className={css.status}>{t('qflowLoading')}</div>
      ) : flow.status === 'no-workspace' ? (
        <div className={css.status}>{t('qflowNoWorkspace')}</div>
      ) : stages === undefined ? (
        <div className={css.status}>{t('qflowLoading')}</div>
      ) : (
        <div className={css.qflowList}>
          {STAGES.map((stage, index) => (
            <Fragment key={stage.id}>
              {/* 批次十四 4 — the rail connector ties the numbered bubbles into
                  ONE vertical flow (skipped before the first node). */}
              {index > 0 && <FlowLink />}
              <FlowNode
                stage={stage}
                index={index}
                config={state.qualityConfig}
                enabled={stages[stage.id]?.enabled !== false}
                haltOnError={stages[stage.id]?.haltOnError !== false}
                toolState={envToolState(state, stage.envTool)}
                exists={rel => assetExists(state, rel)}
                saving={state.qualityFlowSaving}
                t={t}
                onToggle={toggleQualityFlowStage}
                onPreviewAsset={openAsset}
                onOpenDoc={openEnterpriseDoc}
                onPreviewReport={openReport}
              />
            </Fragment>
          ))}
        </div>
      )}

      {state.qualityFlowNotice !== undefined ? (
        <div className={css.statusError} data-testid="baf-quality-flow-notice">
          {`${t('qflowSaveFailed')}${state.qualityFlowNotice}`}
        </div>
      ) : null}

      {reportOpen ? (
        <ReportModal
          report={state.qualityReport}
          t={t}
          onOpenFile={onOpenPath}
          onClose={closeReport}
        />
      ) : null}
      {assetRel !== undefined ? (
        <AssetModal
          rel={assetRel}
          asset={state.qualityAsset}
          t={t}
          onOpenFile={onOpenPath}
          onClose={closeAsset}
        />
      ) : null}
    </div>
  )
}
