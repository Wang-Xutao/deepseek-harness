/**
 * 【变更】2026-10-24 (批次二十 3): the READ-ONLY parts of the session
 * workflow graph, extracted so the 变更总览's per-change detail page can show
 * the SAME graph and the SAME stage detail as the session tab.
 *
 * Why this file exists: the customer asked the change-detail page to show the
 * complete workflow graph, identical to the session's 工作流图, with details
 * on top / left / right. The session's canvas and rail cards lived inside the
 * 2900-line `WorkflowView.tsx`, so the detail page could not reuse them
 * without either (a) duplicating a 350-line pan/zoom canvas — two graphs that
 * drift apart on the next change — or (b) importing `WorkflowView.tsx` from
 * `ChangeOverviewRow.tsx`, which would create an import cycle (WorkflowView
 * imports the canvas, the canvas's module imports WorkflowView).
 *
 * So the pieces both surfaces need live here, and BOTH import them:
 * - `WorkflowView.tsx` (the session tab) — unchanged behaviour, new import.
 * - `ChangeOverviewRow.tsx` (the 变更总览 detail page) — the same graph, the
 *   same stage checklist, the same stage detail, the same artifact rail.
 *
 * The design contract with the session tab: the graph, the node cards, the
 * status colours and the detail copy are ONE system. A change that looks
 * different in the ledger than in the conversation is a bug, not a variant.
 */
import clsx from 'clsx'
import type { ReactElement } from 'react'
import type { TestFlowStepId, WorkflowNodeId, WorkflowTabNodeView } from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { CATALOG_ZH } from './catalog-i18n.ts'
import { CONDITION_ZH } from './graph-template.ts'
import { formatDuration, formatTokens } from './dashboard-format.ts'
import css from './WorkflowView.module.css'

/* ── canvas geometry (the session graph's grid) ──────────────────────────── */

/** Column pitch of the node grid. */
export const COL_W = 248
/** Row pitch of the node grid. */
export const ROW_H = 128
/** Node card width. */
export const NODE_W = 208
/** Node card height. */
export const NODE_H = 96
/** Smallest zoom the canvas allows. */
export const ZOOM_MIN = 0.55
/** Largest zoom the canvas allows. */
export const ZOOM_MAX = 1.8

/** Clamp a number into [min, max] — wheel-pan bounds. */
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/* ── the 测试流图 jump chips ─────────────────────────────────────────────── */

/**
 * The stages that carry a 测试流图 shortcut. The link is gated host-side by
 * the required `test-flow` check, so it sits exactly where the 测试流 becomes
 * the gatekeeper — and it is NOT forced into the model's dispatch loop.
 */
export const TEST_FLOW_JUMPS: Partial<Record<WorkflowNodeId, TestFlowStepId>> = {
  verify: 'test',
}

/** The jump chip's 测试流图 stage label key (reuses the 测试流图's node catalog). */
export const TEST_FLOW_JUMP_LABEL: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.node.build',
  test: 'tflow.node.test',
  instrument: 'tflow.node.instrument',
  report: 'tflow.node.report',
  gate: 'tflow.node.gate',
  lint: 'tflow.node.lint',
  analyze: 'tflow.node.analyze',
  format: 'tflow.node.format',
}

/* ── stage figures ───────────────────────────────────────────────────────── */

/**
 * Whether a node status means the flow actually EXECUTED that stage — an
 * executed stage shows its real figures and 0 / 0s when nothing was
 * attributed (a completed stage must never read —); only stages the flow
 * never reached (locked / skipped / template / idle) keep the — blank.
 */
export function stageExecuted(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'in-progress' || status === 'failed'
    || status === 'blocked' || status === 'drifted'
}

/** Stage-aware duration: executed → real value or 0s; never-executed → —. */
export function stageDuration(status: WorkflowTabNodeView['status'] | undefined, ms: number | undefined): string {
  if (ms !== undefined) return formatDuration(ms)
  return stageExecuted(status) ? '0s' : '—'
}

/** Stage-aware tokens: executed → real value or 0K; never-executed → —. */
export function stageTokens(
  status: WorkflowTabNodeView['status'] | undefined,
  input: number | undefined,
  output: number | undefined,
): string {
  if (input !== undefined || output !== undefined) return formatTokens(input, output)
  return stageExecuted(status) ? formatTokens(0, 0) : '—'
}

