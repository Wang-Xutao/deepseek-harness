/**
 * 【变更】2026-10-19 (流程图样式对齐批): the 状态脚本 graph adopts the
 * 多模型路由 canvas style — a framed split layout: LEFT the 8-node main
 * chain as absolute route-parity node cards (192×56, tier-tinted gradient,
 * hover lift, SVG bezier edges with arrowheads) whose accent line counts the
 * node's scripts (进 n · 出 m, or 未配置); RIGHT the editor for the SELECTED
 * node (click a canvas card to switch — 进入状态 / 退出状态 lists, add /
 * edit / delete, keyed so a switch resets the in-flight input). Draft
 * locally like the 受保护路径 card; one save persists the whole map
 * through the Remote's surgical baseline write.
 *
 * 【变更】2026-10-20 (批次三 4.4): the .baf/baseline.yml 说明 is deleted; a
 * hover Tooltip on every canvas card lists its script paths; entries are
 * clickable (default-app open, hover title = absolute path); the add row
 * gains a folder picker that pre-fills the relative folder, and every add is
 * existence-checked through the Remote (不存在不允许添加); the footer gains a
 * 取消 that drops the draft back to the persisted map.
 *
 * drift is deliberately absent: the engine never fires hooks on the drift
 * parking lot (planNodeHooks is main-chain only), so listing it here would be
 * config the product silently ignores.
 *
 * 【变更】2026-10-20 (批次四 3.4/3.6): save/cancel move to the card-title row's
 * end; every canvas card carries zh + English names; and the add row's
 * 选择脚本文件 opens the OS FILE picker (desktop: the preload bridge resolves
 * the File to an absolute path → workspace-relative prefill; web: the bare
 * file NAME prefills).
 *
 * 【变更】2026-10-20 (批次五 1.3/1.4): the two kind rows get SEPARATE add
 * inputs (a picked/typed path lands only in the row whose button was
 * clicked); the desktop picker becomes a native dialog whose defaultPath is
 * the WORKSPACE root (the hidden <input type="file"> stays as the plain-web
 * fallback); the canvas drops the configured-green node/edge tint for the
 * 确认门 main-chain blue; and a card with NO scripts carries no hover
 * Tooltip (nothing to detail — configured cards keep theirs).
 */
import { Fragment, useRef, useState, type ChangeEvent } from 'react'
import { InlineEditor, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BafStandardNodeHooks, BafStandardNodeHookLists, BafStandardSummaryResult } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { BafStandardKey } from './locales.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { joinEntry, toRelativeEntry } from './StandardsOverview.tsx'
import css from './StandardsOverview.module.css'

/** Main-chain order the engine enforces (WORKFLOW_NODES minus drift). */
const NODES: readonly ('intake' | 'open' | 'clarify' | 'design' | 'plan' | 'implement' | 'verify' | 'archive')[] = [
  'intake',
  'open',
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
]

/** Canvas geometry — the 确认门 node card box and row pitch (48px: the card
 * stacks two lines — 「中文 En」 one name line + accent, 批次六 2). */
const NODE_W = 192
const NODE_H = 48
const NODE_GAP = 16
const NODE_X = 16
const CANVAS_TOP = 16
const CANVAS_W = NODE_X + NODE_W + NODE_X
const CANVAS_H = NODES.length * NODE_H + (NODES.length - 1) * NODE_GAP + CANVAS_TOP * 2

/** Locale key per node (`hooksNode.<node>`), typed against the dictionary. */
const NODE_LABEL_KEYS: Record<(typeof NODES)[number], BafStandardKey> = {
  intake: 'hooksNodeIntake',
  open: 'hooksNodeOpen',
  clarify: 'hooksNodeClarify',
  design: 'hooksNodeDesign',
  plan: 'hooksNodePlan',
  implement: 'hooksNodeImplement',
  verify: 'hooksNodeVerify',
  archive: 'hooksNodeArchive',
}

