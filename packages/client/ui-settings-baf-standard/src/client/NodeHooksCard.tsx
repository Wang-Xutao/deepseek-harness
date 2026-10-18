/**
 * 【变更】2026-10-19 (六问题批 4.1b): the 状态脚本 card — a vertical main-chain
 * workflow graph (接单 → 建立变更 → 澄清 → 设计 → 计划 → 实现 → 验证 → 归档)
 * where every node carries two editable script lists: 进入状态 (enter — must
 * pass before the state is entered) and 退出状态 (exit — must pass before the
 * state may advance forward). Draft locally like the AI 禁改路径 card; one
 * save persists the whole map through the Remote's surgical baseline write.
 *
 * drift is deliberately absent: the engine never fires hooks on the drift
 * parking lot (planNodeHooks is main-chain only), so listing it here would be
 * config the product silently ignores.
 */
import { useState } from 'react'
import { InlineEditor } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BafStandardNodeHooks, BafStandardNodeHookLists } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { BafStandardKey } from './locales.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
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

/** Normalize one entry the way the server-side rewrite will (cosmetic — the
 * authoritative validation lives in `validateNodeHooks`). */
function normalizeEntry(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
}

/** Which list a (node, kind) edit targets. */
interface EditTarget {
  readonly node: (typeof NODES)[number]
  readonly kind: 'enter' | 'exit'
  readonly index: number
  readonly value: string
}

/** One script entry row: mono path + edit/delete (an InlineEditor while editing). */
function HookEntryRow({ entry, editingValue, onEditChange, onCommitEdit, onCancelEdit, onBeginEdit, onRemove, t }: {
  entry: string
  editingValue: string | undefined
  onEditChange: (value: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onBeginEdit: () => void
  onRemove: () => void
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
      <span className={css.hooksEntryPath}>{entry}</span>
      <span className={css.pathActions}>
        <button type="button" className={css.miniButton} onClick={onBeginEdit}>{t('editLabel')}</button>
        <button type="button" className={css.miniButton} onClick={onRemove}>{t('deleteLabel')}</button>
      </span>
    </div>
  )
}

/** One node row: label + id over the enter/exit kind rows. */
function HookNodeRow({ node, lists, editing, setEditing, draft, updateDraft, t }: {
  node: (typeof NODES)[number]
  lists: BafStandardNodeHookLists
  editing: EditTarget | null
  setEditing: (target: EditTarget | null) => void
  draft: BafStandardNodeHooks
  updateDraft: (hooks: BafStandardNodeHooks) => void
  t: StandardsPanelProps['t']
}) {
  const [input, setInput] = useState('')
  const [localMessage, setLocalMessage] = useState<string | undefined>(undefined)

  const addEntry = (kind: 'enter' | 'exit', raw: string): void => {
    const entry = normalizeEntry(raw)
    if (entry === '') return
    const existing = kind === 'enter' ? lists.enter ?? [] : lists.exit ?? []
    if (existing.includes(entry)) {
      setLocalMessage(t('protectedDuplicate'))
      return
    }
    const next: BafStandardNodeHookLists = kind === 'enter'
      ? { ...lists, enter: [...existing, entry] }
      : { ...lists, exit: [...existing, entry] }
    updateDraft({ ...draft, [node]: next })
    setInput('')
    setLocalMessage(undefined)
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
    updateDraft({ ...draft, [node]: next })
    setEditing(null)
    setLocalMessage(undefined)
  }

  return (
    <div className={css.hooksNodeRow} data-testid={`baf-standard-hooks-node-${node}`}>
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
                  value={input}
                  onChange={(event) => { setInput(event.currentTarget.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addEntry(kind, input)
                    }
                  }}
                />
                <button
                  type="button"
                  className={css.miniButton}
                  data-testid={`baf-standard-hooks-add-${node}-${kind}`}
                  onClick={() => { addEntry(kind, input) }}
                >
                  {t('hooksAdd')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {localMessage !== undefined ? <div className={css.statusError}>{localMessage}</div> : null}
    </div>
  )
}

/** The 状态脚本 card itself — rendered inside the 项目工程 ready branch. */
export function NodeHooksCard({ state, t, updateHooksDraft, saveNodeHooks }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  updateHooksDraft: StandardsOverviewFace['updateHooksDraft']
  saveNodeHooks: StandardsOverviewFace['saveNodeHooks']
}) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const draft = state.hooksDraft ?? {}
  const persisted = state.summary?.nodeHooks ?? {}
  const draftCount = Object.values(draft)
    .reduce((sum, lists) => sum + (lists.enter?.length ?? 0) + (lists.exit?.length ?? 0), 0)
  const persistedCount = Object.values(persisted)
    .reduce((sum, lists) => sum + (lists.enter?.length ?? 0) + (lists.exit?.length ?? 0), 0)
  const dirty = draftCount !== persistedCount || JSON.stringify(draft) !== JSON.stringify(persisted)

  return (
    <div className={css.card} data-testid="baf-standard-hooks-card">
      <div className={css.cardTitle}>{t('hooksTitle')}</div>
      <div className={css.cardDesc}>{t('hooksDesc')}</div>
      <div className={css.hooksGraph}>
        {NODES.map((node, index) => (
          <div key={node}>
            {index > 0 ? <div className={css.hooksConnector} /> : null}
            <HookNodeRow
              node={node}
              lists={draft[node] ?? {}}
              editing={editing}
              setEditing={setEditing}
              draft={draft}
              updateDraft={updateHooksDraft}
              t={t}
            />
          </div>
        ))}
      </div>
      <div className={css.protectedFoot}>
        <button
          type="button"
          className={css.saveButton}
          data-testid="baf-standard-hooks-save"
          disabled={state.hooksSaving || !dirty}
          onClick={() => { void saveNodeHooks() }}
        >
          {state.hooksSaving ? t('hooksSaving') : t('hooksSave')}
        </button>
      </div>
      {state.hooksNotice !== undefined ? (
        <div className={css.statusError} data-testid="baf-standard-hooks-notice">
          {state.hooksNotice}
        </div>
      ) : null}
    </div>
  )
}
