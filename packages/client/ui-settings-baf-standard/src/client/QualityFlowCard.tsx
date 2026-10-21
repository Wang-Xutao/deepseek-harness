/**
 * 【变更】2026-10-21 (批次十 测试流图): the 质量监控 tab's 测试流图 card — the
 * unit-test execution flow on the SAME canvas anatomy the 指令集/企业规范
 * charts use (route-parity node cards, 192×48, SVG bezier edges), in the
 * normative execution order (check 链 → lint → 最终 format). Clicking a step
 * node lists it in the right-hand detail column: the mono command, 做什么,
 * 规范要点, clickable 依据规范 chips (the shared full-screen doc viewer), and
 * the on-disk 产物. The band below carries the cross-step discipline. Pure
 * display — nothing here executes.
 */
import { useState } from 'react'
import type { StandardsOverviewFace } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from './enterprise-docs-catalog.ts'
import { QUALITY_FLOW_STEPS, type QualityFlowStepId } from './quality-flow-catalog.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

/** Canvas geometry — the SAME box the 指令集/企业规范 canvas draws. */
const NODE_W = 192
const NODE_H = 48
const NODE_GAP = 16
const NODE_X = 16
const CANVAS_TOP = 16
const CANVAS_W = NODE_X + NODE_W + NODE_X
const CANVAS_H = QUALITY_FLOW_STEPS.length * NODE_H + (QUALITY_FLOW_STEPS.length - 1) * NODE_GAP + CANVAS_TOP * 2

/** English name riding inline after the zh label (one name line). */
const NODE_EN: Record<QualityFlowStepId, BafStandardKey> = {
  build: 'qolFlowNodeEnBuild',
  test: 'qolFlowNodeEnTest',
  instrument: 'qolFlowNodeEnInstrument',
  report: 'qolFlowNodeEnReport',
  gate: 'qolFlowNodeEnGate',
  lint: 'qolFlowNodeEnLint',
  analyze: 'qolFlowNodeEnAnalyze',
  format: 'qolFlowNodeEnFormat',
}

/** zh label key per step. */
const NODE_LABEL: Record<QualityFlowStepId, BafStandardKey> = {
  build: 'qolFlowNodeBuild',
  test: 'qolFlowNodeTest',
  instrument: 'qolFlowNodeInstrument',
  report: 'qolFlowNodeReport',
  gate: 'qolFlowNodeGate',
  lint: 'qolFlowNodeLint',
  analyze: 'qolFlowNodeAnalyze',
  format: 'qolFlowNodeFormat',
}

/** 做什么 key per step. */
const NODE_PURPOSE: Record<QualityFlowStepId, BafStandardKey> = {
  build: 'qolFlowPurposeBuild',
  test: 'qolFlowPurposeTest',
  instrument: 'qolFlowPurposeInstrument',
  report: 'qolFlowPurposeReport',
  gate: 'qolFlowPurposeGate',
  lint: 'qolFlowPurposeLint',
  analyze: 'qolFlowPurposeAnalyze',
  format: 'qolFlowPurposeFormat',
}

/** 规范要点 key per step. */
const NODE_RULE: Record<QualityFlowStepId, BafStandardKey> = {
  build: 'qolFlowRuleBuild',
  test: 'qolFlowRuleTest',
  instrument: 'qolFlowRuleInstrument',
  report: 'qolFlowRuleReport',
  gate: 'qolFlowRuleGate',
  lint: 'qolFlowRuleLint',
  analyze: 'qolFlowRuleAnalyze',
  format: 'qolFlowRuleFormat',
}

/** Doc id → chip caption (short tag first; the quality rows have none). */
const DOC_CAPTION: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {}
  for (const row of ENTERPRISE_DOC_ROWS) map[row.id] = row.shortZh || row.titleZh
  for (const row of QUALITY_DOC_ROWS) map[row.id] = row.titleZh
  return map
})()

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** One 产物 mono row. */
function ArtifactRow({ path }: { path: string }) {
  return <div className={css.qflowArtifact} title={path}>{path}</div>
}

