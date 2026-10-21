/**
 * 【变更】2026-10-21 (指令集 tab): the BAF 指令集 flow chart — the 企业规范
 * canvas anatomy (route-parity node cards, 192×48, SVG bezier edges), where
 * each state node's accent line counts the commands bound to that state and
 * clicking a node lists them in the right-hand detail column.
 * 【变更】2026-10-22 (批次十一 3): the legend is DELETED and the layout splits
 * into TWO big cards — 状态指令 (the flow chart + per-state detail column) and
 * 全局指令 (its own full-width card, full rows — the old compact global band
 * is gone). Every command row now answers three captioned questions: 作用
 * (desc, verbatim from baf-workflow's help tables), 功能 (effect — the
 * mechanism) and 运行结果 (result — what the customer sees after it runs).
 * Pure display — nothing here dispatches.
 */
import { useState } from 'react'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { NODE_LABEL_KEYS } from './EnterpriseDocsCard.tsx'
import type { EnterpriseDocNode } from './enterprise-docs-catalog.ts'
import { BAF_GLOBAL_COMMANDS, commandsAt, type BafCommandEntry } from './baf-commands-catalog.ts'
import css from './StandardsOverview.module.css'

/** Main-chain order the engine enforces (WORKFLOW_NODES minus drift). */
const NODES: readonly EnterpriseDocNode[] = [
  'intake',
  'open',
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
]

/** Canvas geometry — the SAME box the 企业规范/状态脚本 canvas draws. */
const NODE_W = 192
const NODE_H = 48
const NODE_GAP = 16
const NODE_X = 16
const CANVAS_TOP = 16
const CANVAS_W = NODE_X + NODE_W + NODE_X
const CANVAS_H = NODES.length * NODE_H + (NODES.length - 1) * NODE_GAP + CANVAS_TOP * 2

/** English name riding inline after the zh label (one name line). */
const NODE_EN: Record<EnterpriseDocNode, string> = {
  intake: 'Intake',
  open: 'Open change',
  clarify: 'Clarify',
  design: 'Design',
  plan: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  archive: 'Archive',
}

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/**
 * One command row — mono id + stars, then the three captioned explain lines:
 * 作用 (the help table's desc), 功能 (mechanism) and 运行结果 (outcome).
 */
function CommandRow({ command, t }: { command: BafCommandEntry; t: StandardsPanelProps['t'] }) {
  return (
    <div
      className={css.cmdRow}
      data-testid={`baf-command-${command.id.replace(/^\//, '').replace(/-/g, '_')}`}
    >
      <div className={css.cmdHead}>
        <span className={css.cmdName}>{command.id}</span>
        <span className={css.cmdStars} aria-label={`★ ${String(command.stars)}`}>
          {'★'.repeat(command.stars)}
        </span>
      </div>
      <div className={css.cmdField}>
        <span className={css.cmdFieldKey}>{t('cmdUseLabel')}</span>
        <span className={join(css.cmdFieldValue, css.cmdFieldDesc)}>{command.desc}</span>
      </div>
      <div className={css.cmdField}>
        <span className={css.cmdFieldKey}>{t('cmdEffectLabel')}</span>
        <span className={css.cmdFieldValue}>{command.effect}</span>
      </div>
      <div className={css.cmdField}>
        <span className={css.cmdFieldKey}>{t('cmdResultLabel')}</span>
        <span className={css.cmdFieldValue}>{command.result}</span>
      </div>
    </div>
  )
}

/**
 * The 指令集 tab — two stacked cards: the 状态指令 flow chart (canvas +
 * per-node command list) and the 全局指令 card (any-state commands, full rows).
 */