const KIND_LABEL_KEYS: Record<'enter' | 'exit', BafStandardKey> = {
  enter: 'hooksEnterLabel',
  exit: 'hooksExitLabel',
}

/** 【变更】2026-10-20 (批次四 3.6 → 批次六 2): every canvas card carries both
 * languages on ONE line — 中文 first, the English name rides inline after it. */
const NODE_EN: Record<(typeof NODES)[number], string> = {
  intake: 'Intake',
  open: 'Open change',
  clarify: 'Clarify',
  design: 'Design',
  plan: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  archive: 'Archive',
}

/**
 * 【变更】2026-10-20 (批次四 3.6 → 批次五 1.3): the desktop preload bridge.
 * `pickFile(defaultPath)` (批次五) opens the NATIVE Electron file dialog with
 * the workspace root as its default directory and answers the picked
 * ABSOLUTE path; `pathFor` remains for the plain-web `<input type="file">`
 * fallback (Electron webUtils turns its File into an absolute path — plain
 * web has no equivalent, so that picker falls back to the file NAME).
 */
type FilePickerBridge = {
  pathFor: (file: File) => string
  pickFile?: (defaultPath: string) => Promise<string | null>
}
const filePickerBridge = (): FilePickerBridge | undefined =>
  (globalThis as { __BAF_FILE_PICKER__?: FilePickerBridge }).__BAF_FILE_PICKER__

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** Normalize one entry the way the server-side rewrite will (cosmetic — the
 * authoritative validation lives in `validateNodeHooks`). */
function normalizeEntry(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
}

/**
 * 【变更】2026-10-20 (批次三 4.4): a canvas card's hover Tooltip text — the
 * node's configured script paths per kind (未配置脚本 when bare), the same
 * string the editor would print for the selected node.
 */
function nodePathsText(label: string, lists: BafStandardNodeHookLists | undefined, t: StandardsPanelProps['t']): string {
  const lines = [label]
  for (const kind of ['enter', 'exit'] as const) {
    const entries = kind === 'enter' ? lists?.enter ?? [] : lists?.exit ?? []
    lines.push(`${t(KIND_LABEL_KEYS[kind])}: ${entries.length > 0 ? entries.join(', ') : t('hooksEmpty')}`)
  }
  return lines.join('\n')
}

/** Which list a (node, kind) edit targets. */
interface EditTarget {
  readonly node: (typeof NODES)[number]
  readonly kind: 'enter' | 'exit'
  readonly index: number
  readonly value: string
}

/** One script entry row: clickable mono path (default-app open) + edit/delete
 * (an InlineEditor while editing). */
