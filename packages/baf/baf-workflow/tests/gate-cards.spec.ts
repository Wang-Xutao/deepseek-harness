/**
 * §22 Gate Cards registry — tests for the single source of truth.
 *
 * Covers:
 *  - registry shape (closed set of gate ids, every spec is well-formed);
 *  - renderer: success / dynamic / unknown refusal;
 *  - whitelist helper used by `go-coordinator` / `session-gate`.
 *
 * @module @deepseek-ai/dsh-baf-workflow/tests/gate-cards
 */

import { describe, expect, it } from 'vitest'
import {
  GATE_REGISTRY,
  isGateResolvingCommand,
  type GateId,
  renderGate,
  renderGateCard,
  type GateSpec,
} from '../src/gate-cards.ts'

const EXPECTED_GATE_IDS: readonly GateId[] = [
  'scaffold',
  'intake-classify',
  'design-confirm',
  'verify-archive',
  'abandon',
  'resume',
]

describe('GATE_REGISTRY shape (§22)', () => {
  it('exposes exactly the closed set of §22 gate ids', () => {
    expect(Object.keys(GATE_REGISTRY).sort()).toEqual([...EXPECTED_GATE_IDS].sort())
  })

  it('every gate has a non-empty title and question', () => {
    for (const [id, spec] of Object.entries(GATE_REGISTRY)) {
      expect(spec.title, `${id} title`).not.toBe('')
      expect(spec.question, `${id} question`).not.toBe('')
    }
  })

  it('every static gate has 2-3 options, none empty', () => {
    for (const [id, spec] of Object.entries(GATE_REGISTRY)) {
      if (spec.dynamicOptions !== undefined) continue
      expect(spec.options.length, `${id} options count`).toBeGreaterThanOrEqual(2)
      expect(spec.options.length, `${id} options count`).toBeLessThanOrEqual(3)
      for (const opt of spec.options) {
        expect(opt.id, `${id}/${opt.id} option id`).not.toBe('')
        expect(opt.label, `${id}/${opt.id} option label`).not.toBe('')
      }
    }
  })

  it('every non-noop option maps to a registered slash command', () => {
    // Slash commands are added one at a time; this assertion keeps the
    // registry honest: it must never invent a command that does not exist.
    const known = new Set([
      '__noop__',
      '/baf-scaffold',
      '/baf-workflow-classify',
      '/baf-workflow-clarify',
      '/baf-workflow-implement',
      '/baf-workflow-abandon',
      '/baf-workflow-resume',
      '/baf-go',
    ])
    for (const [id, spec] of Object.entries(GATE_REGISTRY)) {
      if (spec.dynamicOptions !== undefined) continue
      for (const opt of spec.options) {
        expect(known.has(opt.command), `${id}/${opt.id} command`).toBe(true)
      }
    }
  })

  it('scaffold gate offers init + cancel (the only sanctioned options)', () => {
    const scaffold = GATE_REGISTRY['scaffold']
    expect(scaffold.options.map(o => o.id)).toEqual(['init', 'cancel'])
    expect(scaffold.options[0]?.command).toBe('/baf-scaffold')
    expect(scaffold.options[1]?.command).toBe('__noop__')
  })
})

