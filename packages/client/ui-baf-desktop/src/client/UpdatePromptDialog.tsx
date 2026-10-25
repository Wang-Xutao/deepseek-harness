/**
 * The in-app update prompt.
 *
 * 【变更】2026-10-25 (批次二十六 4): new file. The shell used to raise the
 * operating system's message box; a Windows-styled panel in the middle of an
 * app that draws every other surface itself read as a stranger. This dialog
 * draws the same prompt in the product's own language — the app's tokens, the
 * app's dialog primitive, the app's buttons.
 *
 * Both variants share this one surface: the optional update offers 「稍后更新」,
 * and the required one offers 「退出」 and refuses every dismissal path, so
 * 「必须更新后才能继续使用」 still means it.
 */
import type { ReactNode } from 'react'
import { Button, IconCloseOutlineRegular, IconDownloadOutlineMedium, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-layout SlotMap merge (the `shell.overlay` seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { UpdatePromptState } from './update-prompt.ts'
import css from './UpdatePromptDialog.module.css'

/** The prompt state and the actions the overlay entry binds. */
export interface UpdatePromptDialogInjected {
  hooks: { updatePrompt: SnapshotStore<UpdatePromptState> }
  /** Apply the offered update. */
  applyUpdate: () => void
  /** Close the prompt without applying anything. */
  later: () => void
  /** End the app — a required update refuses to keep running. */
  quit: () => void
}

/** Props of the update prompt. */
export type UpdatePromptDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'baf.desktop'>
  & InjectFace<UpdatePromptDialogInjected>

/**
 * Split a notes blob into display paragraphs (one per non-empty line).
 * @param notes - the notes blob.
 * @returns one entry per point.
 */
function noteParagraphs(notes: string): readonly string[] {
  return notes.split('\n').map(line => line.trim()).filter(line => line.length > 0)
}

/**
 * Draw the update prompt the Electron shell asked for.
 * @param props - the prompt state, the actions, and the locale seat.
 * @returns the dialog, or nothing while no prompt shows.
 */
export function UpdatePromptDialog({ useUpdatePrompt, applyUpdate, later, quit, t }: UpdatePromptDialogProps): ReactNode {
  const state = useUpdatePrompt(snapshot => snapshot)
  const prompt = state.prompt
  if (prompt === null) return null

  const required = prompt.required
  const notes = noteParagraphs(prompt.notesZh)
  const title = required ? t('update.prompt.titleRequired') : t('update.prompt.title')

  return (
    <Modal
      open
      // A required update refuses every dismissal path: Escape, the mask, and
      // the close button all land here and none of them lets the old version
      // keep running.
      onClose={required ? () => { /* required: no way out but 更新 or 退出 */ } : later}
      title={title}
      headless
    >
      <div className={css.body} data-testid="update-prompt">
        <div className={css.header}>
          <span className={css.icon} aria-hidden="true">
            <IconDownloadOutlineMedium size={20} />
          </span>
          <h2 className={css.title}>{title}</h2>
          {required ? null : (
            <button type="button" className={css.close} aria-label={t('update.prompt.close')} onClick={later}>
              <IconCloseOutlineRegular size={14} />
            </button>
          )}
        </div>
        {prompt.summaryZh.length > 0 ? (
          <p className={css.summary} data-testid="update-prompt-summary">{prompt.summaryZh}</p>
        ) : null}
        {notes.length > 0 ? (
          <div className={css.notesBlock}>
            <p className={css.notesLabel}>{t('update.prompt.notes')}</p>
            <ul className={css.notes} data-testid="update-prompt-notes">
              {notes.map(line => <li key={line} className={css.note}>{line}</li>)}
            </ul>
          </div>
        ) : null}
        {state.error !== null ? (
          <p className={css.error} data-testid="update-prompt-error">{t('update.prompt.error')}：{state.error}</p>
        ) : null}
        {state.progress.length > 0 ? <p className={css.progress}>{state.progress}</p> : null}
        <div className={css.actions}>
          <Button
            variant="outline"
            data-testid={required ? 'update-prompt-quit' : 'update-prompt-later'}
            onClick={required ? quit : later}
          >
            {required ? t('update.prompt.quit') : t('update.prompt.later')}
          </Button>
          <Button
            variant="primary"
            disabled={state.busy}
            data-modal-autofocus
            data-testid="update-prompt-apply"
            onClick={applyUpdate}
          >
            {state.busy ? t('update.prompt.updating') : t('update.prompt.update')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