export function CommandsCard({ t }: {
  t: StandardsPanelProps['t']
}) {
  // null = nothing picked yet: the selection follows the first node that HAS
  // commands (intake — /baf-go + /baf-workflow-open) until the user clicks.
  const [picked, setPicked] = useState<EnterpriseDocNode | null>(null)
  const firstSet = NODES.find(node => commandsAt(node).length > 0)
  const selected = picked ?? firstSet ?? 'intake'

  return (
    <div className={css.stack} data-testid="baf-commands-cards">
      {/* 状态指令 — the per-state flow chart card. */}
      <div className={css.cardFlow} data-testid="baf-commands-card">
        <div className={css.cardTitle}>{t('cmdStateTitle')}</div>
        <div className={css.cardDesc}>{t('cmdStateIntro')}</div>
        <div className={css.hooksFlowWrap}>
          <div className={css.hooksSplit}>
            <div
              className={css.hooksFlowCanvas}
              role="group"
              aria-label={t('cmdFlowAria')}
              style={{ width: CANVAS_W, height: CANVAS_H }}
            >
              <svg className={css.hooksEdges} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
                <defs>
                  <marker
                    id="baf-standard-commands-arrow"
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
                {NODES.slice(0, -1).map((node, index) => {
                  // The same-column vertical bezier, bottom-center → top-center.
                  const x = NODE_X + NODE_W / 2
                  const y1 = CANVAS_TOP + index * (NODE_H + NODE_GAP) + NODE_H
                  const y2 = CANVAS_TOP + (index + 1) * (NODE_H + NODE_GAP)
                  const mid = (y1 + y2) / 2
                  return (
                    <path
                      key={node}
                      d={`M ${x} ${y1} C ${x} ${mid}, ${x} ${mid}, ${x} ${y2}`}
                      markerEnd="url(#baf-standard-commands-arrow)"
                      className={css.hooksEdge}
                    />
                  )
                })}
              </svg>
              {NODES.map((node, index) => {
                const count = commandsAt(node).length
                const accent = `${String(count)} ${t('cmdAccentUnit')}`
                const label = t(NODE_LABEL_KEYS[node])
                return (
                  <button
                    key={node}
                    type="button"
                    className={join(
                      css.hooksNode,
                      css.hooksNodeMain,
                      node === selected ? css.hooksNodeSelected : undefined,
                    )}
                    data-testid={`baf-commands-node-${node}`}
                    aria-pressed={node === selected}
                    aria-label={`${label} · ${accent}`}
                    style={{
                      left: NODE_X,
                      top: CANVAS_TOP + index * (NODE_H + NODE_GAP),
                      width: NODE_W,
                      height: NODE_H,
                    }}
                    onClick={() => { setPicked(node) }}
                  >
                    <span className={css.hooksNodeName}>
                      {label}
                      <span className={css.hooksNodeEn}>{NODE_EN[node]}</span>
                    </span>
                    <span className={css.hooksNodeAccent}>{accent}</span>
                  </button>
                )
              })}
            </div>
            <div className={css.hooksEditor} data-testid="baf-commands-detail" data-node={selected}>
              <div className={css.hooksEditorBody}>
                <div className={css.hooksNodeHead}>
                  <span className={css.hooksNodeLabel}>{t(NODE_LABEL_KEYS[selected])}</span>
                  <span className={css.hooksNodeEn}>{NODE_EN[selected]}</span>
                  <span className={css.hooksNodeId}>{selected}</span>
                </div>
                <div className={css.cmdList}>
                  {commandsAt(selected).map(command => (
                    <CommandRow key={command.id} command={command} t={t} />
                  ))}
                  {commandsAt(selected).length === 0 ? (
                    <div className={css.status} data-testid={`baf-commands-node-none-${selected}`}>
                      {t('cmdNodeNone')}
                    </div>
                  ) : null}
                </div>
                <div className={css.docHint}>{t('cmdPick')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* 全局指令 — its OWN card now (批次十一 3): full rows, same three
          captioned lines as the state rows, in a responsive two-column grid. */}
      <div className={css.card} data-testid="baf-commands-global">
        <div className={css.cardTitle}>{t('cmdGlobalTitle')}</div>
        <div className={css.cardDesc}>{t('cmdGlobalIntro')}</div>
        <div className={css.cmdListGrid}>
          {BAF_GLOBAL_COMMANDS.map(command => (
            <CommandRow key={command.id} command={command} t={t} />
          ))}
        </div>
      </div>
    </div>
  )
}
