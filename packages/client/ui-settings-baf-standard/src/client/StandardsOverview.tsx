/**
 * BAF 工程规范 settings panels (2026-10-12 工作流设置 7): split across 项目工程 /
 * 企业规范 / 质量监控 tabs — read-only baseline projections without workspace
 * meta dumps; enterprise rules group by workflow stage.
 *
 * 【变更】2026-10-13 (问题 4 批, 客户决策): 企业规范's 8-domain structure and
 * stage grouping are product constants and ALWAYS render — only the rules
 * content needs the baseline (per-area body and the full document degrade
 * with a /baf-scaffold pointer). 质量监控 gains an always-on gate-mechanism
 * card (product-fixed knowledge); its stack card stays baseline-gated (the
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
import { InlineEditor, useCopyFeedback } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BafStandardCardId, BafStandardFieldRow, BafStandardSummaryResult } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import { NodeHooksCard } from './NodeHooksCard.tsx'
import { NS, type BafStandardKey } from './locales.ts'
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

/** Join a workspace root and one relative entry for a reveal gesture (Node
 * accepts mixed separators on Windows; the host resolves natively). */
function joinEntry(cwd: string, entry: string): string {
  const cleaned = entry.replace(/\/\*\*$/, '')
  return `${cwd.replace(/\/+$/, '')}/${cleaned}`
}

const AREA_META: Record<string, readonly [BafStandardKey, BafStandardKey]> = {
  'project-charter': ['area.project-charter', 'areaDesc.project-charter'],
  'coding-style': ['area.coding-style', 'areaDesc.coding-style'],
  interfaces: ['area.interfaces', 'areaDesc.interfaces'],
  'error-handling': ['area.error-handling', 'areaDesc.error-handling'],
  logging: ['area.logging', 'areaDesc.logging'],
  documentation: ['area.documentation', 'areaDesc.documentation'],
  'branch-commit': ['area.branch-commit', 'areaDesc.branch-commit'],
  'testing-discipline': ['area.testing-discipline', 'areaDesc.testing-discipline'],
}

/** Workflow stages → rule domains shown under 企业规范. */
const STAGE_AREA_GROUPS: readonly {
  stageKey: BafStandardKey
  hintKey: BafStandardKey
  areas: readonly string[]
}[] = [
  { stageKey: 'stage.intake', hintKey: 'stageHint.intake', areas: ['project-charter'] },
  { stageKey: 'stage.open', hintKey: 'stageHint.open', areas: ['documentation'] },
  { stageKey: 'stage.clarify', hintKey: 'stageHint.clarify', areas: ['interfaces'] },
  { stageKey: 'stage.design', hintKey: 'stageHint.design', areas: ['coding-style', 'error-handling'] },
  { stageKey: 'stage.plan', hintKey: 'stageHint.plan', areas: ['branch-commit', 'logging'] },
  { stageKey: 'stage.verify', hintKey: 'stageHint.verify', areas: ['testing-discipline'] },
]

const PROJECT_CARD_IDS: readonly BafStandardCardId[] = ['workflow', 'route', 'openspec', 'guard']
const QUALITY_CARD_IDS: readonly BafStandardCardId[] = ['quality']
const STANDARD_CARD_IDS: readonly BafStandardCardId[] = ['standard']

/** Resolve a host area's id from its `titleKey` (`<NS>.area.<id>`). */
function areaIdOf(titleKey: string, fallbackId: string): string {
  const prefix = `${NS}.area.`
  return titleKey.startsWith(prefix) ? titleKey.slice(prefix.length) : fallbackId
}

/**
 * Slice one rule domain's rules out of the rules document.
 * @param content - the rules document text.
 * @param anchor - the area's heading anchor (its id).
 * @returns the trimmed section, or undefined when the heading is absent.
 */
export function sliceAreaContent(content: string, anchor: string): string | undefined {
  const lines = content.split('\n')
  const start = lines.findIndex(line => line.startsWith(`## ${anchor} `) || line.trim() === `## ${anchor}`)
  if (start === -1) return undefined
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith('## ') === true) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