function HookEntryRow({ entry, cwd, editingValue, onEditChange, onCommitEdit, onCancelEdit, onBeginEdit, onRemove, onOpen, t }: {
  entry: string
  cwd: string
  editingValue: string | undefined
  onEditChange: (value: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onBeginEdit: () => void
  onRemove: () => void
  onOpen: () => void
  t: StandardsPanelProps['t']
}) {
  if (editingValue !== undefined) {
    return (
      <InlineEditor
        value={editingValue}
        label={t('hooksEditLabel')}
        onChange={onEditChange}
        onSave={onCommitEdit}
        onCancel={onCancelEdit}
        className={css.protectedEditor ?? ''}
      />
    )
  }
  return (
    <div className={css.hooksEntryRow}>
      <button
        type="button"
        className={css.hooksEntryButton}
        title={joinEntry(cwd, entry)}
        onClick={onOpen}
      >
        {entry}
      </button>
      <span className={css.pathActions}>
        <button type="button" className={css.miniButton} onClick={onBeginEdit}>{t('editLabel')}</button>
        <button type="button" className={css.miniButton} onClick={onRemove}>{t('deleteLabel')}</button>
      </span>
    </div>
  )
}

/**
 * The editor for the SELECTED node — its 进入状态 / 退出状态 lists with
 * add / edit / delete. Keyed by node in the parent, so switching the canvas
 * selection resets the in-flight input and message.
 */
function HookNodeEditor({ node, lists, editing, setEditing, draft, updateDraft, cwd, statWorkspacePath, onPreviewFile, t }: {
  node: (typeof NODES)[number]
  lists: BafStandardNodeHookLists
  editing: EditTarget | null
  setEditing: (target: EditTarget | null) => void
  draft: BafStandardNodeHooks
  updateDraft: (hooks: BafStandardNodeHooks) => void
  cwd: string
  /** 【变更】2026-10-22 (批次十五 2): entries preview (rel) — no direct open. */
  onPreviewFile: (rel: string) => void
  statWorkspacePath: StandardsOverviewFace['statWorkspacePath']
  t: StandardsPanelProps['t']
}) {
  // 【变更】2026-10-20 (批次五 1.3): SEPARATE add inputs per kind — a picked
  // or typed path pre-fills ONLY the row whose 选择脚本文件/添加 was used (the
  // old single shared input mirrored one path into BOTH rows).
  const [inputs, setInputs] = useState<Record<'enter' | 'exit', string>>({ enter: '', exit: '' })
  const [localMessage, setLocalMessage] = useState<string | undefined>(undefined)
  // The hidden file input is still shared (one element), so the kind whose
  // button clicked it is remembered here to route the answer back.
  const pickKind = useRef<'enter' | 'exit'>('enter')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const setKindInput = (kind: 'enter' | 'exit', value: string): void => {
    setInputs(previous => ({ ...previous, [kind]: value }))
  }

  const addEntry = (kind: 'enter' | 'exit', raw: string): void => {
    const entry = normalizeEntry(raw)
    if (entry === '') return
    const existing = kind === 'enter' ? lists.enter ?? [] : lists.exit ?? []
    if (existing.includes(entry)) {
      setLocalMessage(t('protectedDuplicate'))
      return
    }
    // 【变更】2026-10-20 (批次三 4.4): add-time existence check — the Remote
    // stats the workspace-relative entry; a miss never lands in the draft.
    void statWorkspacePath(entry).then((exists) => {
      if (!exists) {
        setLocalMessage(t('hooksPathMissing'))
        return
      }
      const next: BafStandardNodeHookLists = kind === 'enter'
        ? { ...lists, enter: [...existing, entry] }
        : { ...lists, exit: [...existing, entry] }
      updateDraft({ ...draft, [node]: next })
      setKindInput(kind, '')
      setLocalMessage(undefined)
    })
  }

  /**
   * 【变更】2026-10-20 (批次五 1.3): the 选择脚本文件 click — on desktop the
   * native dialog opens WITH THE WORKSPACE ROOT as its default directory
   * (`pickFile`), and its absolute answer folds into THIS kind's input; plain
   * web (no `pickFile`) falls back to the hidden `<input type="file">`.
   */
  const onPickFile = (kind: 'enter' | 'exit'): void => {
    setLocalMessage(undefined)
    const bridge = filePickerBridge()
    if (bridge?.pickFile !== undefined) {
      void bridge.pickFile(cwd).then((picked) => {
        if (picked === null) return
        const entry = toRelativeEntry(cwd, picked)
        if (entry === undefined) {
          setLocalMessage(t('protectedPickOutside'))
          return
        }
        setKindInput(kind, entry)
      })
      return
    }
    pickKind.current = kind
    fileRef.current?.click()
  }

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    // Reset so picking the SAME file twice still fires onChange.
    event.currentTarget.value = ''
    if (file === undefined) return
    const kind = pickKind.current
    const bridge = filePickerBridge()
    if (bridge === undefined) {
      setKindInput(kind, file.name)
      return
    }
    const entry = toRelativeEntry(cwd, bridge.pathFor(file))
    if (entry === undefined) {
      setLocalMessage(t('protectedPickOutside'))
      return
    }
    setKindInput(kind, entry)
  }

  const commitEdit = (): void => {
    if (editing === null) return
    const entry = normalizeEntry(editing.value)
    if (entry === '') {
      setLocalMessage(t('protectedInvalidEntry'))
      return
    }
    const list = editing.kind === 'enter' ? lists.enter ?? [] : lists.exit ?? []
    if (list.some((existing, index) => index !== editing.index && existing === entry)) {
      setLocalMessage(t('protectedDuplicate'))
      return
    }
    const nextList = list.map((existing, index) => (index === editing.index ? entry : existing))
    const next: BafStandardNodeHookLists = editing.kind === 'enter'
      ? { ...lists, enter: nextList }
      : { ...lists, exit: nextList }
    updateDraft({ ...draft, [editing.node]: next })
    setEditing(null)
    setLocalMessage(undefined)
  }

  return (
    <div className={css.hooksEditorBody}>
      <div className={css.hooksNodeHead}>
        <span className={css.hooksNodeLabel}>{t(NODE_LABEL_KEYS[node])}</span>
        <span className={css.hooksNodeId}>{node}</span>
      </div>
      <div className={css.hooksLists}>
        {(['enter', 'exit'] as const).map((kind) => {
          const entries = kind === 'enter' ? lists.enter ?? [] : lists.exit ?? []
          return (
            <div key={kind} className={css.hooksKindRow}>
              <span className={css.hooksKind}>{t(KIND_LABEL_KEYS[kind])}</span>
              <div className={css.hooksEntries}>
                {entries.length === 0 ? (
                  <span className={css.hooksEmpty}>{t('hooksEmpty')}</span>
                ) : entries.map((entry, index) => (
                  <HookEntryRow
                    key={`${node}-${kind}-${String(index)}-${entry}`}
                    entry={entry}
                    cwd={cwd}
                    editingValue={editing !== null
                      && editing.node === node
                      && editing.kind === kind
                      && editing.index === index
                      ? editing.value
                      : undefined}
                    onEditChange={(value) => { setEditing({ node, kind, index, value }) }}
                    onCommitEdit={commitEdit}
                    onCancelEdit={() => { setEditing(null) }}
                    onBeginEdit={() => { setEditing({ node, kind, index, value: entry }) }}
                    onOpen={() => { onPreviewFile(entry) }}
                    onRemove={() => {
                      setEditing(null)
                      const nextList = entries.filter((_, index2) => index2 !== index)
                      const otherList = kind === 'enter' ? lists.exit ?? [] : lists.enter ?? []
                      // An emptied list drops its KEY (not an empty array —
                      // that would linger as phantom dirty state against the
                      // normalized persisted projection); the node survives
                      // while the other kind still has entries.
                      const nextLists: BafStandardNodeHookLists = kind === 'enter'
                        ? {
                          ...(nextList.length === 0 ? {} : { enter: nextList }),
                          ...(otherList.length === 0 ? {} : { exit: otherList }),
                        }
                        : {
                          ...(otherList.length === 0 ? {} : { enter: otherList }),
                          ...(nextList.length === 0 ? {} : { exit: nextList }),
                        }
                      // Computed-key destructure omits the node without a
                      // dynamic `delete` (no-dynamic-delete).
                      const { [node]: _removed, ...rest } = draft
                      updateDraft(
                        nextList.length === 0 && otherList.length === 0
                          ? rest
                          : { ...rest, [node]: nextLists },
                      )
                    }}
                    t={t}
                  />
                ))}
              </div>
              <div className={css.addRow}>
                <input
                  type="text"
                  className={css.addInput}
                  aria-label={t('hooksAddPlaceholder')}
                  placeholder={t('hooksAddPlaceholder')}
                  value={inputs[kind]}
                  onChange={(event) => { setKindInput(kind, event.currentTarget.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addEntry(kind, inputs[kind])
                    }
                  }}
                />
                <button
                  type="button"
                  className={css.miniButton}
                  data-testid={`baf-standard-hooks-add-${node}-${kind}`}
                  onClick={() => { addEntry(kind, inputs[kind]) }}
                >
                  {t('hooksAdd')}
                </button>
                <button
                  type="button"
                  className={css.miniButton}
                  data-testid={`baf-standard-hooks-pick-${node}-${kind}`}
                  onClick={() => { onPickFile(kind) }}
                >
                  {t('hooksPick')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {localMessage !== undefined ? <div className={css.statusError}>{localMessage}</div> : null}
      {/* The plain-web OS file chooser (display:none, rendered LAST so the two
          add inputs stay the editor's first two inputs) — both 选择脚本文件
          buttons programmatic-click it; the answer routes back to the row that
          clicked (pickKind), pre-filling ONLY that row's add input. Desktop
          (pickFile) never touches this element. */}
      <input
        ref={fileRef}
        type="file"
        className={css.hiddenFileInput}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFileChosen}
      />
    </div>
  )
}

/** The 状态脚本 card itself — rendered inside the 项目工程 ready branch.
 * 【变更】2026-10-22 (批次十五 2): entry clicks PREVIEW the script file (the
 * tab's hoisted AssetModal with 打开 + 打开文件夹) instead of launching the
 * default app directly. */
export function NodeHooksCard({ state, summary, t, onPreviewFile, statWorkspacePath, updateHooksDraft, saveNodeHooks }: {
  state: StandardsOverviewState
  summary: BafStandardSummaryResult
  t: StandardsPanelProps['t']
  /** Open the workspace-relative script in the tab's preview modal. */
  onPreviewFile: (rel: string) => void
  statWorkspacePath: StandardsOverviewFace['statWorkspacePath']
  updateHooksDraft: StandardsOverviewFace['updateHooksDraft']
  saveNodeHooks: StandardsOverviewFace['saveNodeHooks']
}) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  // null = nothing picked yet: the effective selection follows the first
  // node that has scripts (intake when none does) until the user clicks.
  const [picked, setPicked] = useState<(typeof NODES)[number] | null>(null)
  const draft = state.hooksDraft ?? {}
  const persisted = state.summary?.nodeHooks ?? {}
  const cwd = summary.cwd ?? ''
  const draftCount = Object.values(draft)
    .reduce((sum, lists) => sum + (lists.enter?.length ?? 0) + (lists.exit?.length ?? 0), 0)
  const persistedCount = Object.values(persisted)
    .reduce((sum, lists) => sum + (lists.enter?.length ?? 0) + (lists.exit?.length ?? 0), 0)
  const dirty = draftCount !== persistedCount || JSON.stringify(draft) !== JSON.stringify(persisted)

  const firstSet = NODES.find((node) => {
    const lists = draft[node]
    return lists !== undefined && ((lists.enter?.length ?? 0) + (lists.exit?.length ?? 0)) > 0
  })
  const selected = picked ?? firstSet ?? 'intake'

  /** The canvas node's accent line: 进 n · 出 m, or 未配置 when bare. */
  const accentOf = (node: (typeof NODES)[number]): { text: string; set: boolean } => {
    const lists = draft[node]
    const enter = lists?.enter?.length ?? 0
    const exit = lists?.exit?.length ?? 0
    if (enter === 0 && exit === 0) return { text: t('hooksEmptyShort'), set: false }
    return { text: `${t('hooksEnterShort')} ${String(enter)} · ${t('hooksExitShort')} ${String(exit)}`, set: true }
  }

  return (
    <div className={css.card} data-testid="baf-standard-hooks-card">
      {/* 【变更】2026-10-20 (批次四 3.4): save/cancel at the title row's end
          (取消 quiet / 保存 brand-filled), same anatomy as 受保护路径. */}
      <div className={css.cardTitleRow}>
        <span className={css.cardTitle}>{t('hooksTitle')}</span>
        <span className={css.titleActions}>
          <button
            type="button"
            className={css.titleCancel}
            data-testid="baf-standard-hooks-cancel"
            disabled={state.hooksSaving || !dirty}
            onClick={() => {
              setEditing(null)
              updateHooksDraft(persisted)
            }}
          >
            {t('hooksCancel')}
          </button>
          <button
            type="button"
            className={css.titleSave}
            data-testid="baf-standard-hooks-save"
            disabled={state.hooksSaving || !dirty}
            onClick={() => { void saveNodeHooks() }}
          >
            {state.hooksSaving ? t('hooksSaving') : t('hooksSave')}
          </button>
        </span>
      </div>
      <div className={css.hooksFlowWrap}>
        {/* 【变更】2026-10-22 (批次十四 2): the legend row (已配置脚本 / 未配置
            脚本) is DELETED — the canvas cards state it themselves, no legend. */}
        <div className={css.hooksSplit}>
          <div
            className={css.hooksFlowCanvas}
            role="group"
            aria-label={t('hooksFlowAria')}
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            <svg className={css.hooksEdges} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
              <defs>
                <marker
                  id="baf-standard-hooks-arrow"
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
                // The 确认门 same-column vertical bezier, bottom-center →
                // top-center, with the arrowhead landing on the next card.
                // 【变更】2026-10-20 (批次五 1.4): every edge stays the same
                // quiet gray — the 确认门 canvas has no lit-edge variant.
                const x = NODE_X + NODE_W / 2
                const y1 = CANVAS_TOP + index * (NODE_H + NODE_GAP) + NODE_H
                const y2 = CANVAS_TOP + (index + 1) * (NODE_H + NODE_GAP)
                const mid = (y1 + y2) / 2
                return (
                  <path
                    key={node}
                    d={`M ${x} ${y1} C ${x} ${mid}, ${x} ${mid}, ${x} ${y2}`}
                    markerEnd="url(#baf-standard-hooks-arrow)"
                    className={css.hooksEdge}
                  />
                )
              })}
            </svg>
            {NODES.map((node, index) => {
              const accent = accentOf(node)
              const label = t(NODE_LABEL_KEYS[node])
              const card = (
                <button
                  type="button"
                  className={join(
                    css.hooksNode,
                    css.hooksNodeMain,
                    node === selected ? css.hooksNodeSelected : undefined,
                  )}
                  data-testid={`baf-standard-hooks-node-${node}`}
                  aria-pressed={node === selected}
                  aria-label={`${label} · ${accent.text}`}
                  style={{
                    left: NODE_X,
                    top: CANVAS_TOP + index * (NODE_H + NODE_GAP),
                    width: NODE_W,
                    height: NODE_H,
                  }}
                  onClick={() => {
                    setPicked(node)
                    setEditing(null)
                  }}
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
              // 【变更】2026-10-20 (批次五 1.4): a card with NO scripts carries
              // no hover Tooltip (未配置 has nothing to detail); configured
              // cards keep theirs.
              return accent.set ? (
                <Tooltip
                  key={node}
                  label={nodePathsText(label, draft[node], t)}
                  side="right"
                  portal
                  maxWidth={360}
                  delayMs={120}
                >
                  {card}
                </Tooltip>
              ) : (
                <Fragment key={node}>{card}</Fragment>
              )
            })}
          </div>
          <div className={css.hooksEditor} data-testid="baf-standard-hooks-editor" data-node={selected}>
            <HookNodeEditor
              key={selected}
              node={selected}
              lists={draft[selected] ?? {}}
              editing={editing}
              setEditing={setEditing}
              draft={draft}
              updateDraft={updateHooksDraft}
              cwd={cwd}
              statWorkspacePath={statWorkspacePath}
              onPreviewFile={onPreviewFile}
              t={t}
            />
          </div>
        </div>
      </div>
      {state.hooksNotice !== undefined ? (
        <div className={css.statusError} data-testid="baf-standard-hooks-notice">
          {state.hooksNotice}
        </div>
      ) : null}
    </div>
  )
}
