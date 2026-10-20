/**
 * 【变更】2026-10-20 (批次六 5): the 企业规范 tab's REAL-standards flow chart —
 * the 确认门/状态脚本 canvas anatomy (route-parity node cards, 192×48, one
 * zh+en name line, SVG bezier edges) where each node card's accent line lists
 * the SHORT tags of the standards that apply at that state; clicking a node
 * opens its 标准 list in the right-hand detail column, and clicking a
 * standard fetches the document's full text (bafplugin-migrated package
 * assets, served via the Remote's `enterpriseDoc`) into the in-card viewer —
 * real documents, never the constitution TODO placeholders.
 */
import { useState } from 'react'
import type { BafEnterpriseDocResult } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { BafStandardKey } from './locales.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { ENTERPRISE_DOC_ROWS, type EnterpriseDocNode, type EnterpriseDocRow } from './enterprise-docs-catalog.ts'
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

/** Canvas geometry — the 状态脚本/确认门 node card box and row pitch. */
const NODE_W = 192
const NODE_H = 48
const NODE_GAP = 16
const NODE_X = 16
const CANVAS_TOP = 16
const CANVAS_W = NODE_X + NODE_W + NODE_X
const CANVAS_H = NODES.length * NODE_H + (NODES.length - 1) * NODE_GAP + CANVAS_TOP * 2

/** Locale key per node — the SAME vocabulary the 状态脚本 canvas uses. */
const NODE_LABEL_KEYS: Record<EnterpriseDocNode, BafStandardKey> = {
  intake: 'hooksNodeIntake',
  open: 'hooksNodeOpen',
  clarify: 'hooksNodeClarify',
  design: 'hooksNodeDesign',
  plan: 'hooksNodePlan',
  implement: 'hooksNodeImplement',
  verify: 'hooksNodeVerify',
  archive: 'hooksNodeArchive',
}

/** English name riding inline after the zh label (one name line, 批次六 2/3). */
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

/** Docs applying at one node, in catalog order. */
const docsAt = (node: EnterpriseDocNode): readonly EnterpriseDocRow[] =>
  ENTERPRISE_DOC_ROWS.filter(doc => doc.nodes.includes(node))

/** The doc viewer's payload state the card renders. */
type DocViewer =
  | { readonly kind: 'loading'; readonly id: string }
  | { readonly kind: 'ready'; readonly result: Extract<BafEnterpriseDocResult, { status: 'ready' }> }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unreadable'; readonly reason: string }

/** One standard's row in the selected node's detail column. */
function DocRow({ doc, selected, t, onOpen }: {
  doc: EnterpriseDocRow
  selected: boolean
  t: StandardsPanelProps['t']
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={join(css.docRow, selected ? css.docRowSelected : undefined)}
      data-testid={`baf-enterprise-doc-${doc.id}`}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <span className={css.docRowMain}>
        <span className={css.docRowTitle}>{doc.titleZh}</span>
        <span className={css.docRowEn}>{doc.titleEn}</span>
      </span>
      <span className={css.docRowMeta}>
        {t('enterpriseDocApplies')}{doc.nodes.map(node => t(NODE_LABEL_KEYS[node])).join(' / ')}
      </span>
    </button>
  )
}

