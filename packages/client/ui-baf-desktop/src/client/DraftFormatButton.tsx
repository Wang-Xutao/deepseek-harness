/**
 * Composer tidy-up control: arranges the current draft into Markdown
 * structure, and reverts to the author's own wording on demand.
 *
 * 【变更】2026-10-25 (批次二十二): new file. It sits in the upstream slot
 * `conversation.input.right`, so no upstream ui-conversation file changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  IconCheckOutlineMedium, IconListPenOutlineMedium, IconUndoDocOutlineMedium, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-conversation SlotMap merge (the input.right seat) and the
// session standard kit that carries the draft and the input action face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatDraft } from './draft-format.ts'
import css from './DraftFormatButton.module.css'

/** How long the "already structured" answer stays on the control. */
const FLASH_MS = 1800

/** The author's draft captured before the formatter arranged it. */
interface DraftSnapshot {
  /** The input action face that owned the draft when the snapshot was taken. */
  readonly owner: unknown
  /** The author's text before the formatter ran. */
  readonly original: string
  /** The formatter's output, so a later edit can be reported. */
  readonly formatted: string
}

/** Full props of the composer tidy-up control. */
export type DraftFormatButtonProps =
  PropsRuntime<'conversation.input.right'> & PropsLocale<'baf.desktop'>

/**
 * Render the tidy-up control and its two states.
 * @param props - the composer seat's runtime props and locale seat.
 */
export function DraftFormatButton({ useInput, inputActions, t }: DraftFormatButtonProps) {
  const draft = useInput(state => state.draft)
  const phase = useInput(state => state.phase)
  const references = useInput(state => state.occurrences.length)
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null)
  const [unchanged, setUnchanged] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
  }, [])

  // The action face is per Session, so it names the draft the snapshot belongs
  // to: a snapshot taken in another Session never reverts this one.
  const revert = snapshot !== null && snapshot.owner === inputActions
  // A draft holding @ file references cannot be rewritten as plain text: the
  // write would drop the reference chips the author attached.
  const blocked = references > 0
  const editable = phase === 'plain' && draft.trim() !== ''
  const edited = revert && draft !== snapshot.formatted

  const onClick = (): void => {
    if (!editable || blocked) return
    if (revert) {
      inputActions.setDraft(snapshot.original)
      setSnapshot(null)
      return
    }
    const formatted = formatDraft(draft)
    if (formatted === draft) {
      setUnchanged(true)
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => {
        setUnchanged(false)
        flashTimer.current = null
      }, FLASH_MS)
      return
    }
    setSnapshot({ owner: inputActions, original: draft, formatted })
    inputActions.setDraft(formatted)
  }

  // A toolbar press must not move the caret out of the draft.
  const keepFocus = useCallback((event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }, [])

  const label = unchanged
    ? t('draft.unchanged')
    : blocked
      ? t('draft.blocked')
      : revert
        ? (edited ? t('draft.revert.dirty') : t('draft.revert.hint'))
        : t('draft.format.hint')

  return (
    <Tooltip label={label} side="top" delayMs={500} openOnClick={blocked}>
      <button
        type="button"
        className={css.button}
        data-baf-draft-format={revert ? 'revert' : 'format'}
        data-baf-draft-format-blocked={blocked || undefined}
        data-baf-draft-format-dirty={edited || undefined}
        data-baf-draft-format-flash={unchanged ? 'unchanged' : undefined}
        aria-label={revert ? t('draft.revert') : t('draft.format')}
        aria-disabled={editable && !blocked ? undefined : true}
        onMouseDown={keepFocus}
        onClick={onClick}
      >
        {unchanged
          ? <IconCheckOutlineMedium size={14} />
          : revert
            ? <IconUndoDocOutlineMedium size={14} />
            : <IconListPenOutlineMedium size={14} />}
      </button>
    </Tooltip>
  )
}
