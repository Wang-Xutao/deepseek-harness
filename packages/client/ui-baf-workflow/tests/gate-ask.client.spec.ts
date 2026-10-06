/**
 * 【变更】2026-10-07 (九点批 问题 2): the dispatch-preview node map — which
 * stage's work order a gate card's confirm dispatches. Locked here because
 * the map is a FROZEN mirror of host-side registries (`advanceGateIdForNode`
 * + GATE_REGISTRY; the client bundle cannot import them). The baf-workflow
 * gate-overview.spec cross-locks the same correspondence from the registry
 * side, so a rename breaks at least one of the two.
 */

import { describe, expect, it } from 'vitest'
import { dispatchNodeOfGate } from '../src/client/gate-ask.ts'

describe('dispatchNodeOfGate (九点批 问题 2 dispatch-preview node map)', () => {
  it('maps every stage-advance gate to the stage its confirm lands on', () => {
    expect(dispatchNodeOfGate('intake-classify')).toBe('open')
    expect(dispatchNodeOfGate('open-advance')).toBe('clarify')
    expect(dispatchNodeOfGate('bugfix-open-advance')).toBe('implement')
    expect(dispatchNodeOfGate('clarify-advance')).toBe('design')
    expect(dispatchNodeOfGate('design-advance')).toBe('plan')
    expect(dispatchNodeOfGate('plan-advance')).toBe('implement')
    expect(dispatchNodeOfGate('verify-advance')).toBe('verify')
    // The design park gate rides the wire under its REGISTRY confirm id
    // ('design-confirm'), never the park name 'design-to-plan'.
    expect(dispatchNodeOfGate('design-confirm')).toBe('plan')
  })

  it('returns null for gates that dispatch nothing model-authored', () => {
    // archive / abandon / scaffold / resume — no authored next stage.
    expect(dispatchNodeOfGate('verify-archive')).toBeNull()
    expect(dispatchNodeOfGate('abandon')).toBeNull()
    expect(dispatchNodeOfGate('scaffold')).toBeNull()
    expect(dispatchNodeOfGate('resume')).toBeNull()
    // unknown and missing ids never guess.
    expect(dispatchNodeOfGate('not-a-gate')).toBeNull()
    expect(dispatchNodeOfGate(undefined)).toBeNull()
  })
})
