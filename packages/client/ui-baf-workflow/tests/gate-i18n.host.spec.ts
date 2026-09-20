/**
 * §22 GATE_REGISTRY contract — single source of truth for gate cards.
 *
 * Earlier we kept a frozen zh/en mirror of every static gate's
 * `title` / `question` / option `label` in `locales.ts` and a freeze
 * spec that failed when the two diverged. The mirror was never rendered
 * (`renderGate` reads GATE_REGISTRY directly), so it drifted in
 * practice and added a §22 edit × locales.ts edit × two tests triple
 * to every registry change.
 *
 * §22.16 P3 (2026-09) dropped the freeze: locales.ts no longer carries
 * `gate.*` keys, and this spec now asserts the *new* invariant —
 * - GATE_REGISTRY is internally consistent (every gate has question +
 *   options; static gates have at least 2 options so the customer
 *   always has a real choice)
 * - locales.ts does **not** carry frozen `gate.*` keys (the mirror
 *   was the failure mode, not the freeze)
 * - option `command` strings are all registered slashes (or `__noop__`)
 *
 * If a future phase reintroduces gate i18n, this spec should pin the
 * new contract — likely: read GATE_REGISTRY, project per-locale at
 * render time, and assert the projection layer instead of mirroring.
 */

import { describe, expect, it } from 'vitest'
import { GATE_REGISTRY, isGateResolvingCommand } from '@deepseek-ai/dsh-baf-workflow/src/gate-cards.ts'
import { en, zh } from '../src/client/locales.ts'
import type { WorkflowTabKey } from '../src/client/locales.ts'

const STATIC_GATES = ['scaffold', 'intake-classify', 'design-confirm', 'verify-archive', 'abandon'] as const

describe('gate registry single-source-of-truth contract (§22.16 P3 2026-09)', () => {
  it('every static gate has a non-empty question and at least two options', () => {
    for (const gateId of STATIC_GATES) {
      const spec = GATE_REGISTRY[gateId]
      expect(spec, `missing registry entry for ${gateId}`).toBeDefined()
      expect(spec.question.length, `${gateId} question empty`).toBeGreaterThan(0)
      expect(spec.options.length, `${gateId} must offer ≥2 options`).toBeGreaterThanOrEqual(2)
      for (const opt of spec.options) {
        expect(opt.label.length, `${gateId}.${opt.id} label empty`).toBeGreaterThan(0)
        expect(opt.command.length, `${gateId}.${opt.id} command empty`).toBeGreaterThan(0)
      }
    }
  })

  it('every option command is a registered gate-resolving slash (or __noop__)', () => {
    for (const gateId of STATIC_GATES) {
      for (const opt of GATE_REGISTRY[gateId].options) {
        // __noop__ is the intentional "do nothing, just close the card" escape;
        // anything else must round-trip through isGateResolvingCommand.
        expect(
          opt.command === '__noop__' || isGateResolvingCommand(opt.command),
          `gate ${gateId}.${opt.id} command ${opt.command} is not registered`,
        ).toBe(true)
      }
    }
  })

  it('option ids are unique inside each gate', () => {
    for (const gateId of STATIC_GATES) {
      const seen = new Set<string>()
      for (const opt of GATE_REGISTRY[gateId].options) {
        expect(seen.has(opt.id), `duplicate option id ${opt.id} in ${gateId}`).toBe(false)
        seen.add(opt.id)
      }
    }
  })

  it('locales.ts does not carry frozen gate-registry mirrors (single source of truth)', () => {
    // The mirror was removed in §22.16 P3 (2026-09); if it ever comes back
    // this spec should fail and the contributor should re-read the comment
    // above before reintroducing a frozen dictionary.
    //
    // Note: the Tab UI does carry display labels like `gate.designDone` /
    // `gate.verifyPassed` for the compact workflow strip — those are NOT
    // mirrors of `GATE_REGISTRY` titles/questions; they are short
    // single-word labels the strip uses inline. The frozen set we explicitly
    // removed is `gate.<gateId>.{title,question,option.<id>}` for every
    // entry in {@link STATIC_GATES}.
    const removedPrefixes = STATIC_GATES.flatMap(gateId => [
      `gate.${gateId}.title`,
      `gate.${gateId}.question`,
    ])
    const keys = new Set<WorkflowTabKey>([
      ...Object.keys(zh) as WorkflowTabKey[],
      ...Object.keys(en) as WorkflowTabKey[],
    ])
    for (const key of keys) {
      for (const prefix of removedPrefixes) {
        expect(
          key === prefix || key.startsWith(`${prefix}.option.`),
          `locales.ts still carries frozen ${key} (mirror of GATE_REGISTRY)`,
        ).toBe(false)
      }
    }
  })
})