/** The status badge class for one node status. */
export function statusClass(status: WorkflowTabNodeView['status']): string {
  switch (status) {
    case 'completed': return css.statusCompleted ?? ''
    case 'in-progress': return css.statusInProgress ?? ''
    case 'failed':
    case 'blocked': return css.statusFailed ?? ''
    case 'drifted': return css.statusDrifted ?? ''
    // 已忽略 is gray EVERYWHERE — only 漂移 itself keeps the amber.
    case 'skipped': return css.statusIdle ?? ''
    // 已裁剪 (bug-fix 裁剪掉的 full-go 节点) is gray like 已忽略.
    case 'clipped': return css.statusIdle ?? ''
    default: return css.statusIdle ?? ''
  }
}

/** Trim a recorded artifact path down to its file name for display. */
export function artifactName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/**
 * Whether a catalog action is treated as done for checkbox display.
 * 'clipped' joins — a 裁剪 node's whole action list is moot.
 * @param status - node status.
 * @returns true when the stage is finished.
 */
export function stageActionsDone(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'skipped' || status === 'clipped'
}

/* ── the rail cards ──────────────────────────────────────────────────────── */

/**
 * 【变更】2026-10-24 (批次二十 3): the artifact rail.
 *
 * `onOpen` is OPTIONAL: the session tab opens an artifact in the sidebar, the
 * 变更总览 detail page has no session behind it and therefore no sidebar to
 * open into — there the row is a static chip (the file name and its state are
 * still read; only the click is absent). A row that has no file to open
 * (missing / clipped) never offered a click in the first place.
 */