const CARD_META: Record<BafStandardCardId, readonly [BafStandardKey, BafStandardKey, BafStandardKey]> = {
  workflow: ['cardTitleWorkflow', 'cardDescWorkflow', 'cardCommandWorkflow'],
  route: ['cardTitleRoute', 'cardDescRoute', 'cardCommandRoute'],
  openspec: ['cardTitleOpenspec', 'cardDescOpenspec', 'cardCommandOpenspec'],
  standard: ['cardTitleStandard', 'cardDescStandard', 'cardCommandStandard'],
  quality: ['cardTitleQuality', 'cardDescQuality', 'cardCommandQuality'],
  guard: ['cardTitleGuard', 'cardDescGuard', 'cardCommandGuard'],
}

const AVAILABILITY_TEXT: Record<string, BafStandardKey> = {
  ready: 'stateAvailabilityReady',
  policy_missing: 'stateAvailabilityMissing',
}

/** Shared inject + locale props for all standards panels. */
export type StandardsPanelProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

/** @deprecated Use StandardsEnterpriseOverview — kept for spec imports. */
export type StandardsOverviewProps = StandardsPanelProps

function FieldTable({ fields, t }: {
  fields: readonly BafStandardFieldRow[]
  t: PropsLocale<'baf.standard'>['t']
}) {
  return (
    <table className={css.fields}>
      <thead>
        <tr><th>{t('fieldLabel')}</th><th>{t('valueLabel')}</th></tr>
      </thead>
      <tbody>
        {fields.map(field => (
          <tr key={field.field} data-testid={`baf-standard-field-${field.field}`}>
            <td className={css.fieldPath}>{field.field}</td>
            <td className={field.state === 'tbd' ? css.valueTbd : css.value}>
              {field.field === 'standard.availability'
                ? t(AVAILABILITY_TEXT[field.value] ?? 'stateAvailabilityMissing')
                : field.value}
              {field.state === 'tbd' ? <span className={css.chipTbd}>{t('stateTbd')}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PanelHead({ titleKey, descKey, t }: {
  titleKey: BafStandardKey
  descKey: BafStandardKey
  t: StandardsPanelProps['t']
}) {
  return (
    <div className={css.head}>
      <div>
        <div className={css.title}>{t(titleKey)}</div>
        <div className={css.description}>{t(descKey)}</div>
      </div>
    </div>
  )
}

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

function PackageCard({ cardId, fields, t }: {
  cardId: BafStandardCardId
  fields: readonly BafStandardFieldRow[]
  t: StandardsPanelProps['t']
}) {
  const [titleKey, descKey, commandKey] = CARD_META[cardId]
  return (
    <div className={css.card} data-testid={`baf-standard-card-${cardId}`}>
      <div className={css.cardTitle}>{t(titleKey)}</div>
      <div className={css.cardDesc}>{t(descKey)}</div>
      <div className={css.cardCommand}>{t(commandKey)}</div>
      <FieldTable fields={fields} t={t} />
    </div>
  )
}

/**
 * 【变更】2026-10-19 (六问题批 4.1): the project path + config file are TWO
 * standalone config items at the top of the tab (no card chrome) — read-only
 * mono readouts in the 轨迹图's label-over-value row style, with NO copy/open
 * buttons: the value itself is the click target (folder reveal / default-app
 * open). The config-file row shows only the file NAME; its hover title keeps
 * the absolute path.
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

/** One read-only config row: small secondary label over a mono clickable value. */
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
      <span className={css.configLabel}>{label}</span>
      <button type="button" className={css.configValue} title={title} onClick={onClick}>
        {text}
      </button>
    </div>
  )
}

/** One editable AI 禁改路径 entry (per-row hook + one-edit-at-a-time state). */
function ProtectedPathRow({
  index, entry, cwd, editingValue, onEditChange, onCommitEdit, onCancelEdit, onBeginEdit, onRemove, onReveal, t,
}: {
  index: number
  entry: string
  cwd: string
  /** The in-flight edit's text (undefined ⇒ this row is not being edited). */
  editingValue: string | undefined
  onEditChange: (value: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onBeginEdit: () => void
  onRemove: () => void
  onReveal: () => void
  t: StandardsPanelProps['t']
}) {
  const { copied, onCopy } = useCopyFeedback(entry)
  return (
    <div className={css.protectedRow} data-testid={`baf-standard-protected-row-${String(index)}`}>
      {editingValue !== undefined ? (
        <InlineEditor
          value={editingValue}
          label={t('protectedEditLabel')}
          onChange={onEditChange}
          onSave={onCommitEdit}
          onCancel={onCancelEdit}
          className={css.protectedEditor ?? ''}
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
            <button type="button" className={css.miniButton} onClick={onCopy}>
              {copied ? t('copiedLabel') : t('copyLabel')}
            </button>
            <button type="button" className={css.miniButton} onClick={onReveal}>{t('openLabel')}</button>
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

  const commitEdit = (): void => {
    if (editing === null) return
    const entry = normalizeEntry(editing.value)
    if (entry === '') {
      setLocalMessage(t('protectedInvalidEntry'))
      return
    }
    if (draft.some((existing, index) => index !== editing.index && existing === entry)) {
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
      <div className={css.cardTitle}>{t('protectedTitle')}</div>
      <div className={css.cardDesc}>{t('protectedDesc')}</div>
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
              onCommitEdit={commitEdit}
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
      <div className={css.protectedFoot}>
        <button
          type="button"
          className={css.saveButton}
          data-testid="baf-standard-protected-save"
          disabled={state.protectedSaving || !dirty}
          onClick={() => { void saveProtectedPaths() }}
        >
          {state.protectedSaving ? t('protectedSaving') : t('protectedSave')}
        </button>
        <span
          className={css.hookLine}
          data-testid="baf-standard-protected-hook"
        >
          {summary.commitGuardHookInstalled === true ? t('protectedHookOn') : t('protectedHookOff')}
        </span>
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

/** 项目工程 tab — workspace path/config rows + plugin cards + node hooks. */
export function StandardsProjectOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { t } = props
  const {
    openPath, revealPath, updateProtectedDraft, saveProtectedPaths, pickDirectory,
    generateBaseline,
  } = props
  const cards = (summary?.cards ?? []).filter(card => PROJECT_CARD_IDS.includes(card.id))

  return (
    <section className={css.block} data-testid="baf-standard-project">
      {/* 【变更】2026-10-19 (六问题批 4.1): the panel head (title + description)
          is deleted — the tab label already says 项目工程; the no-baseline banner
          yields to the dedicated error + 生成配置文件 button below. */}
      <StatusSurface state={state} summary={summary} t={t} suppressNoBaseline />
      {/* The two standalone config items lead the tab in BOTH states (the
          server returns cwd/baselinePath even without a baseline): readonly
          mono readouts, click = reveal folder / open file, no buttons. */}
      <ProjectPathRows
        summary={summary}
        t={t}
        onReveal={(path) => { void revealPath(path) }}
        onOpen={(path) => { void openPath(path) }}
      />
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
        <div className={css.grid}>
          {/* 【变更】2026-10-12 (问题 4.3 客户确认): 基线档案头卡 — the repo-tied,
              git-managed anchor of every projection on this page: the baseline
              id and its bafCompatibility window. The project path / config
              file rows moved OUT to the tab top (2026-10-19 六问题批 4.1). */}
          <div className={css.card} data-testid="baf-standard-card-baseline">
            <div className={css.cardTitle}>{t('cardTitleBaseline')}</div>
            <div className={css.cardDesc}>{t('cardDescBaseline')}</div>
            <FieldTable
              fields={[
                { field: t('baselineLabel'), value: summary.baselineId ?? '—', state: 'ok' },
                {
                  field: t('compatLabel'),
                  value: summary.compatibility === undefined
                    ? '—'
                    : `${summary.compatibility.min} ~ ${summary.compatibility.max}`,
                  state: 'ok',
                },
              ]}
              t={t}
            />
          </div>
          {cards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
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
            t={t}
            updateHooksDraft={props.updateHooksDraft}
            saveNodeHooks={props.saveNodeHooks}
          />
          <div className={css.card} data-testid="baf-standard-card-scaffold">
            <div className={css.cardTitle}>{t('cardTitleScaffold')}</div>
            <div className={css.cardDesc}>{t('cardDescScaffold')}</div>
            <div className={css.cardCommand}>{t('cardCommandScaffold')}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** 质量监控 tab — product-fixed gate mechanism + the baseline's stack card. */
export function StandardsQualityOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { t } = props
  const cards = (summary?.cards ?? []).filter(card => QUALITY_CARD_IDS.includes(card.id))

  return (
    <section className={css.blockQuality} data-testid="baf-standard-quality">
      <PanelHead titleKey="panelQualityTitle" descKey="panelQualityDescription" t={t} />
      <StatusSurface state={state} summary={summary} t={t} />
      {/* 【变更】2026-10-13 (问题 4 批, 客户决策): the gate MECHANISM is product
          knowledge and always shows — the per-project card below it (commands,
          coverage floor, analyzers) is the baseline's stack section, i.e. the
          same git-managed project config 项目工程 projects; without a baseline
          there is nothing real to show and the banner above explains why. */}
      <div className={css.mechanismCard} data-testid="baf-standard-quality-mechanism">
        <div className={css.cardTitle}>{t('qualityMechanismTitle')}</div>
        <div className={css.cardDesc}>{t('qualityMechanismBody')}</div>
      </div>
      {summary?.status === 'ready' ? (
        <div className={css.qualityGrid}>
          {cards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AreaRow({ id, state, loadRules, toggleArea, t }: {
  id: string
  state: StandardsOverviewState
  loadRules: () => Promise<void>
  toggleArea: (id: string) => void
  t: StandardsPanelProps['t']
}) {
  const meta = AREA_META[id]
  const expanded = state.areasExpanded[id] === true
  const content = state.rules?.status === 'ready' && state.rules.content !== undefined
    ? sliceAreaContent(state.rules.content, id)
    : undefined
  return (
    <div className={css.areaRow} data-testid={`baf-standard-area-${id}`}>
      <button
        type="button"
        className={css.areaHead}
        data-testid={`baf-standard-area-toggle-${id}`}
        onClick={() => {
          if (state.rules === undefined) void loadRules()
          toggleArea(id)
        }}
      >
        <span className={css.areaTitle}>{meta === undefined ? id : t(meta[0])}</span>
        <span className={css.areaDesc}>{meta === undefined ? '' : t(meta[1])}</span>
        <span className={css.areaToggle}>{expanded ? t('areaCollapse') : t('areaExpand')}</span>
      </button>
      {expanded ? (
        state.rules === undefined ? (
          <div className={css.status}>{t('statusLoading')}</div>
        ) : state.rules.status === 'ready' ? (
          content !== undefined ? (
            <pre className={css.areaBody} data-testid={`baf-standard-area-body-${id}`}>{content}</pre>
          ) : (
            <div className={css.status} data-testid={`baf-standard-area-missing-${id}`}>{t('areaNoContent')}</div>
          )
        ) : (
          // 【变更】2026-10-13 (问题 4 批): the rules document needs the baseline
          // to locate it — the 8-domain STRUCTURE is a product constant, only
          // the content degrades with a pointer at /baf-scaffold.
          <div className={css.status} data-testid={`baf-standard-area-needs-${id}`}>{t('areaNeedsBaseline')}</div>
        )
      ) : null}
    </div>
  )
}

/** 企业规范 tab — rules grouped by workflow stage + optional full document. */
export function StandardsEnterpriseOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { loadRules, toggleRules, toggleArea, t } = props
  const standardCards = (summary?.cards ?? []).filter(card => STANDARD_CARD_IDS.includes(card.id))
  const areaById = new Map(
    (summary?.standardAreas ?? []).map(area => [areaIdOf(area.titleKey, area.id), area]),
  )

  const enterprise = summary?.enterpriseStandards

  return (
    <section className={css.block} data-testid="baf-standard-overview">
      {/* 【变更】2026-10-19 (六问题批 4.3): the tab-head title + description and
          the no-baseline banner are gone — the tab label already says 企业规范,
          and the 8-domain structure (a product constant) renders regardless of
          baseline state, degrading per-area instead of explaining itself. */}
      <StatusSurface state={state} summary={summary} t={t} suppressNoBaseline />
      {enterprise !== undefined ? (
        <div className={css.card} data-testid="baf-enterprise-packs">
          <div className={css.cardTitle}>{t('enterprisePacksTitle')}</div>
          <div className={css.cardDesc}>{t('enterprisePacksDesc')}</div>
          <div className={css.cardCommand}>{t('enterpriseCommandHint')}</div>
          <FieldTable
            fields={[
              {
                field: t('enterprisePacksApplied'),
                value: enterprise.appliedPacks.length === 0
                  ? t('enterprisePacksNone')
                  : enterprise.appliedPacks.join(', '),
                state: 'ok',
              },
              {
                field: t('enterpriseBlockersLabel'),
                value: enterprise.blockerErrors === 0 && enterprise.blockerWarnings === 0
                  ? t('enterpriseBlockersClear')
                  : `error ${String(enterprise.blockerErrors)} · warning ${String(enterprise.blockerWarnings)}`
                    + (enterprise.blockerLines.length > 0
                      ? ` — ${enterprise.blockerLines.slice(0, 3).join('; ')}`
                      : ''),
                state: enterprise.blockerErrors > 0 ? 'tbd' : 'ok',
              },
            ]}
            t={t}
          />
        </div>
      ) : null}
      {summary?.status === 'ready' && standardCards.length > 0 ? (
        <div className={css.grid}>
          {standardCards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
        </div>
      ) : null}

      {/* 【变更】2026-10-13 (问题 4 批, 客户决策): the 8-domain structure and
          stage grouping are PRODUCT CONSTANTS — they always render. Only the
          rules-document CONTENT needs the baseline (to locate the file), and
          the per-area body degrades with a /baf-scaffold pointer when the
          rules fetch answers unavailable. */}
      <div className={css.rules} data-testid="baf-standard-areas">
        <div className={css.rulesHead}>
          <div>
            <div className={css.cardTitle}>{t('areasTitle')}</div>
            <div className={css.cardDesc}>{t('areasHint')}</div>
          </div>
        </div>
        <div className={css.stageList}>
          {STAGE_AREA_GROUPS.map((group) => {
            // The server list wins when present; without a baseline the static
            // catalog ids render directly (same ids, same anchors).
            const areas = group.areas.map(id => areaById.get(id) ?? { id, titleKey: `${NS}.area.${id}`, sourceRef: '' })
            return (
              <section key={group.stageKey} className={css.stageGroup} data-testid={`baf-standard-stage-${group.stageKey}`}>
                <div className={css.stageTitle}>{t(group.stageKey)}</div>
                <div className={css.stageHint}>{t(group.hintKey)}</div>
                <div className={css.areaList}>
                  {areas.map((area) => {
                    const id = areaIdOf(area.titleKey, area.id)
                    return (
                      <AreaRow
                        key={id}
                        id={id}
                        state={state}
                        loadRules={loadRules}
                        toggleArea={toggleArea}
                        t={t}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        <div className={css.fromLiving}>{t('fromLiving')}</div>
      </div>

      <div className={css.rules} data-testid="baf-standard-rules">
        <div className={css.rulesHead}>
          <div>
            <div className={css.cardTitle}>{t('rulesTitle')}</div>
            <div className={css.cardDesc}>{t('rulesHint')}</div>
          </div>
          <button
            type="button"
            className={css.refresh}
            data-testid="baf-standard-rules-toggle"
            onClick={() => { toggleRules() }}
          >
            {state.rulesExpanded ? t('rulesCollapse') : t('rulesExpand')}
          </button>
        </div>
        {state.rulesExpanded ? (
          state.rules === undefined
            ? <div className={css.status}>{t('statusLoading')}</div>
            : state.rules.status === 'ready'
              ? (
                <pre className={css.rulesBody} data-testid="baf-standard-rules-body">{state.rules.content}</pre>
              )
              : state.rules.status === 'unreadable'
                ? <div className={css.statusError}>{t('rulesUnreadable')}{state.rules.reason}</div>
                : (
                  <div className={css.status} data-testid="baf-standard-rules-unavailable">
                    {summary?.status === 'ready' && summary.standardAvailability === 'policy_missing'
                      ? t('rulesUnavailablePolicy')
                      : summary?.status === 'no-baseline'
                        ? t('rulesUnavailableNoBaseline')
                        : t('rulesUnavailableNoWorkspace')}
                  </div>
                )
        ) : null}
      </div>
    </section>
  )
}

/** @deprecated Alias for StandardsEnterpriseOverview. */
export const StandardsOverview = StandardsEnterpriseOverview
