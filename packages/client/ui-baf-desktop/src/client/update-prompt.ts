/**
 * The update prompt the Electron shell asks the app to draw.
 *
 * 【变更】2026-10-25 (批次二十六 4): new file. The shell used to raise the
 * operating system's message box; the app draws its own dialog instead. The
 * split follows the product's grain: the shell owns the DECISION (which scope
 * prompted, whether the update is required) and the renderer owns the DRAWING.
 * The prompt therefore arrives as data, and the facts the shell knows — the
 * scope summary and the release notes — arrive with it.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** What the shell found, in the shape the dialog draws. */
export interface UpdatePromptPayload {
  /** Prompt identity; only the newest prompt shows. */
  readonly id: string
  /** Whether the shell refuses to keep running on the old version. */
  readonly required: boolean
  /** One line naming the scopes and versions involved. */
  readonly summaryZh: string
  /** The release notes — one point per line. */
  readonly notesZh: string
  /** The version the update lands on. */
  readonly targetVersion: string
}

/** The published prompt state. */
export interface UpdatePromptState {
  /** The prompt to draw, or null while none shows. */
  readonly prompt: UpdatePromptPayload | null
  /** Whether an apply is running. */
  readonly busy: boolean
  /** The failure text of the last apply attempt. */
  readonly error: string | null
  /** The shell's latest progress line, while an apply runs. */
  readonly progress: string
}

/**
 * Read one prompt fact off the shell payload.
 * @param record - the untrusted payload.
 * @param key - the fact's key.
 * @returns the string fact, or undefined when it is absent or not a string.
 */
function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Parse the shell's prompt payload.
 * @param raw - the untrusted payload.
 * @returns the prompt, or undefined when the payload is not one.
 */
export function parseUpdatePrompt(raw: unknown): UpdatePromptPayload | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const id = readText(record, 'id')
  if (id === undefined || id.length === 0) return undefined
  return {
    id,
    required: record.required === true,
    summaryZh: readText(record, 'summaryZh') ?? '',
    notesZh: readText(record, 'notesZh') ?? '',
    targetVersion: readText(record, 'targetVersion') ?? '',
  }
}

/**
 * Holds the prompt the app draws and the state of the apply it starts.
 *
 * The controller is plugin-level, so the prompt survives the surface that
 * received it — the dialog must not vanish because the user changed views
 * while the shell was waiting for an answer.
 */
export class UpdatePromptController {
  /** The state source the overlay entry reads. */
  readonly store: SnapshotStore<UpdatePromptState> = createSnapshotStore<UpdatePromptState>({
    prompt: null,
    busy: false,
    error: null,
    progress: '',
  })

  /**
   * Show one prompt. A newer prompt replaces an older one.
   * @param prompt - the prompt to draw.
   */
  show(prompt: UpdatePromptPayload): void {
    this.store.set({ prompt, busy: false, error: null, progress: '' })
  }

  /** Close the prompt without applying anything. */
  dismiss(): void {
    this.store.set({ prompt: null, busy: false, error: null, progress: '' })
  }

  /**
   * Mark the apply as running.
   * @param busy - whether an apply is running.
   */
  setBusy(busy: boolean): void {
    this.store.set({ ...this.store.getSnapshot(), busy })
  }

  /**
   * Record the failure of an apply attempt.
   * @param error - the failure text; null clears it.
   */
  setError(error: string | null): void {
    this.store.set({ ...this.store.getSnapshot(), error })
  }

  /**
   * Record the shell's progress line.
   * @param progress - the progress line; an empty line clears it.
   */
  setProgress(progress: string): void {
    this.store.set({ ...this.store.getSnapshot(), progress })
  }
}