export function ArtifactRail(props: {
  rows: readonly {
    readonly file: string
    readonly path: string
    readonly state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'
    readonly missing: readonly string[]
  }[]
  disabled?: boolean
  onOpen?: (path: string) => void
  t: (key: WorkflowTabKey) => string
}): ReactElement {
  const { rows, disabled = false, onOpen, t } = props
  const stateLabel = (state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'): string =>
    t(`artifact.state.${state}`)
  const stateClass = (state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'): string =>
    state === 'filled' ? css.artifactStateFilled ?? ''
      : state === 'planned' ? css.artifactStatePlanned ?? css.artifactStateTemplate ?? ''
        : state === 'template' || state === 'clipped' ? css.artifactStateTemplate ?? ''
          : css.artifactStateMissing ?? ''
  // Each row names the stage that produces it — 「设计 design.md」「验证 verify.md」—
  // so the rail reads as the stage→document map it is.
  const stageOf = (file: string): string => {
    if (file === 'proposal.md') return t('node.open')
    if (file === 'clarify.md') return t('node.clarify')
    if (file === 'design.md') return t('node.design')
    if (file === 'plan.md' || file === 'plan.json' || file === 'tasks.md') return t('node.plan')
    if (file === 'verify.md' || file === 'verify-report.json' || file === 'checklist.md') return t('node.verify')
    return ''
  }
  return (
    <section className={clsx(css.card, css.cardAccent)} aria-label={t('artifact.title')}>
      <h3 className={css.cardTitle}>{t('artifact.title')}</h3>
      {rows.map((row) => {
        // clipped rows (bug-fix 裁剪的 full-go 产物) render dimmed with no open
        // button — the file is never produced on this mode, so there is
        // nothing to open.
        const blocked = row.state === 'missing' || row.state === 'clipped'
        const stage = stageOf(row.file)
        const label = stage === '' ? row.file : `${stage} · ${row.file}`
        return (
          <div key={row.path}>
            <div className={css.artifactRow}>
              {onOpen === undefined ? (
                <span className={css.artifactNameStatic} title={row.path}>{label}</span>
              ) : (
                <button
                  type="button"
                  className={clsx(css.artifactNameBtn)}
                  disabled={disabled || blocked}
                  title={blocked ? t('artifact.missing') : row.path}
                  onClick={() => { onOpen(row.path) }}
                >
                  {label}
                </button>
              )}
              <span className={clsx(css.artifactState, stateClass(row.state))}>
                {stateLabel(row.state)}
              </span>
            </div>
            {(row.state === 'template' || row.state === 'planned') && row.missing.length > 0 && (
              <div className={css.artifactGap} title={row.missing.join('\n')}>
                {t('artifact.gapCount').replace('{n}', String(row.missing.length))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

/**
 * The stage's checklist — the actions still to do and the ones already done.
 * The session rail and the 变更总览 detail rail read the same list.
 */
export function StageChecklist(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
}): ReactElement {
  const { node, t } = props
  const zh = CATALOG_ZH[node.id]
  const actions = node.catalog.actions
  const done = stageActionsDone(node.status)
  const todo = done ? [] : [...actions]
  const finished = done ? [...actions] : []

  return (
    <div className={css.checklist}>
      <div className={css.checklistBlock}>
        <div className={css.checklistHead}>{t('detail.todoTitle')}</div>
        {todo.length === 0 ? (
          <p className={css.hint}>{t('detail.todoEmpty')}</p>
        ) : (
          <ul className={css.flowOps}>
            {todo.map((action, index) => {
              const actionIndex = actions.indexOf(action)
              return (
                <li key={`todo-${index}`} className={css.flowOpItem}>
                  <span className={css.flowCheck} aria-hidden />
                  <span className={css.flowOpZh}>
                    {zh?.actions[actionIndex] ?? action}
                  </span>
                  <span className={css.flowOpState}>{t('card.todo')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {finished.length > 0 && (
        <div className={css.checklistBlock}>
          <div className={css.checklistHead}>{t('detail.doneTitle')}</div>
          <ul className={css.flowOps}>
            {finished.map((action, index) => {
              const actionIndex = actions.indexOf(action)
              return (
                <li key={`done-${index}`} className={css.flowOpItem}>
                  <span className={clsx(css.flowCheck, css.flowCheckDone)} aria-hidden>✓</span>
                  <span className={clsx(css.flowOpZh, css.flowOpDone)}>
                    {zh?.actions[actionIndex] ?? action}
                  </span>
                  <span className={css.flowOpState}>{t('card.done')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * The stage's detail — status, figures, the next stage and its condition, and
 * the four catalog sections (purpose / prerequisites / artifacts / completion).
 *
 * 【变更】2026-10-24 (批次二十 3): the anomaly block renders ONLY when this
 * stage actually sits failed/blocked; a healthy stage shows nothing there.
 */
export function BilingualDetail(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
  nextEdge: { id: string; to: string; condition: string } | null
}): ReactElement {
  const { node, t, nextEdge } = props
  const zh = CATALOG_ZH[node.id]
  const failed = node.status === 'failed' || node.status === 'blocked'
  const sections: Array<{
    title: WorkflowTabKey
    items: readonly string[]
    block?: string
  }> = [
    {
      title: 'detail.purpose',
      items: [],
      block: zh?.purpose ?? node.catalog.purpose,
    },
    {
      title: 'detail.prerequisites',
      items: zh?.prerequisites ?? node.catalog.prerequisites,
    },
    {
      title: 'detail.artifacts',
      items: zh?.artifacts ?? node.catalog.artifacts,
    },
    {
      title: 'detail.completion',
      items: zh?.completion ?? node.catalog.completion,
    },
  ]

  return (
    <>
      <div className={css.metaRow}>
        <span className={css.metaKey}>{t('detail.status')}</span>
        <span>{t(`status.${node.status}`)}</span>
        <span className={css.metaKey}>{t('card.duration')}</span>
        <span>{stageDuration(node.status, node.metrics?.durationMs)}</span>
        <span className={css.metaKey}>{t('card.tokens')}</span>
        <span title={t('metrics.pending')}>
          {stageTokens(node.status, node.metrics?.inputTokens, node.metrics?.outputTokens)}
        </span>
        {nextEdge !== null && (
          <>
            <span className={css.metaKey}>{t('card.next')}</span>
            <span>{t(`node.${nextEdge.to}` as WorkflowTabKey)}</span>
            <span className={css.metaKey}>{t('card.condition')}</span>
            <span>{CONDITION_ZH[nextEdge.id] ?? nextEdge.condition}</span>
          </>
        )}
      </div>
      {sections.map((section) => {
        if (section.block === undefined && section.items.length === 0) return null
        return (
          <div key={section.title} className={css.biSection}>
            <div className={css.metaKey}>{t(section.title)}</div>
            {section.block !== undefined && (
              <p className={css.biZh}>{section.block}</p>
            )}
            {section.items.length > 0 && (
              <ul className={css.list}>
                {section.items.map(item => (
                  <li key={item}>
                    <div className={css.biZh}>{item}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {failed && (
        <div className={css.biSection}>
          <div className={css.metaKey}>{t('detail.failure')}</div>
          {node.detail !== undefined && node.detail !== '' && (
            <p className={css.biZh}>{node.detail}</p>
          )}
          {node.reasonCodes !== undefined && node.reasonCodes.length > 0 && (
            <p className={css.hint}>{node.reasonCodes.join(' · ')}</p>
          )}
          {(zh?.failure ?? node.catalog.failure).length > 0 && (
            <ul className={css.list}>
              {(zh?.failure ?? node.catalog.failure).map(item => (
                <li key={item}>
                  <div className={css.biZh}>{item}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
