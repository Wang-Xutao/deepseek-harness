/**
 * Append-only projection event types (Phase 4 persists these).
 * @module @deepseek-ai/dsh-baf-core/events
 */

import type { ChangeIntake } from './intake.ts'
import type { BaselineLock } from './workflow.ts'
import type { TerminalState, WorkflowNode } from './workflow.ts'
import type { TransitionSource } from './adapters.ts'

/** Common envelope fields on every projection event. */
export interface ProjectionEventBase {
  /** Stable event id for idempotent append. */
  readonly eventId: string
  /** Monotonic sequence within one change log. */
  readonly seq: number
  /** ISO-8601 timestamp. */
  readonly at: string
}

/** Which mandatory customer-confirmation gate is being awaited (§18.5). */
export type ConfirmGate = 'design-to-plan' | 'verify-to-archive'

/**
 * §13 R5 — frozen copy of the §22 gate card text captured at park time.
 * Only the fields the Tab renders; the `command` field is preserved verbatim
 * so the dispatch on resolve stays correct even after registry edits.
 */
export interface AwaitingConfirmSnapshot {
  readonly title: string
  readonly question: string
  readonly options: readonly {
    readonly id: string
    readonly label: string
    readonly command: string
    readonly args?: readonly string[]
  }[]
}

/** One projection log event. */
export type ProjectionEvent =
  | (ProjectionEventBase & { type: 'intake-classified'; intake: ChangeIntake })
  | (ProjectionEventBase & { type: 'intake-confirmed'; by: 'user' | 'rule' })
  | (ProjectionEventBase & {
    /**
     * §22.17 J — the customer overrode the classifier's path choice at the
     * classify gate (the dialog's two path buttons). Legal only while the
     * intake is still pending confirmation (between `intake-classified`
     * and `intake-confirmed`); the fold ignores a stray later event so a
     * replayed log never resurrects a confirmed change's mode.
     */
    type: 'intake-mode-set'
    from: 'clarify-required' | 'full-go-path' | 'bug-fix-path'
    to: 'full-go-path' | 'bug-fix-path'
    by: 'user'
  })
  | (ProjectionEventBase & {
    /**
     * 【变更】2026-09-23 (demo1 十问题 9): one-time settlement of the intake's
     * pre-judgment fields — a finished change must not read
     * 待定 forever. `kind` settles from the driven path (bug-fix→bug,
     * full-go→new-requirement) when the heuristic left it unknown;
     * `affectedScope` settles from the ledger's allowlist size (1→single-file,
     * ≤3→small-local, else cross-module). Written by the archive drive right
     * before `change-archived`; the fold applies it once.
     * 【变更】2026-09-24 (demo6 问题 2/6): both fields optional — the settle
     * now fires at the stage where the fact is KNOWN (kind at classify
     * confirm, scope at plan completion) and each event settles only what it
     * carries. The archive-time settle remains the backstop with both.
     */
    type: 'intake-settled'
    kind?: 'new-requirement' | 'bug' | 'maintenance'
    affectedScope?: 'single-file' | 'small-local' | 'cross-module' | 'public-api'
    reasonCodes?: readonly string[]
  })
  | (ProjectionEventBase & { type: 'baseline-locked'; lock: BaselineLock })
  | (ProjectionEventBase & { type: 'stage-entered'; node: WorkflowNode; cause?: string; source?: TransitionSource })
  | (ProjectionEventBase & { type: 'stage-completed'; node: WorkflowNode; artifacts: string[] })
  | (ProjectionEventBase & { type: 'stage-failed'; node: WorkflowNode; reason: string })
  | (ProjectionEventBase & { type: 'drift-detected'; node: WorkflowNode; cause: string })
  | (ProjectionEventBase & {
    type: 'mode-upgraded'
    from: 'bug-fix-path'
    to: 'full-go-path'
    /**
     * Structured cause: `code` is a stable machine-readable id (e.g.
     * `'file-count-exceeded'`, `'cross-module'`, `'manual-escalation'`),
     * `message` is the human-readable summary written into the proposal.
     * The string legacy form is preserved by accepting a plain string
     * for replay of pre-R6 events.
     */
    cause: { code: string; message: string } | string
  })
  | (ProjectionEventBase & {
    /** Coordinator parked on gate A/B awaiting an explicit customer drive (§18.5). */
    type: 'awaiting-confirm'
    gate: ConfirmGate
    /**
     * §13 R5 — snapshot of the §22 gate card text at the moment of the
     * park. Replay of an old log yields the same `question` / `options`
     * the customer saw, even if `GATE_REGISTRY` has since been edited.
     * Older events pre-R5 omit this field; readers must fall back to the
     * live registry in that case.
     */
    snapshot?: AwaitingConfirmSnapshot
  })
  | (ProjectionEventBase & { type: 'change-archived'; source?: TransitionSource })
  | (ProjectionEventBase & { type: 'change-abandoned'; source?: TransitionSource })
  | (ProjectionEventBase & {
    type: 'transition-rejected'
    from: WorkflowNode | null
    to: WorkflowNode | TerminalState
    reason: string
  })
