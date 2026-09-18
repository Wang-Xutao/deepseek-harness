/**
 * §22.15 B / P2-C2 confirm-edge source matrix.
 *
 * For every confirm edge (T2/T3/T7/T7a/T13/T14/T16) the `decideTransition`
 * layer must:
 *   - accept `slash` / `cli` / `tab` / `gate-card` (any human source)
 *   - refuse `model-tool` and missing source with `gate_confirmation_required`
 *
 * T4 (clarify → design) is included as the control: it never had a confirm
 * gate, so it must accept every source including `model-tool` and missing.
 */

import { describe, expect, it } from 'vitest'
import {
  BafError,
  TRANSITIONS,
  type TransitionSource,
  type WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'
import {
  CONFIRM_EDGES,
  assertTransitionAccepted,
  decideTransition,
} from '../src/transition.ts'
import type { WorkflowStatus } from '@deepseek-ai/dsh-baf-core'

const HUMAN_SOURCES: readonly TransitionSource[] = ['slash', 'cli', 'tab', 'gate-card']
const NON_HUMAN_SOURCES: readonly (TransitionSource | undefined | 'model-tool')[] = ['model-tool', undefined]

/**
 * Synthetic status that puts a rule in scope. The current node matches the
 * rule's `from`, the mode matches when the rule lists modes; we keep enough
 * intake / verify / archive evidence on hand for each rule's own gate so the
 * only failure surface is the source check.
 */
function statusForRule(fromNode: WorkflowNode, mode: 'full-go' | 'bug-fast-path'): WorkflowStatus {
  return {
    changeId: 'c-mtx',
    projectionVersion: 1,
    current: fromNode,
    terminal: null,
    mode,
    intake: {
      description: 'desc',
      workspace: { root: 'W:\\r' },
      affectedScopeHint: 'small-local',
      mode,
      confirmation: 'confirmed',
      at: '2026-01-01T00:00:00.000Z',
    },
    nodes: {
      intake: 'completed',
      open: 'completed',
      clarify: fromNode === 'clarify' ? 'in-progress' : 'completed',
      design: fromNode === 'design' ? 'in-progress' : 'completed',
      plan: fromNode === 'plan' ? 'in-progress' : 'completed',
      implement: fromNode === 'implement' ? 'in-progress' : 'completed',
      verify: fromNode === 'verify' ? 'in-progress' : 'completed',
      archive: fromNode === 'archive' ? 'in-progress' : 'completed',
      drift: 'pending',
      abandoned: 'pending',
    },
  } as unknown as WorkflowStatus
}

/**
 * Build the per-rule evidence needed to bypass everything except the source
 * check (intake confirmation, humanConfirmed, checksPassed, rootCause, etc.).
 */
function evidenceFor(ruleId: string): Record<string, unknown> {
  switch (ruleId) {
    case 'T2':
    case 'T3':
    case 'T4':
    case 'T6':
    case 'T7':
    case 'T7a':
    case 'T8':
    case 'T9':
      return {}
    case 'T5':
      return { rootCauseRecorded: true }
    case 'T10':
      return { checksPassed: true }
    case 'T13':
      return { humanConfirmed: true } // T13 (drift exit) keeps its evidence gate
    case 'T14':
      return { humanConfirmed: true }
    case 'T16':
      return { humanConfirmed: true }
    default:
      return {}
  }
}

/**
 * Pick a mode the rule accepts; rules with `modes: []` accept every mode.
 */
function modeFor(ruleId: string): 'full-go' | 'bug-fast-path' {
  return ruleId === 'T3' || ruleId === 'T5' ? 'bug-fast-path' : 'full-go'
}

describe('confirm-edge source matrix (§22.15 B / P2-C2)', () => {
  // Live confirm set — locked here so a stray addition shows up in CI.
  it('locks the confirm-edge set to {T2, T3, T7, T7a, T13, T14, T16}', () => {
    expect([...CONFIRM_EDGES].sort()).toEqual(['T13', 'T14', 'T16', 'T2', 'T3', 'T7', 'T7a'])
  })

  for (const rule of TRANSITIONS) {
    if (!CONFIRM_EDGES.has(rule.id)) continue
    const fromNode = rule.from
    if (fromNode === null) continue // T16/T12 are non-from-restricted but we'll skip anyway
    const target = rule.to

    describe(`edge ${rule.id} (${fromNode} → ${target})`, () => {
      const baseStatus = statusForRule(fromNode, modeFor(rule.id))

      for (const src of HUMAN_SOURCES) {
        it(`accepts source='${src}'`, () => {
          const evidence = { ...evidenceFor(rule.id), source: src }
          const decision = decideTransition({ status: baseStatus, to: target, evidence })
          expect(decision.accepted).toBe(true)
          expect(() => {
            assertTransitionAccepted(decision, fromNode, target)
          }).not.toThrow()
        })
      }

      for (const src of NON_HUMAN_SOURCES) {
        const label = src === undefined ? 'no source' : `source='${src}'`
        it(`refuses ${label} with gate_confirmation_required`, () => {
          const evidence = src === undefined
            ? evidenceFor(rule.id)
            : { ...evidenceFor(rule.id), source: src }
          const decision = decideTransition({ status: baseStatus, to: target, evidence })
          expect(decision.accepted).toBe(false)
          expect(decision.reason).toBe('gate_confirmation_required')
          expect(() => {
            assertTransitionAccepted(decision, fromNode, target)
          }).toThrow(BafError)
        })
      }
    })
  }

  it('control: T4 (clarify → design) accepts model-tool and missing source', () => {
    const status = statusForRule('clarify', 'full-go')
    for (const src of [...HUMAN_SOURCES, 'model-tool' as const, undefined]) {
      const evidence = src === undefined ? {} : { source: src }
      const decision = decideTransition({ status, to: 'design', evidence })
      expect(decision.accepted, `source=${String(src)}`).toBe(true)
    }
  })
})
