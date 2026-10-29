/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 1): every confirmation option
 * explains itself — on the card, in the interactive dialog and in the read-only
 * 确认门 overview.
 *
 * The customer asked: 「确认门的每个选项下都要有简单的解释，比如『需求分类
 * 待确认』的回答『确认完整流程』就缺少解释说明」. The explanation is the
 * registry option's `hint` — one short plain-Chinese sentence saying what the
 * click DOES. Three surfaces read it:
 *
 *  1. the interactive dialog (`optionDescription` in gate-dialog.ts),
 *  2. the gate card's option line (`renderOptionLine` in gate-cards.ts),
 *  3. the read-only overview projection (`projectGateOverview`).
 *
 * The two DYNAMIC gates (resume / bind-workflow) build their options in
 * gate-cards.ts (`resumeOptions` / `bindOptions`) — those carry the hint too,
 * but the DIALOG re-derives the same options inside gate-dialog.ts
 * (`dialogOptions`), which is outside this change's file ownership: until that
 * duplication delegates to the exported builders, the dynamic gates' dialog
 * options still carry the technical 「将执行 …」 line.
 */

import { describe, expect, it } from 'vitest'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { GATE_REGISTRY, type GateId } from '../src/gate-cards.ts'
import { askGateDialog } from '../src/gate-dialog.ts'
import { projectGateOverview } from '../src/gate-overview.ts'

/** A `userQuestions` double that records the request and answers nothing. */
function recordingService() {
  const calls: AskUserQuestionRequest[] = []
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      return { answers: [{ id: 'gate', selected: [] }] }
    },
  }
}

/** The registry gates whose options are static (the dynamic ones are runtime). */
const STATIC_GATE_IDS = Object.keys(GATE_REGISTRY)
  .filter(id => GATE_REGISTRY[id as keyof typeof GATE_REGISTRY].dynamicOptions === undefined)

describe('the read-only 确认门 overview projects each option with its hint', () => {
  it('every static option carries the registry hint', () => {
    const overview = projectGateOverview()
    for (const gate of overview.confirmGates) {
      if (gate.dynamicOptions !== undefined) continue
      const spec = GATE_REGISTRY[gate.id as GateId]
      for (const option of gate.options) {
        const registryOption = spec.options.find(candidate => candidate.id === option.id)
        expect(registryOption, `${gate.id}/${option.id} registry option`).toBeDefined()
        expect(option.hint, `${gate.id}/${option.id} projected hint`).toBeTruthy()
        expect(option.hint, `${gate.id}/${option.id} projected hint`).toBe(registryOption?.hint)
      }
    }
  })
})

describe('the interactive dialog explains every option (客户问题 1)', () => {
  it('each option rides its plain-Chinese hint — never the technical dispatch line', async () => {
    for (const gateId of STATIC_GATE_IDS) {
      const service = recordingService()
      await askGateDialog(service, undefined, { gateId: gateId as keyof typeof GATE_REGISTRY })
      expect(service.calls, `${gateId} dialog`).toHaveLength(1)
      const options = service.calls[0]?.questions[0]?.options ?? []
      expect(options.length, `${gateId} options`).toBeGreaterThan(0)
      for (const option of options) {
        const registryOption = GATE_REGISTRY[gateId as keyof typeof GATE_REGISTRY].options
          .find(candidate => candidate.label === option.label)
        expect(registryOption, `${gateId}/${option.label} registry option`).toBeDefined()
        // The wire description IS the hint — the customer reads it under the
        // button, and the client's technical-line filter never touches it.
        expect(option.description, `${gateId}/${option.label} description`).toBe(registryOption?.hint)
        expect(option.description ?? '', `${gateId}/${option.label} description`).not.toContain('将执行')
      }
    }
  })
})
