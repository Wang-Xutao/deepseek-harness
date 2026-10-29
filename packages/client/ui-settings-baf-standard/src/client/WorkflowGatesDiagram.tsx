/**
 * Settings B — eight-node workflow diagram with confirm/stage gates as cards.
 */
import { useState } from 'react'
import type { BafConfirmGateDigest, BafStageGateDigest } from '../types.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

/** Main go-path nodes (aligned with baf-core catalog). */
export const FLOW_NODES = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive',
] as const

export type FlowNodeId = (typeof FLOW_NODES)[number]
export type GatesViewMode = 'compact' | 'detailed'

const NODE_TITLE: Record<FlowNodeId, BafStandardKey> = {
  intake: 'node.intake',
  open: 'node.open',
  clarify: 'node.clarify',
  design: 'node.design',
  plan: 'node.plan',
  implement: 'node.implement',
  verify: 'node.verify',
  archive: 'node.archive',
}

export interface WorkflowGatesDiagramProps {
  confirmGates: readonly BafConfirmGateDigest[]
  stageGates: readonly BafStageGateDigest[]
  loading: boolean
  t: (key: BafStandardKey) => string
}

/**
 * Vertical flowchart: each node card embeds its stage-complete and confirm gates.
 * Compact mode shows titles only; detailed mode shows questions and options.
 * @param props - gate digests + locale.
 * @returns the diagram.
 */
export function WorkflowGatesDiagram({
  confirmGates, stageGates, loading, t,
}: WorkflowGatesDiagramProps) {
  const [mode, setMode] = useState<GatesViewMode>('compact')
  const detailed = mode === 'detailed'

  if (loading) {
    return <div className={css.status} data-testid="baf-flow-diagram-loading">{t('gatesLoading')}</div>
  }

  return (
    <div className={css.flowDiagramWrap}>
      <div className={css.flowToolbar}>
        <label className={css.flowModeLabel} htmlFor="baf-gates-view-mode">
          {t('gatesViewMode')}
        </label>
        <select
          id="baf-gates-view-mode"
          className={css.flowModeSelect}
          data-testid="baf-gates-view-mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value === 'detailed' ? 'detailed' : 'compact')
          }}
        >
          <option value="compact">{t('gatesViewCompact')}</option>
          <option value="detailed">{t('gatesViewDetailed')}</option>
        </select>
      </div>

      <div
        className={detailed ? css.flowDiagram : css.flowDiagramCompact}
        data-testid="baf-flow-diagram"
        data-mode={mode}
      >
        {FLOW_NODES.map((node, index) => {
          const stage = stageGates.find(row => row.node === node)
          const confirms = confirmGates.filter(gate => gate.node === node)
          const orphanHint = index === 0
            ? confirmGates.filter(gate => gate.node === undefined || gate.node === '')
            : []
          const confirmCount = confirms.length + orphanHint.length
          return (
            <div key={node}>
              {index > 0 ? <div className={css.flowConnector} aria-hidden="true">↓</div> : null}
              <div className={css.flowNode} data-testid={`baf-flow-node-${node}`}>
                <div className={css.flowNodeHead}>
                  <span className={css.flowNodeIndex}>{index + 1}</span>
                  <span className={css.flowNodeTitle}>{t(NODE_TITLE[node])}</span>
                  <span className={css.flowNodeId}>{node}</span>
                  {!detailed && confirmCount > 0 ? (
                    <span className={css.flowNodeMeta}>
                      {t('gatesConfirmCount').replace('{n}', String(confirmCount))}
                    </span>
                  ) : null}
                </div>

                {stage !== undefined ? (
                  <div className={css.gateCard} data-testid={`baf-stage-card-${node}`}>
                    <div className={css.gateCardLabel}>{t('gateStageLabel')}</div>
                    <div className={css.gateCardTitle}>
                      {t('gateStageArtifact')}
                      <span className={css.mono}> {stage.artifact}</span>
                    </div>
                    {detailed ? (
                      <>
                        <ul className={css.gateOptions}>
                          {stage.conditions.map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                        {stage.note !== undefined ? <div className={css.gateCardBody}>{stage.note}</div> : null}
                      </>
                    ) : (
                      <div className={css.gateCardBody}>
                        {t('gatesStageSummary').replace('{n}', String(stage.conditions.length))}
                      </div>
                    )}
                  </div>
                ) : (
                  detailed
                    ? <div className={css.gateEmpty}>{t('gateStageEmpty')}</div>
                    : null
                )}

                {confirms.map(gate => (
                  <ConfirmCard key={gate.id} gate={gate} detailed={detailed} t={t} />
                ))}

                {orphanHint.map(gate => (
                  <ConfirmCard key={gate.id} gate={gate} detailed={detailed} t={t} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConfirmCard({
  gate, detailed, t,
}: {
  gate: BafConfirmGateDigest
  detailed: boolean
  t: (key: BafStandardKey) => string
}) {
  return (
    <div className={css.gateCard} data-testid={`baf-confirm-card-${gate.id}`}>
      <div className={css.gateCardLabel}>
        {t('gateConfirmLabel')}
        {gate.bugFix === true ? <span className={css.chipForced}>{t('bugFixChip')}</span> : null}
      </div>
      <div className={css.gateCardTitle}>{gate.title}</div>
      {detailed ? (
        <>
          <div className={css.gateCardBody}>{gate.question}</div>
          {gate.optionLabels.length > 0 ? (
            <ul className={css.gateOptions}>
              {gate.optionLabels.map(label => <li key={label}>{label}</li>)}
            </ul>
          ) : gate.dynamicOptions !== undefined ? (
            <div className={css.gateCardBody}>{t('dynamicOptions')}</div>
          ) : null}
        </>
      ) : gate.optionLabels.length > 0 ? (
        <div className={css.gateCardBody}>
          {t('gatesOptionsSummary').replace('{n}', String(gate.optionLabels.length))}
        </div>
      ) : gate.dynamicOptions !== undefined ? (
        <div className={css.gateCardBody}>{t('dynamicOptions')}</div>
      ) : null}
    </div>
  )
}
