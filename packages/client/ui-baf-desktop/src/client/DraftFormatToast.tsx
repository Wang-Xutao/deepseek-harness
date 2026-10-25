/**
 * The app-wide notice for a 「格式化输入」 run.
 *
 * 【变更】2026-10-25 (批次二十五 2): new file. The user reported the model
 * path as「没有效果」, and a message that only lives in a hover tooltip reads
 * exactly like that. The outcome is a transient operation outcome, so it
 * belongs in the app-wide Toast — and the Toast's host must outlive the
 * composer that produced it, which is why this entry lives in the frame-wide
 * `shell.overlay` layer rather than beside the control.
 */
import type { ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-layout SlotMap merge (the `shell.overlay` seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DraftFormatNoticeState, DraftFormatOutcome } from './draft-format-notice.ts'
import type { BafDesktopKey } from './locales.ts'

/** The outcome store and the dismissal the overlay entry binds. */
export interface DraftFormatToastInjected {
  hooks: { draftFormatNotice: SnapshotStore<DraftFormatNoticeState> }
  dismiss: () => void
}

/** Props of the app-wide tidy-up notice. */
export type DraftFormatToastProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'baf.desktop'>
  & InjectFace<DraftFormatToastInjected>

/** The dictionary key each outcome reads. */
const OUTCOME_KEYS: Record<DraftFormatOutcome, BafDesktopKey> = {
  optimized: 'draft.optimized',
  same: 'draft.same',
  local: 'draft.local',
  changed: 'draft.changed',
}

/**
 * Show the settled outcome of the last tidy-up run.
 * @param props - the outcome hook, the dismissal, and the locale seat.
 * @returns the toast, or nothing while no outcome shows.
 */
export function DraftFormatToast({ useDraftFormatNotice, dismiss, t }: DraftFormatToastProps): ReactNode {
  const notice = useDraftFormatNotice(state => state.notice)
  if (notice === null) return null
  const key = OUTCOME_KEYS[notice.kind]
  const text = notice.model === undefined ? t(key) : t(key, { model: notice.model })
  return (
    <Toast
      key={notice.seq}
      text={text}
      // The model's own answer is the good news; the local fallback is worth a
      // warning glyph, because the user asked for the model.
      {...(notice.kind === 'optimized' ? { tone: 'success' as const } : {})}
      {...(notice.kind === 'local' ? { icon: <IconWarningOutlineRegular /> } : {})}
      onDone={dismiss}
    />
  )
}