/** The in-card document viewer — full text of the clicked standard. */
function DocViewerSection({ viewer, t, onOpenFile, onClose }: {
  viewer: DocViewer
  t: StandardsPanelProps['t']
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const title = viewer.kind === 'ready'
    ? `${viewer.result.titleZh} · ${viewer.result.titleEn}`
    : undefined
  return (
    <div className={css.docViewer} data-testid="baf-enterprise-doc-viewer">
      <div className={css.docViewerHead}>
        <span className={css.docViewerTitle}>{title}</span>
        <span className={css.titleActions}>
          {viewer.kind === 'ready' ? (
            <button
              type="button"
              className={css.miniButton}
              data-testid="baf-enterprise-doc-open-file"
              title={viewer.result.path}
              onClick={() => { onOpenFile(viewer.result.path) }}
            >
              {t('enterpriseDocOpenFile')}
            </button>
          ) : null}
          <button
            type="button"
            className={css.miniButton}
            data-testid="baf-enterprise-doc-close"
            onClick={onClose}
          >
            {t('enterpriseDocClose')}
          </button>
        </span>
      </div>
      {viewer.kind === 'loading' ? (
        <div className={css.status}>{t('enterpriseDocLoading')}</div>
      ) : viewer.kind === 'ready' ? (
        <pre className={css.docBody} data-testid="baf-enterprise-doc-body">{viewer.result.content}</pre>
      ) : viewer.kind === 'unknown' ? (
        <div className={css.statusError}>{t('enterpriseDocUnknown')}</div>
      ) : (
        <div className={css.statusError}>{t('enterpriseDocUnreadable')}{viewer.reason}</div>
      )}
    </div>
  )
}

/** The 企业规范 flow-chart card — canvas + per-node detail + doc viewer. */
export function EnterpriseDocsCard({ state, t, openEnterpriseDoc, closeEnterpriseDoc, openPath }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
  closeEnterpriseDoc: StandardsOverviewFace['closeEnterpriseDoc']
  openPath: StandardsOverviewFace['openPath']
}) {
  // null = nothing picked yet: the effective selection follows the first node
  // that HAS standards (intake — the overview doc) until the user clicks.
  const [picked, setPicked] = useState<EnterpriseDocNode | null>(null)
  const firstSet = NODES.find(node => docsAt(node).length > 0)
  const selected = picked ?? firstSet ?? 'intake'

  // The canvas chip tags ride the active locale (the controller tracks it in
  // state; the panel re-renders on the same locale revision).
  const zh = state.localeActive === 'zh'
  const openId = state.enterpriseDocId
  const doc = state.enterpriseDoc
  const viewer: DocViewer | undefined = openId === undefined
    ? undefined
    : doc === undefined
      ? { kind: 'loading', id: openId }
      : doc.status === 'ready'
        ? { kind: 'ready', result: doc }
        : doc.status === 'unknown'
          ? { kind: 'unknown' }
          : { kind: 'unreadable', reason: doc.reason }

  // The canvas accent: the doc SHORT tags joined ' · ' (zh or en per locale);
  // a node without standards carries the idle line instead.
  const accentOf = (node: EnterpriseDocNode): { text: string; set: boolean } => {
    const docs = docsAt(node)
    if (docs.length === 0) return { text: t('enterpriseNodeNone'), set: false }
    return { text: docs.map(entry => zh ? entry.shortZh : entry.shortEn).join(' · '), set: true }
  }

  return (
    <div className={css.card} data-testid="baf-enterprise-docs-card">
      <div className={css.cardTitle}>{t('enterpriseFlowTitle')}</div>
      <div className={css.cardDesc}>{t('enterpriseFlowDesc')}</div>
      <div className={css.hooksFlowWrap}>
        <div className={css.hooksLegend}>
          <span className={css.hooksLegendItem}>
            <span className={css.hooksLegendDot} aria-hidden />{t('enterpriseLegendDocs')}
          </span>
          <span className={css.hooksLegendItem}>
            <span className={join(css.hooksLegendDot, css.hooksLegendDotIdle)} aria-hidden />{t('enterpriseNodeNone')}
          </span>
        </div>
        <div className={css.hooksSplit}>
          <div
            className={css.hooksFlowCanvas}
            role="group"
            aria-label={t('enterpriseFlowAria')}
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            <svg className={css.hooksEdges} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
              <defs>
                <marker
                  id="baf-standard-enterprise-arrow"
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
                    markerEnd="url(#baf-standard-enterprise-arrow)"
                    className={css.hooksEdge}
                  />
                )
              })}
            </svg>
            {NODES.map((node, index) => {
              const accent = accentOf(node)
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
                  data-testid={`baf-enterprise-node-${node}`}
                  aria-pressed={node === selected}
                  aria-label={`${label} · ${accent.text}`}
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
                  <span className={join(css.hooksNodeAccent, accent.set ? undefined : css.hooksNodeAccentIdle)}>
                    {accent.text}
                  </span>
                </button>
              )
            })}
          </div>
          <div className={css.hooksEditor} data-testid="baf-enterprise-docs-detail" data-node={selected}>
            <div className={css.hooksEditorBody}>
              <div className={css.hooksNodeHead}>
                <span className={css.hooksNodeLabel}>{t(NODE_LABEL_KEYS[selected])}</span>
                <span className={css.hooksNodeEn}>{NODE_EN[selected]}</span>
                <span className={css.hooksNodeId}>{selected}</span>
              </div>
              <div className={css.docList}>
                {docsAt(selected).map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    selected={openId === doc.id}
                    t={t}
                    onOpen={() => { void openEnterpriseDoc(doc.id) }}
                  />
                ))}
                {docsAt(selected).length === 0 ? (
                  <div className={css.status} data-testid={`baf-enterprise-node-none-${selected}`}>
                    {t('enterpriseNodeNone')}
                  </div>
                ) : null}
              </div>
              <div className={css.docHint}>{t('enterpriseDocsPick')}</div>
            </div>
          </div>
        </div>
        {viewer !== undefined ? (
          <DocViewerSection
            viewer={viewer}
            t={t}
            onOpenFile={(path) => { void openPath(path) }}
            onClose={() => { closeEnterpriseDoc() }}
          />
        ) : null}
      </div>
    </div>
  )
}