describe('renderGateCard (§22)', () => {
  it('renders the static scaffold gate card with options verbatim', () => {
    const spec: GateSpec = GATE_REGISTRY['scaffold']
    const result = renderGateCard(spec, { cwd: '/tmp/ws' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('初始化工作区（执行 scaffold）')
    expect(result.text).toContain('/baf-scaffold')
    expect(result.text).toContain('暂不初始化')
    expect(result.text).toContain('请点击工作流页签按钮')
  })

  it('renders the intake-classify gate card with confirm / reject', () => {
    const result = renderGate(GATE_REGISTRY['intake-classify'].id, { cwd: '/tmp/ws', changeId: 'CHG-001' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('确认分类')
    expect(result.text).toContain('拒绝并重新描述')
    expect(result.text).toContain('/baf-workflow-classify confirm')
    expect(result.text).toContain('/baf-workflow-classify reject')
    expect(result.text).toContain('change=CHG-001')
  })

  it('renders the resume gate dynamically from candidate list', () => {
    const result = renderGate('resume', {
      cwd: '/tmp/ws',
      changeId: 'CHG-002',
      resumeCandidates: ['clarify', 'plan'],
      resumeAnchor: 'plan',
    })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('/baf-workflow-resume clarify')
    expect(result.text).toContain('/baf-workflow-resume plan')
    expect(result.text).toContain('默认')
  })

  it('returns a refusal when the resume gate is asked without candidates', () => {
    const result = renderGate('resume', { cwd: '/tmp/ws' })
    expect(result.kind).toBe('error')
    expect(result.text).toContain('缺少上下文')
  })

  it('returns a structured refusal for an unknown gate id (never a TypeError)', () => {
    // Runtime callers (the future `baf_gate_ask` tool, Remote `gateResolve`)
    // receive ids from JSON payloads — an unregistered id must come back as a
    // refusal value per §22.9, not crash the tool layer.
    for (const bogus of ['hand-written-scaffold', 'PLAN_CONFIRM', '']) {
      const result = renderGate(bogus, { cwd: '/tmp/ws' })
      expect(result.kind, `gateId=${JSON.stringify(bogus)}`).toBe('error')
      expect(result.text).toContain('unknown_gate')
      expect(result.text).toContain('GATE_REGISTRY')
    }
  })

  it('renders the design-confirm gate pointing at /baf-go (the §18.5 门 A)', () => {
    const result = renderGate('design-confirm', { cwd: '/tmp/ws', changeId: 'CHG-003' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('/baf-go')
    expect(result.text).toContain('确认设计，进入计划')
    expect(result.text).toContain('退回澄清')
  })

  it('renders the verify-archive gate pointing at /baf-go (the §18.5 门 B)', () => {
    const result = renderGate('verify-archive', { cwd: '/tmp/ws', changeId: 'CHG-004' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('/baf-go')
    expect(result.text).toContain('确认归档')
  })

  it('renders the abandon gate with confirm + cancel', () => {
    const result = renderGate('abandon', { cwd: '/tmp/ws', changeId: 'CHG-005' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('/baf-workflow-abandon confirm')
    expect(result.text).toContain('取消')
  })

  it('always prints the standard footer hint', () => {
    for (const id of EXPECTED_GATE_IDS) {
      const result = id === 'resume'
        ? renderGate(id, { cwd: '/tmp/ws', resumeCandidates: ['plan'] })
        : renderGate(id, { cwd: '/tmp/ws' })
      expect(result.text).toContain('请点击工作流页签按钮')
    }
  })
})

describe('isGateResolvingCommand (§22)', () => {
  it('recognizes all gates\' primary commands', () => {
    expect(isGateResolvingCommand('/baf-scaffold')).toBe(true)
    expect(isGateResolvingCommand('/baf-workflow-classify')).toBe(true)
    expect(isGateResolvingCommand('/baf-workflow-clarify')).toBe(true)
    expect(isGateResolvingCommand('/baf-workflow-implement')).toBe(true)
    expect(isGateResolvingCommand('/baf-workflow-abandon')).toBe(true)
    expect(isGateResolvingCommand('/baf-workflow-resume')).toBe(true)
    expect(isGateResolvingCommand('/baf-go')).toBe(true)
  })

  it('rejects commands that are not gate-resolving', () => {
    expect(isGateResolvingCommand('/baf-help')).toBe(false)
    expect(isGateResolvingCommand('/baf-welcome')).toBe(false)
    expect(isGateResolvingCommand('/baf-status')).toBe(false)
    expect(isGateResolvingCommand('/baf-workflow-open')).toBe(false)
    expect(isGateResolvingCommand('__noop__')).toBe(false)
  })
})
