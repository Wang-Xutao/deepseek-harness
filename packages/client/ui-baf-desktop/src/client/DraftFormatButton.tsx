/**
 * Composer tidy-up control: arranges the current draft into Markdown
 * structure, and reverts to the author's own wording on demand.
 *
 * 【变更】2026-10-25 (批次二十二): new file. It sits in the upstream slot
 * `conversation.input.right`, so no upstream ui-conversation file changed.
 *
 * 【变更】2026-10-25 (批次二十四 3): the control now asks the SESSION'S OWN
 * MODEL to arrange the draft first, and keeps the local deterministic
 * arranger as the fallback. The model path is IMPLICIT — the user presses one
 * button and never picks a mode; the control simply arranges the draft with
 * the model that is already answering the conversation, and falls back to the
 * local rules when no model answered (a fresh session with no route, a
 * provider hiccup, an empty answer). The draft stays the user's: the control
 * never sends anything, never appends to the session, and the revert action
 * restores the author's exact wording.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  IconCheckOutlineMedium, IconListPenOutlineMedium, IconRefreshOutlineMedium, IconUndoDocOutlineMedium, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-conversation SlotMap merge (the input.right seat) and the
// session standard kit that carries the draft and the input action face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatDraft, sanitizeModelDraft } from './draft-format.ts'
import css from './DraftFormatButton.module.css'

/** How long the "already structured" answer stays on the control. */
const FLASH_MS = 1800

/** How long the "the draft changed while we were formatting" notice stays. */
const NOTICE_MS = 2600

/**
 * 【变更】2026-10-25 (批次二十五 2): what a notice reports.
 *
 * `changed` — the author typed while the model worked.
 * `optimized` — the model answered and rewrote the draft.
 * `same` — the model answered with the author's own text.
 * `local` — no model answered; the local arranger answered instead.
 */
export type NoticeKind = 'changed' | 'optimized' | 'same' | 'local'

/** The author's draft captured before the formatter arranged it. */
interface DraftSnapshot {
  /** The input action face that owned the draft when the snapshot was taken. */
  readonly owner: unknown
  /** The author's text before the formatter ran. */
  readonly original: string
  /** The formatter's output, so a later edit can be reported. */
  readonly formatted: string
}

/**
 * 【变更】2026-10-25 (批次二十五 2): what the model path answered.
 *
 * The control names the model in its notice, so the answer carries the route
 * that produced it — a silent fallback read as「没有效果」.
 */
export interface DraftFormatModelAnswer {
  /** The optimized draft text. */
  readonly text: string
  /** The model that produced it (display only). */
  readonly model: string
}

/**
 * The face the slot registration hands the control.
 */
export interface DraftFormatInjected {
  /**
   * 【变更】2026-10-25 (批次二十四 3): arrange the draft with the session's own
   * model.
   *
   * Returns the arranged text, or undefined when no model answered — the
   * control then falls back to the local deterministic arranger, so a missing
   * model never leaves the user without a working button.
   *
   * 【变更】2026-10-25 (批次二十五 2): the answer names the model that ran, so
   * the control can tell the user the model really answered.
   */
  formatWithModel?: (draft: string) => Promise<DraftFormatModelAnswer | undefined>
  /**
   * 【变更】2026-10-25 (批次二十五 2): publish the run's outcome to the
   * app-wide notice.
   *
   * The control's own tooltip is a hover surface, so the outcome it carries is
   * invisible unless the pointer happens to rest there. The notice this
   * callback feeds lives in the frame-wide overlay layer, where the user sees
   * it without hovering — which is the difference between「模型优化了这段文字」
   * and「按了按钮，什么都没发生」.
   */
  notifyOutcome?: (kind: NoticeKind, model?: string) => void
}

/** Full props of the composer tidy-up control. */
export type DraftFormatButtonProps =
  PropsRuntime<'conversation.input.right'>
  & PropsLocale<'baf.desktop'>
  & InjectFace<DraftFormatInjected>

/**
 * Render the tidy-up control and its states.
 * @param props - the composer seat's runtime props and locale seat.
 */
