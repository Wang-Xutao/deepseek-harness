/**
 * BAF 工程规范 settings panels (2026-10-12 工作流设置 7): split across 项目工程 /
 * 企业规范 / 质量监控 tabs — read-only baseline projections without workspace
 * meta dumps.
 *
 * 【变更】2026-10-20 (批次六 5, 客户决策): 企业规范 renders the REAL bafplugin
 * standards on a 确认门-parity workflow flow chart (which standard applies at
 * which state; click to read the document) — the placeholder-driven rules
 * digest and rules-doc viewer are retired. 质量监控 keeps its always-on
 * gate-mechanism card; its stack card stays baseline-gated (the
 * commands/thresholds ARE the project's git-managed baseline config).
 *
 * 【变更】2026-10-18 (项目工程 1.1–1.3, 客户决策): 项目工程 is no longer purely
 * read-only — the baseline card's project path / config file name are clickable
 * (reveal folder / open with default app), and the AI 禁改路径 card edits
 * `guard.protectedPaths` through the ONE write the Remote owns.
 */
import { useEffect, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafStandardSummaryResult } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import { NodeHooksCard } from './NodeHooksCard.tsx'
import { EnterpriseDocsCard } from './EnterpriseDocsCard.tsx'
import { EnterpriseDocViewer, viewerOf } from './EnterpriseDocViewer.tsx'
import { QualityEnvironmentCard } from './QualityEnvironmentCard.tsx'
import { QualityConfigCard } from './QualityConfigCard.tsx'
import { QualityFlowCard } from './QualityFlowCard.tsx'
import { QualityStandardsCard } from './QualityStandardsCard.tsx'
import { CommandsCard } from './CommandsCard.tsx'
import { type BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

/** Notice markers {@link StandardsController.pathGesture} sets verbatim. */
const NOTICE_TEXT: Record<string, BafStandardKey> = {
  openFailed: 'noticeOpenFailed',
  revealFailed: 'noticeRevealFailed',
}

/**
 * 【变更】2026-10-18 (项目工程 1.3): fold one picked ABSOLUTE folder into the
 * relative vocabulary `guard.protectedPaths` speaks. Pure, separator-agnostic,
 * drive-compared case-insensitively (Windows). Anything outside the workspace
 * root — or the root itself — is not expressible (the server-side validation
 * rejects `..` anyway) and answers undefined for the pick-outside notice.
 * @param cwd - the workspace root (absolute, native separators).
 * @param picked - the OS chooser's absolute answer.
 * @returns the relative entry (`a/b`), or undefined when not under the root.
 */
export function toRelativeEntry(cwd: string, picked: string): string | undefined {
  const segments = (value: string): string[] => value.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  const base = segments(cwd).map((part, index) => (index === 0 ? part.toLowerCase() : part))
  const target = segments(picked).map((part, index) => (index === 0 ? part.toLowerCase() : part))
  if (base[0] !== target[0]) return undefined
  let common = 0
  while (common < base.length && common < target.length && base[common] === target[common]) common += 1
  if (common < base.length) return undefined
  const rest = segments(picked).slice(common)
  return rest.length === 0 ? undefined : rest.join('/')
}

/** Normalize one draft entry the way the server-side rewrite will (cosmetic —
 * the authoritative validation lives in `validateProtectedPaths`). */
function normalizeEntry(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
}

/** Join a workspace root and one relative entry for an open/reveal gesture
 * (Node accepts mixed separators on Windows; the host resolves natively). */
export function joinEntry(cwd: string, entry: string): string {
  const cleaned = entry.replace(/\/\*\*$/, '')
  return `${cwd.replace(/\/+$/, '')}/${cleaned}`
}

/** Shared inject + locale props for all standards panels. */
export type StandardsPanelProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

/** @deprecated Use StandardsEnterpriseOverview — kept for spec imports. */
export type StandardsOverviewProps = StandardsPanelProps

function StatusSurface({ state, summary, t, suppressNoBaseline }: {
  state: StandardsOverviewState
  summary: StandardsOverviewState['summary']
  t: StandardsPanelProps['t']
  /** 【变更】2026-10-19 (六问题批 4.3): the 企业规范 tab drops its intro AND its
   * no-baseline banner — the always-rendering 8-domain structure below carries
   * the per-area degradation, so the top-level explanation line is noise. */
  suppressNoBaseline?: boolean
}) {
  if (state.status === 'loading') return <div className={css.status}>{t('statusLoading')}</div>
  if (state.status === 'failed') {
    return (
      <div className={css.statusError} data-testid="baf-standard-failed">
        {t('statusFailed')}{summary?.error ?? 'unknown'}
      </div>
    )
  }
  // 【变更】2026-10-12 (问题 4.2): the no-workspace / no-baseline answers used
  // to render NOTHING here — the tab body read as a blank page. Both now show
  // their guidance copy (pointing at /baf-scaffold), so every tab always
  // explains itself.
  if (state.status === 'no-workspace') {
    return <div className={css.status} data-testid="baf-standard-empty">{t('statusNoWorkspace')}</div>
  }
  if (state.status === 'no-baseline' && suppressNoBaseline !== true) {
    return <div className={css.status} data-testid="baf-standard-empty">{t('statusNoBaseline')}</div>
  }
  return null
}

/**
 * 【变更】2026-10-20 (批次三 4.1): the project path + config file rows adopt
 * the 通用 tab's 轨迹图/工作流图 row anatomy EXACTLY — one full-width
 * label-left / control-right line with 16px 0 padding and the bottom hairline.
 * The control side is the read-only mono value itself (folder reveal /
 * default-app open, hover title keeps the absolute path; the config row shows
 * only the file NAME).
 */
function ProjectPathRows({ summary, t, onReveal, onOpen }: {
  summary: StandardsOverviewState['summary']
  t: StandardsPanelProps['t']
  onReveal: (path: string) => void
  onOpen: (path: string) => void
}) {
  return (<>
    {summary?.cwd !== undefined ? (
      <ConfigPathRow
        testid="baf-standard-project-path"
        label={t('projectPathLabel')}
        text={summary.cwd}
        title={summary.cwd}
        onClick={() => { onReveal(summary.cwd ?? '') }}
      />
    ) : null}
    {summary?.baselinePath !== undefined ? (
      <ConfigPathRow
        testid="baf-standard-config-file"
        label={t('configFileLabel')}
        text={summary.baselinePath.replace(/^.*[\\/]/, '')}
        title={summary.baselinePath}
        onClick={() => { onOpen(summary.baselinePath ?? '') }}
      />
    ) : null}
  </>)
}

/** One config row: label left, mono clickable value right (通用 row parity). */
function ConfigPathRow({ testid, label, text, title, onClick }: {
  testid: string
  label: string
  /** The row's visible text (file NAME for the config row). */
  text: string
  /** Hover text — the FULL absolute path. */
  title: string
  onClick: () => void
}) {
  return (
    <div className={css.configRow} data-testid={testid}>
      <span className={css.configTitle}>{label}</span>
      <button type="button" className={css.configValue} title={title} onClick={onClick}>
        {text}
      </button>
    </div>
  )
}

/**
 * 【变更】2026-10-20 (批次四 3.5): one 受保护路径 entry — the copy/open row
 * buttons are GONE (the path text itself is the reveal click); 编辑 swaps in a
 * bare autoFocus input that commits on blur/Enter and reverts on Esc, so the
 * row always leaves edit state when focus moves away.
 */
function ProtectedPathRow({
  index, entry, cwd, editingValue, onEditChange, onFinishEdit, onCancelEdit, onBeginEdit, onRemove, onReveal, t,
}: {
  index: number
  entry: string
  cwd: string
  /** The in-flight edit's text (undefined ⇒ this row is not being edited). */
  editingValue: string | undefined
  onEditChange: (value: string) => void
  /** Commit-or-revert — invalid/duplicate text reverts with a notice. */
  onFinishEdit: () => void
  onCancelEdit: () => void
  onBeginEdit: () => void
  onRemove: () => void
  onReveal: () => void
  t: StandardsPanelProps['t']
}) {
  return (
    <div className={css.protectedRow} data-testid={`baf-standard-protected-row-${String(index)}`}>
      {editingValue !== undefined ? (
        <input
          type="text"
          className={css.rowEditInput}
          aria-label={t('protectedEditLabel')}
          value={editingValue}
          autoFocus
          onChange={(event) => { onEditChange(event.currentTarget.value) }}
          onBlur={onFinishEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Commit directly (blur alone won't fire on an unfocused input
              // under test; the null-guard makes the double path idempotent).
              event.preventDefault()
              onFinishEdit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancelEdit()
            }
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className={css.pathValueButton}
            title={joinEntry(cwd, entry)}
            onClick={onReveal}
          >
            {entry}
          </button>
          <span className={css.pathActions}>
            <button type="button" className={css.miniButton} onClick={onBeginEdit}>{t('editLabel')}</button>
            <button type="button" className={css.miniButton} onClick={onRemove}>{t('deleteLabel')}</button>
          </span>
        </>
      )}
    </div>
  )
}

/**
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策): the editable AI 禁改路径 card —
 * the ONE write surface on this page (every other field stays read-only per
 * the 2026-10-06 客户决策). Draft locally, save through the Remote's surgical
 * baseline write; a non-empty saved list also rides the git 提交防线 status.
 */
function ProtectedPathsCard({ state, summary, t, updateProtectedDraft, saveProtectedPaths, pickDirectory, revealPath }: {
  state: StandardsOverviewState
  /** The parent renders this card only inside its `status === 'ready'` branch
   * (a plain-interface status union does not narrow the object itself). */
  summary: BafStandardSummaryResult
  t: StandardsPanelProps['t']
  updateProtectedDraft: StandardsOverviewFace['updateProtectedDraft']
  saveProtectedPaths: StandardsOverviewFace['saveProtectedPaths']
  pickDirectory: StandardsOverviewFace['pickDirectory']
  revealPath: StandardsOverviewFace['revealPath']
}) {
  const [entryInput, setEntryInput] = useState('')
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null)
  const [localMessage, setLocalMessage] = useState<string | undefined>(undefined)
  const draft = state.protectedDraft ?? []
  const persisted = (summary.guardProtectedPaths ?? []).filter(entry => entry.trim() !== '<enterprise-tbd>')
  const dirty = draft.length !== persisted.length
    || draft.some((entry, index) => entry !== persisted[index])

  const addEntry = (raw: string): void => {
    const entry = normalizeEntry(raw)
    if (entry === '') return
    if (draft.some(existing => existing === entry)) {
      setLocalMessage(t('protectedDuplicate'))
      return
    }
    updateProtectedDraft([...draft, entry])
    setEntryInput('')
    setLocalMessage(undefined)
  }

  const onPick = (): void => {
    setLocalMessage(undefined)
    void pickDirectory().then((picked) => {
      if (picked === null) return
      const entry = toRelativeEntry(summary.cwd ?? '', picked)
      if (entry === undefined) {
        setLocalMessage(t('protectedPickOutside'))
        return
      }
      addEntry(entry)
    })
  }

  /** 【变更】2026-10-20 (批次四 3.5): blur/Enter finisher — valid text commits,
   * anything else reverts with a notice; the row ALWAYS leaves edit state. */
  const finishEdit = (): void => {
    if (editing === null) return
    const entry = normalizeEntry(editing.value)
    if (entry === '') {
      setEditing(null)
      setLocalMessage(t('protectedInvalidEntry'))
      return
    }
    if (draft.some((existing, index) => index !== editing.index && existing === entry)) {
      setEditing(null)
      setLocalMessage(t('protectedDuplicate'))
      return
    }
    updateProtectedDraft(draft.map((existing, index) => (index === editing.index ? entry : existing)))
    setEditing(null)
    setLocalMessage(undefined)
  }

  const notice = localMessage ?? state.protectedNotice
  const noticeKey = notice !== undefined ? NOTICE_TEXT[notice] : undefined

  return (
    <div className={css.card} data-testid="baf-standard-protected-card">
      {/* 【变更】2026-10-20 (批次四 3.4): save/cancel move to the title row's
          end (取消 quiet / 保存 brand-filled) — the bottom footer and the
          提交防线 hook line are gone. */}
      <div className={css.cardTitleRow}>
        <span className={css.cardTitle}>{t('protectedTitle')}</span>
        <span className={css.titleActions}>
          <button
            type="button"
            className={css.titleCancel}
            data-testid="baf-standard-protected-cancel"
            disabled={state.protectedSaving || !dirty}
            onClick={() => {
              setEditing(null)
              setEntryInput('')
              setLocalMessage(undefined)
              updateProtectedDraft([...persisted])
            }}
          >
            {t('protectedCancel')}
          </button>
          <button
            type="button"
            className={css.titleSave}
            data-testid="baf-standard-protected-save"
            disabled={state.protectedSaving || !dirty}
            onClick={() => { void saveProtectedPaths() }}
          >
            {state.protectedSaving ? t('protectedSaving') : t('protectedSave')}
          </button>
        </span>
      </div>
      {draft.length === 0 ? (
        <div className={css.protectedEmpty} data-testid="baf-standard-protected-empty">
          {t('protectedEmpty')}
        </div>
      ) : (
        <div className={css.protectedList}>
          {draft.map((entry, index) => (
            <ProtectedPathRow
              key={`${String(index)}-${entry}`}
              index={index}
              entry={entry}
              cwd={summary.cwd ?? ''}
              editingValue={editing !== null && editing.index === index ? editing.value : undefined}
              onEditChange={(value) => { setEditing({ index, value }) }}
              onFinishEdit={finishEdit}
              onCancelEdit={() => { setEditing(null) }}
              onBeginEdit={() => { setEditing({ index, value: entry }) }}
              onRemove={() => {
                setEditing(null)
                updateProtectedDraft(draft.filter((_, index2) => index2 !== index))
              }}
              onReveal={() => { void revealPath(joinEntry(summary.cwd ?? '', entry)) }}
              t={t}
            />
          ))}
        </div>
      )}
      <div className={css.addRow}>
        <input
          type="text"
          className={css.addInput}
          aria-label={t('protectedAddPlaceholder')}
          placeholder={t('protectedAddPlaceholder')}
          value={entryInput}
          onChange={(event) => { setEntryInput(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addEntry(entryInput)
            }
          }}
        />
        <button
          type="button"
          className={css.miniButton}
          data-testid="baf-standard-protected-add"
          onClick={() => { addEntry(entryInput) }}
        >
          {t('protectedAdd')}
        </button>
        <button
          type="button"
          className={css.miniButton}
          data-testid="baf-standard-protected-pick"
          onClick={onPick}
        >
          {t('protectedPick')}
        </button>
      </div>
      {notice !== undefined ? (
        <div className={css.statusError} data-testid="baf-standard-protected-notice">
          {noticeKey !== undefined ? t(noticeKey) : notice}
        </div>
      ) : null}
    </div>
  )
}

function usePanelState(props: StandardsPanelProps) {
  const state = props.useStandards(identity<StandardsOverviewState>)
  // 【变更】2026-10-19 (六问题批 4.1 web 验证修复): the summary the controller
  // fetched at plugin ACTIVATION goes stale once the user switches sessions or
  // workspaces — re-read it every time a tab mounts so 项目路径 tracks the
  // current session. refreshIfClean self-gates on mid-edit drafts.
  const { refreshIfClean } = props
  useEffect(() => { refreshIfClean() }, [refreshIfClean])
  return { state, summary: state.summary }
}

/** 项目工程 tab — the three config items, one full-width row each. */
export function StandardsProjectOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { t } = props
  const {
    openPath, revealPath, updateProtectedDraft, saveProtectedPaths, pickDirectory,
    generateBaseline, statWorkspacePath,
  } = props

  return (
    <section className={css.block} data-testid="baf-standard-project">
      {/* 【变更】2026-10-19 (六问题批 4.1): the panel head (title + description)
          is deleted — the tab label already says 项目工程; the no-baseline banner
          yields to the dedicated error + 生成配置文件 button below. */}
      <StatusSurface state={state} summary={summary} t={t} suppressNoBaseline />
      {/* 【变更】2026-10-20 (批次四 3.7): the two config rows share a 项目信息
          card (still rendered in BOTH states — the server returns
          cwd/baselinePath even without a baseline); inside it, the 通用
          轨迹图 row anatomy — label left, mono value right, click opens. */}
      {summary?.cwd !== undefined || summary?.baselinePath !== undefined ? (
        <div className={css.card} data-testid="baf-standard-project-info">
          <div className={css.cardTitle}>{t('projectInfoTitle')}</div>
          <div className={css.projectInfoRows}>
            <ProjectPathRows
              summary={summary}
              t={t}
              onReveal={(path) => { void revealPath(path) }}
              onOpen={(path) => { void openPath(path) }}
            />
          </div>
        </div>
      ) : null}
      {summary?.status === 'no-baseline' ? (
        <div className={css.generateRow} data-testid="baf-standard-generate">
          <div className={css.statusError}>{t('noBaselineError')}</div>
          <button
            type="button"
            className={css.saveButton}
            data-testid="baf-standard-generate-button"
            disabled={state.generating}
            onClick={() => { void generateBaseline() }}
          >
            {state.generating ? t('generatingBaseline') : t('generateBaseline')}
          </button>
          {state.generateNotice !== undefined ? (
            <div className={css.statusError} data-testid="baf-standard-generate-notice">
              {state.generateNotice}
            </div>
          ) : null}
        </div>
      ) : null}
      {summary?.status === 'ready' ? (
        /* 【变更】2026-10-20 (批次三 4.2): the multi-column grid is gone, and
            with it the baseline archive card, the per-package projection cards,
            and the scaffold card — the tab keeps ONLY 受保护路径 and 状态脚本,
            each a full-width card on its own row (the path rows above are the
            first item). */
        <div className={css.stack}>
          <ProtectedPathsCard
            state={state}
            summary={summary}
            t={t}
            updateProtectedDraft={updateProtectedDraft}
            saveProtectedPaths={saveProtectedPaths}
            pickDirectory={pickDirectory}
            revealPath={revealPath}
          />
          <NodeHooksCard
            state={state}
            summary={summary}
            t={t}
            openPath={openPath}
            statWorkspacePath={statWorkspacePath}
            updateHooksDraft={props.updateHooksDraft}
            saveNodeHooks={props.saveNodeHooks}
          />
        </div>
      ) : null}
    </section>
  )
}

