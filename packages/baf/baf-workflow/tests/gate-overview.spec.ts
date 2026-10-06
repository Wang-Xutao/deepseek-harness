/**
 * 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 projection — both gate layers
 * quoted verbatim from the product registries, so the read-only settings row
 * can never drift from what the workflow actually enforces. Locks:
 *
 * 1. Layer 1 = GATE_REGISTRY verbatim (15 rows, options with commands), with
 *    the advance-gate → resting-node mapping DERIVED from
 *    `advanceGateIdForNode` (never hand-listed).
 * 2. Layer 2 = the six artifact-gated stages, conditions byte-identical to
 *    the constants work orders quote (`DOC_REQUIREMENTS_ZH` etc.).
 * 3. The reverse of the client's `DISPATCH_NODE_OF_GATE` map (ui-baf-workflow
 *    gate-ask.ts): every gate id that map names must exist in the registry
 *    here, so a registry rename breaks THIS spec even though the client
 *    bundle cannot import it.
 */

import { describe, expect, it } from 'vitest'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { advanceGateIdForNode } from '../src/gate-dialog.ts'
import { gateOverviewIds, projectGateOverview } from '../src/gate-overview.ts'
import { IMPLEMENT_REQUIREMENTS_ZH } from '../src/go-dispatch.ts'
import { BUG_FIX_PATH_LEDGER_FILE } from '../src/stages/bug-fix-path.ts'
import { CHECKLIST_FILE, CHECKLIST_REQUIREMENTS_ZH, DOC_REQUIREMENTS_ZH } from '../src/stages/gates.ts'

/** The client's DISPATCH_NODE_OF_GATE ids (ui-baf-workflow/src/client/gate-ask.ts). */
const CLIENT_DISPATCH_GATE_IDS = [
  'intake-classify', 'open-advance', 'bugfix-open-advance', 'clarify-advance',
  'design-advance', 'plan-advance', 'verify-advance', 'design-confirm',
] as const

describe('projectGateOverview (九点批 问题 9 只读总览)', () => {
  const overview = projectGateOverview()

  it('projects every GATE_REGISTRY entry verbatim with id parity to gateOverviewIds', () => {
    expect(overview.confirmGates).toHaveLength(15)
    expect(gateOverviewIds()).toHaveLength(15)
    expect(overview.confirmGates.map(gate => gate.id).sort())
      .toEqual([...gateOverviewIds()].sort())
    for (const gate of overview.confirmGates) {
      expect(gate.title.length, `${gate.id} title`).toBeGreaterThan(0)
      expect(gate.question.length, `${gate.id} question`).toBeGreaterThan(0)
      // A gate either lists its options or marks them dynamic (bind-workflow
      // / resume fill theirs from live workspace state at pop time).
      if (gate.dynamicOptions === undefined) {
        expect(gate.options.length, `${gate.id} options`).toBeGreaterThan(0)
      } else {
        expect(gate.options.length, `${gate.id} dynamic options must be empty`).toBe(0)
      }
      for (const option of gate.options) {
        expect(option.command.length, `${gate.id}/${option.id} command`).toBeGreaterThan(0)
      }
    }
    const bind = overview.confirmGates.find(gate => gate.id === 'bind-workflow')
    expect(bind?.dynamicOptions).toBe('change-targets')
    expect(overview.confirmGates.find(gate => gate.id === 'resume')?.dynamicOptions).toBe('resume-targets')
  })

  it('derives the advance-gate resting nodes from advanceGateIdForNode, never a hand list', () => {
    const byId = new Map(overview.confirmGates.map(gate => [gate.id, gate]))
    // full-go open + the five later rests
    expect(byId.get('open-advance')).toMatchObject({ node: 'open' })
    expect(byId.get('bugfix-open-advance')).toMatchObject({ node: 'open', bugFix: true })
    expect(byId.get('clarify-advance')).toMatchObject({ node: 'clarify' })
    expect(byId.get('design-advance')).toMatchObject({ node: 'design' })
    expect(byId.get('plan-advance')).toMatchObject({ node: 'plan' })
    // implement rests on verify-advance (the checklist it just produced)
    expect(byId.get('verify-advance')).toMatchObject({ node: 'implement' })
    // one-shot gates carry no node
    expect(byId.get('intake-classify')?.node).toBeUndefined()
    expect(byId.get('abandon')?.node).toBeUndefined()
    // The derivation really runs through advanceGateIdForNode: every rest it
    // knows appears, and no confirm row invents a node the function cannot.
    const derivedNodes = new Set(
      ['open', 'open', 'clarify', 'design', 'plan', 'implement']
        .map((node, index) => advanceGateIdForNode(node, index === 1 ? 'bug-fix-path' : undefined)),
    )
    const carried = overview.confirmGates.filter(gate => gate.node !== undefined).map(gate => gate.id)
    expect(new Set(carried)).toEqual(derivedNodes)
  })

  it('projects the six artifact-gated stages with verbatim condition constants', () => {
    expect(overview.stageGates.map(row => row.node)).toEqual([
      'open', 'clarify', 'design', 'plan', 'implement', 'verify',
    ])
    const byNode = new Map(overview.stageGates.map(row => [row.node, row]))
    expect(byNode.get('open')).toMatchObject({
      artifact: ARTIFACT_FILES.proposal,
      conditions: DOC_REQUIREMENTS_ZH.open,
      advanceGateId: 'open-advance',
    })
    expect(byNode.get('clarify')?.conditions).toBe(DOC_REQUIREMENTS_ZH.clarify)
    expect(byNode.get('design')?.conditions).toBe(DOC_REQUIREMENTS_ZH.design)
    expect(byNode.get('plan')?.conditions).toBe(DOC_REQUIREMENTS_ZH.plan)
    // implement quotes the ledger requirements, not the doc gates
    expect(byNode.get('implement')).toMatchObject({
      conditions: IMPLEMENT_REQUIREMENTS_ZH,
      advanceGateId: 'verify-advance',
    })
    expect(byNode.get('implement')?.note).toContain(BUG_FIX_PATH_LEDGER_FILE)
    expect(byNode.get('verify')).toMatchObject({
      artifact: CHECKLIST_FILE,
      conditions: CHECKLIST_REQUIREMENTS_ZH,
      advanceGateId: 'verify-archive',
    })
    // every stage row names its adjudicating function
    for (const row of overview.stageGates) {
      expect(row.gateFn.length, `${row.node} gateFn`).toBeGreaterThan(0)
    }
  })

  it('keeps every gate id the client dispatch-preview map names in the registry', () => {
    const ids = new Set(overview.confirmGates.map(gate => gate.id))
    for (const gateId of CLIENT_DISPATCH_GATE_IDS) {
      expect(ids.has(gateId), `client dispatch map names ${gateId}`).toBe(true)
    }
  })
})
