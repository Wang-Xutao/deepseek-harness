/**
 * The outcome of one 「格式化输入」 run, shared by the composer control and the
 * app-wide notice.
 *
 * 【变更】2026-10-25 (批次二十五 2): new file. The control used to keep the
 * outcome inside its own component state, so the message only lived in a
 * tooltip that appears on hover — a transient operation outcome belongs in the
 * app-wide Toast, whose host (`shell.overlay`) outlives the composer that
 * produced it. The outcome is therefore published to a small store that both
 * surfaces read.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/**
 * What the run did.
 *
 * `optimized` — the model answered and rewrote the draft.
 * `same` — the model answered with the author's own text.
 * `local` — no model answered; the local arranger answered instead.
 * `changed` — the author typed while the model worked.
 */
export type DraftFormatOutcome = 'optimized' | 'same' | 'local' | 'changed'

/** One settled outcome; `seq` keys the toast so a repeat run restarts it. */
export interface DraftFormatNotice {
  /** What the run did. */
  readonly kind: DraftFormatOutcome
  /** The model that answered, when one did. */
  readonly model?: string
  /** Sequence number; a repeat run carries a higher one. */
  readonly seq: number
}

/** The published outcome state. */
export interface DraftFormatNoticeState {
  /** The latest settled outcome, or null while none shows. */
  readonly notice: DraftFormatNotice | null
}

/**
 * Holds the latest outcome for the app-wide notice.
 *
 * The controller is plugin-level, so the notice survives the composer that
 * produced it — the toast must not disappear because the user switched views
 * mid-answer.
 */
export class DraftFormatNoticeController {
  /** The state source the overlay entry reads. */
  readonly store: SnapshotStore<DraftFormatNoticeState> = createSnapshotStore<DraftFormatNoticeState>({ notice: null })

  private seq = 0

  /**
   * Publish one settled outcome.
   * @param kind - what the run did.
   * @param model - the model that answered, when one did.
   */
  publish(kind: DraftFormatOutcome, model?: string): void {
    this.seq += 1
    this.store.set({
      notice: {
        kind,
        ...(model === undefined ? {} : { model }),
        seq: this.seq,
      },
    })
  }

  /** Clear the shown notice. */
  dismiss(): void {
    this.store.set({ notice: null })
  }
}