export function DraftFormatButton({ useInput, inputActions, t, formatWithModel, notifyOutcome }: DraftFormatButtonProps) {
  const draft = useInput(state => state.draft)
  const phase = useInput(state => state.phase)
  const references = useInput(state => state.occurrences.length)
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null)
  const [unchanged, setUnchanged] = useState(false)
  // 【变更】2026-10-25 (批次二十四 3): the model call in flight. The button
  // wears a spinner and refuses further presses until the answer lands.
  const [working, setWorking] = useState(false)
  // 【变更】2026-10-25 (批次二十四 3): a short notice (the draft changed while
  // the model was arranging it). A notice is not a flash: it stays until the
  // next press.
  // 【变更】2026-10-25 (批次二十五 2): the notice carries its KIND as well as
  // its text, so the control can say WHICH of the two answered (the model or
  // the local rules) and the DOM can expose that state.
  const [notice, setNotice] = useState<{ readonly kind: NoticeKind; readonly text: string } | undefined>(undefined)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The live draft, so an async answer can tell whether the author typed while
  // the model was working (the answer must not overwrite their typing).
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
  }, [])

  // The action face is per Session, so it names the draft the snapshot belongs
  // to: a snapshot taken in another Session never reverts this one.
  const revert = snapshot !== null && snapshot.owner === inputActions
  // A draft holding @ file references cannot be rewritten as plain text: the
  // write would drop the reference chips the author attached.
  const blocked = references > 0
  const editable = phase === 'plain' && draft.trim() !== ''
  const edited = revert && draft !== snapshot.formatted

  const flashUnchanged = useCallback((): void => {
    setUnchanged(true)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      setUnchanged(false)
      flashTimer.current = null
    }, FLASH_MS)
  }, [])

  const showNotice = useCallback((kind: NoticeKind, text: string, model?: string): void => {
    setNotice({ kind, text })
    // 【变更】2026-10-25 (批次二十五 2): the outcome also reaches the app-wide
    // notice, so it is visible without hovering the control.
    if (model === undefined) notifyOutcome?.(kind)
    else notifyOutcome?.(kind, model)
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => {
      setNotice(undefined)
      noticeTimer.current = null
    }, NOTICE_MS)
  }, [notifyOutcome])

  /** Write the arranged text into the draft and remember the author's wording. */
  const applyFormatted = useCallback((original: string, formatted: string): void => {
    if (formatted === original) {
      flashUnchanged()
      return
    }
    setSnapshot({ owner: inputActions, original, formatted })
    inputActions.setDraft(formatted)
  }, [inputActions, flashUnchanged])

  /**
   * 【变更】2026-10-25 (批次二十四 3): the model path. The session's own model
   * arranges the draft; when it cannot (no route, provider failure, empty
   * answer) the local deterministic arranger takes over, so the button always
   * does something useful.
   *
   * 【变更】2026-10-25 (批次二十五 2): the outcome is now VISIBLE. The user
   * reported the model path as「没有效果」, and a silent fallback is exactly
   * what that looks like: the control now names the model that answered, and
   * says so plainly when the local arranger answered instead.
   */
  const runModel = useCallback(async (original: string): Promise<void> => {
    setWorking(true)
    let answer: DraftFormatModelAnswer | undefined
    try {
      answer = await formatWithModel?.(original)
    } catch {
      answer = undefined
    } finally {
      setWorking(false)
    }
    // The author may have typed while the model was working — their words win.
    if (draftRef.current !== original) {
      showNotice('changed', t('draft.changed'))
      return
    }
    const cleaned = answer === undefined ? undefined : sanitizeModelDraft(answer.text)
    if (cleaned === undefined || cleaned === '') {
      // No model answer (or an empty one): the local arranger answers, and the
      // control says which of the two produced the draft.
      applyFormatted(original, formatDraft(original))
      showNotice('local', t('draft.local'))
      return
    }
    if (cleaned === original) {
      // The model answered with the author's own text: it read the draft and
      // found nothing to change. Say THAT instead of claiming an optimization.
      applyFormatted(original, cleaned)
      showNotice('same', t('draft.same'))
      return
    }
    applyFormatted(original, cleaned)
    showNotice('optimized', t('draft.optimized', { model: answer?.model ?? '' }), answer?.model)
  }, [formatWithModel, applyFormatted, showNotice, t])

  const onClick = useCallback((): void => {
    if (!editable || blocked || working) return
    if (revert) {
      inputActions.setDraft(snapshot.original)
      setSnapshot(null)
      return
    }
    const original = draft
    if (formatWithModel === undefined) {
      // No model path (the control is mounted without the Host bridge): the
      // local arranger answers, synchronously.
      applyFormatted(original, formatDraft(original))
      return
    }
    void runModel(original)
  }, [editable, blocked, working, revert, inputActions, snapshot, draft, formatWithModel, applyFormatted, runModel])

  // A toolbar press must not move the caret out of the draft.
  const keepFocus = useCallback((event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }, [])

  const label = working
    ? t('draft.working')
    : notice !== undefined
      ? notice.text
      : unchanged
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
        data-baf-draft-format-working={working ? 'true' : undefined}
        data-baf-draft-format-notice={notice?.kind}
        aria-label={working ? t('draft.working') : revert ? t('draft.revert') : t('draft.format')}
        aria-disabled={editable && !blocked && !working ? undefined : true}
        onMouseDown={keepFocus}
        onClick={onClick}
      >
        {working
          ? <IconRefreshOutlineMedium size={14} className={css.spinner} />
          : unchanged
            ? <IconCheckOutlineMedium size={14} />
            : revert
              ? <IconUndoDocOutlineMedium size={14} />
              : <IconListPenOutlineMedium size={14} />}
      </button>
    </Tooltip>
  )
}
