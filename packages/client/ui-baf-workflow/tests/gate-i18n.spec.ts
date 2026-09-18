/**
 * §22.16 P3: gate i18n snapshot freeze.
 *
 * For every static gate in `GATE_REGISTRY` (excluding `resume` whose options
 * are dynamic), the zh dictionary must match the registry's `title` /
 * `question` / option `label` byte-for-byte. en is a hand translation, not
 * a snapshot — the test only verifies the en value is non-empty.
 *
 * If a future contributor edits GATE_REGISTRY, this spec fails until they
 * update locales.ts in lockstep. That is the freeze contract: one source
 * of truth, one mirror, one place to update.
 */

import { describe, expect, it } from 'vitest'
import { GATE_REGISTRY } from '@deepseek-ai/dsh-baf-workflow/src/gate-cards.ts'
import { en, zh } from '../src/client/locales.ts'

const STATIC_GATES = ['scaffold', 'intake-classify', 'design-confirm', 'verify-archive', 'abandon'] as const

describe('gate i18n snapshot freeze (§22.16 P3)', () => {
  it('registers a zh entry per static gate title / question / option', () => {
    for (const gateId of STATIC_GATES) {
      const spec = GATE_REGISTRY[gateId]
      expect(spec, `missing registry entry for ${gateId}`).toBeDefined()
      expect(zh[`gate.${gateId}.title` as keyof typeof zh]).toBe(spec.title)
      expect(zh[`gate.${gateId}.question` as keyof typeof zh]).toBe(spec.question)
      for (const opt of spec.options) {
        const key = `gate.${gateId}.option.${opt.id}` as keyof typeof zh
        expect(zh[key], `zh ${key} missing`).toBe(opt.label)
        const enKey = `gate.${gateId}.option.${opt.id}` as keyof typeof en
        expect(en[enKey], `en ${key} missing`).toBeTruthy()
      }
    }
  })

  it('every option key is unique across the registry', () => {
    const seen = new Set<string>()
    for (const gateId of STATIC_GATES) {
      for (const opt of GATE_REGISTRY[gateId].options) {
        const key = `gate.${gateId}.option.${opt.id}`
        expect(seen.has(key), `duplicate key ${key}`).toBe(false)
        seen.add(key)
      }
    }
  })
})