/**
 * 质量监控 tab — 【变更】2026-10-21 (质量监控重构 1.1–1.6, 客户决策): the tab
 * head, the old 单元测试 card, the toolchain-docs card and the baseline stack
 * (baf-quality · 质量门禁) card are all DELETED; the tab is now THREE cards —
 * 环境 (real probed toolchain versions + workspace support verdict + 一键安装),
 * 配置 (workspace unit-test config values + the HTML 测试报告 preview modal),
 * and 规范 (every UT-related standards document, categorized).
 */
export function StandardsQualityOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const {
    openEnterpriseDoc, closeEnterpriseDoc, openPath, t,
    probeQualityEnvironment, installQualityToolchain,
    loadQualityConfiguration, openQualityReport, closeQualityReport,
  } = props
  // 【变更】2026-10-21 (批次八 3.2/3.4): ONE full-screen doc modal per tab —
  // the 规范 card opens documents through the shared store field, so the tab
  // (not the card) renders the single viewer.
  const viewer = viewerOf(state.enterpriseDocId, state.enterpriseDoc)
  // 【变更】2026-10-21 (质量监控重构 1.3/1.4): the probe + config readout are
  // their own Remote rounds (not part of the summary) — fire them on every
  // tab mount so the verdict tracks the machine, not the activation-time
  // snapshot. Both self-gate double-runs in the controller.
  useEffect(() => {
    void probeQualityEnvironment()
    void loadQualityConfiguration()
  }, [probeQualityEnvironment, loadQualityConfiguration])

  return (
    <section className={css.blockQuality} data-testid="baf-standard-quality">
      <StatusSurface state={state} summary={summary} t={t} />
      <div className={css.stack}>
        <QualityEnvironmentCard
          state={state}
          t={t}
          onRecheck={() => { void probeQualityEnvironment() }}
          onInstall={() => { void installQualityToolchain() }}
        />
        <QualityConfigCard
          state={state}
          t={t}
          onPreview={() => { void openQualityReport() }}
          onClosePreview={() => { closeQualityReport() }}
          onOpenPath={(path) => { void openPath(path) }}
        />
        {/* 【变更】2026-10-21 (批次十 测试流图): the execution-flow chart rides
            right after 配置 — the config above says WHERE the pieces live, the
            chart says in WHICH ORDER they run and WHICH standard governs each. */}
        <QualityFlowCard t={t} openEnterpriseDoc={openEnterpriseDoc} />
        <QualityStandardsCard
          state={state}
          t={t}
          openEnterpriseDoc={openEnterpriseDoc}
        />
      </div>
      {viewer !== undefined ? (
        <EnterpriseDocViewer
          viewer={viewer}
          t={t}
          onOpenFile={(path) => { void openPath(path) }}
          onClose={() => { closeEnterpriseDoc() }}
        />
      ) : null}
    </section>
  )
}