/** The 测试流图 card — canvas + per-step detail + discipline band. */
export function QualityFlowCard({ t, openEnterpriseDoc }: {
  t: StandardsPanelProps['t']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
}) {
  // null = nothing picked yet: the selection starts at the first step (gcc
  // 编译) until the user clicks.
  const [picked, setPicked] = useState<QualityFlowStepId | null>(null)
  const selected = picked ?? QUALITY_FLOW_STEPS[0]?.id ?? 'build'
  const step = QUALITY_FLOW_STEPS.find(row => row.id === selected)
    ?? QUALITY_FLOW_STEPS[0]

  return (
    <div className={css.cardFlow} data-testid="baf-quality-flow-card">
      <div className={css.cardTitle}>{t('qolFlowTitle')}</div>
      <div className={css.hooksFlowWrap}>
        <div className={css.hooksLegend}>
          <span className={css.hooksLegendItem}>
            <span className={css.hooksLegendDot} aria-hidden />{t('qolFlowLegendRequired')}
          </span>
          <span className={css.hooksLegendItem}>
            <span className={join(css.hooksLegendDot, css.hooksLegendDotIdle)} aria-hidden />{t('qolFlowLegendOptional')}
          </span>
        </div>
        <div className={css.hooksSplit}>
          <div
            className={css.hooksFlowCanvas}
            role="group"
            aria-label={t('qolFlowAria')}
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            <svg className={css.hooksEdges} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
              <defs>
                <marker
                  id="baf-quality-flow-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className={css.hooksArrow} />
                </marker>
              </defs>
              {QUALITY_FLOW_STEPS.slice(0, -1).map((row, index) => {
                // The same-column vertical bezier, bottom-center → top-center.
                const x = NODE_X + NODE_W / 2
                const y1 = CANVAS_TOP + index * (NODE_H + NODE_GAP) + NODE_H
                const y2 = CANVAS_TOP + (index + 1) * (NODE_H + NODE_GAP)
                const mid = (y1 + y2) / 2
                return (
                  <path
                    key={row.id}
                    d={`M ${x} ${y1} C ${x} ${mid}, ${x} ${mid}, ${x} ${y2}`}
                    markerEnd="url(#baf-quality-flow-arrow)"
                    className={css.hooksEdge}
                  />
                )
              })}
            </svg>
            {QUALITY_FLOW_STEPS.map((row, index) => {
              const label = t(NODE_LABEL[row.id])
              const accent = `${row.tool} · ${t(row.required ? 'qolEnvRequired' : 'qolEnvOptional')}`
              return (
                <button
                  key={row.id}
                  type="button"
                  className={join(
                    css.hooksNode,
                    css.hooksNodeMain,
                    row.id === selected ? css.hooksNodeSelected : undefined,
                  )}
                  data-testid={`baf-quality-flow-node-${row.id}`}
                  aria-pressed={row.id === selected}
                  aria-label={`${label} · ${accent}`}
                  style={{
                    left: NODE_X,
                    top: CANVAS_TOP + index * (NODE_H + NODE_GAP),
                    width: NODE_W,
                    height: NODE_H,
                  }}
                  onClick={() => { setPicked(row.id) }}
                >
                  <span className={css.hooksNodeName}>
                    {label}
                    <span className={css.hooksNodeEn}>{t(NODE_EN[row.id])}</span>
                  </span>
                  <span
                    className={join(css.hooksNodeAccent, row.required ? undefined : css.hooksNodeAccentIdle)}
                  >
                    {accent}
                  </span>
                </button>
              )
            })}
          </div>
          <div className={css.hooksEditor} data-testid="baf-quality-flow-detail" data-node={selected}>
            <div className={css.hooksEditorBody}>
              <div className={css.hooksNodeHead}>
                <span className={css.hooksNodeLabel}>{t(NODE_LABEL[selected])}</span>
                <span className={css.hooksNodeEn}>{t(NODE_EN[selected])}</span>
                <span className={css.hooksNodeId}>{selected}</span>
              </div>
              <div className={css.qflowRows}>
                <div className={css.qflowRow}>
                  <span className={css.qflowKey}>{t('qolFlowCmdLabel')}</span>
                  <span className={css.qflowMono}>{step?.command}</span>
                </div>
                <div className={css.qflowRow}>
                  <span className={css.qflowKey}>{t('qolFlowPurposeLabel')}</span>
                  <span>{step === undefined ? '' : t(NODE_PURPOSE[step.id])}</span>
                </div>
                <div className={css.qflowRow}>
                  <span className={css.qflowKey}>{t('qolFlowRuleLabel')}</span>
                  <span>{step === undefined ? '' : t(NODE_RULE[step.id])}</span>
                </div>
                <div className={css.qflowRow}>
                  <span className={css.qflowKey}>{t('qolFlowDocsLabel')}</span>
                  <span className={css.qflowChips}>
                    {(step?.docIds ?? []).map(id => (
                      <button
                        key={id}
                        type="button"
                        className={css.qflowDocChip}
                        data-testid={`baf-quality-flow-doc-${id}`}
                        title={DOC_CAPTION[id] ?? id}
                        onClick={() => { void openEnterpriseDoc(id) }}
                      >
                        {DOC_CAPTION[id] ?? id}
                      </button>
                    ))}
                  </span>
                </div>
                {(step?.artifacts ?? []).length > 0 && (
                  <div className={css.qflowRow}>
                    <span className={css.qflowKey}>{t('qolFlowArtifactsLabel')}</span>
                    <span>
                      {(step?.artifacts ?? []).map(path => <ArtifactRow key={path} path={path} />)}
                    </span>
                  </div>
                )}
              </div>
              <div className={css.docHint}>{t('qolFlowPick')}</div>
            </div>
          </div>
        </div>
        {/* The discipline band — the cross-step rules the order encodes. */}
        <div className={css.cmdGlobalBand} data-testid="baf-quality-flow-band">
          <div className={css.qualityGroupLabel}>{t('qolFlowBandTitle')}</div>
          <div className={css.qflowBandText}>{t('qolFlowBand')}</div>
        </div>
      </div>
    </div>
  )
}