/**
 * 指令集 tab — 【变更】2026-10-21 (指令集): every baf command, on the same
 * flow-chart anatomy the 企业规范 tab uses. Each state node counts its
 * state-bound commands; the detail column explains each (做什么用 / 有什么
 * 效果); the global band below the chart carries the any-state commands.
 * Pure display — the customer drives commands in the session, not here.
 */
export function StandardsCommandsOverview(props: StandardsPanelProps) {
  const { state } = usePanelState(props)
  const { t } = props
  return (
    <section className={css.block} data-testid="baf-standard-commands">
      <StatusSurface state={state} summary={state.summary} t={t} suppressNoBaseline />
      <CommandsCard state={state} t={t} />
    </section>
  )
}

/** 企业规范 tab — REAL bafplugin standards on a workflow flow chart. */
export function StandardsEnterpriseOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { openEnterpriseDoc, closeEnterpriseDoc, openPath, t } = props

  return (
    <section className={css.block} data-testid="baf-standard-overview">
      {/* 【变更】2026-10-19 (六问题批 4.3): the tab-head title + description and
          the no-baseline banner are gone — the tab label already says 企业规范,
          and the content below (a product constant) renders regardless of
          baseline state instead of explaining itself. */}
      <StatusSurface state={state} summary={summary} t={t} suppressNoBaseline />

      {/* 【变更】2026-10-20 (批次六 5, 客户决策): the placeholder-driven rules
          digest + rules-doc viewer are REPLACED by the REAL enterprise
          standards (bafplugin-migrated package assets) rendered as the
          确认门-parity flow chart — which standard applies at which state,
          click to read the document itself.
          【变更】2026-10-20 (批次七 2.2): the 企业规范资产（方案乙）card and the
          baf-standard · 工程规范 baseline card are REMOVED — the tab is the
          flow chart + document viewer, nothing else. */}
      <EnterpriseDocsCard
        state={state}
        t={t}
        openEnterpriseDoc={openEnterpriseDoc}
        closeEnterpriseDoc={closeEnterpriseDoc}
        openPath={openPath}
      />
    </section>
  )
}

/** @deprecated Alias for StandardsEnterpriseOverview. */
export const StandardsOverview = StandardsEnterpriseOverview
