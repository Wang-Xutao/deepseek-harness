/**
 * BafWorkflow service freeze + resolveAndAudit.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BafWorkflow from '../src/index.ts'
import { ENTERPRISE, FALLBACK, LIGHT, PRIMARY, PROFILE, availabilityOf } from './fixtures.ts'

// 【变更】2026-10-07 (九点批 测试整备): routeStatus()'s not-frozen expectation
// is machine-dependent without this — the M1 lazy tier freeze reads the REAL
// ~/.dsh/baf-route-config.json (enabled:true on any machine that ever saved
// the routing settings), which makes requireFrozen() succeed and the throw
// vanish. Point DSH_HOME at an empty temp dir so the spec sees no config.
let hermeticHome = ''
const realDshHome = process.env.DSH_HOME
beforeEach(() => {
  hermeticHome = mkdtempSync(join(tmpdir(), 'baf-mount-home-'))
  process.env.DSH_HOME = hermeticHome
})
afterEach(() => {
  process.env.DSH_HOME = realDshHome
  rmSync(hermeticHome, { recursive: true, force: true })
})

function key(ref: { provider: string; model: string }): string {
  return `${ref.provider}::${ref.model}`
}

describe('BafWorkflow service', () => {
  it('freezes context, resolves, and exposes routeStatus', async () => {
    const ctx = new Context()
    await ctx.plugin(BafWorkflow, {})
    expect(ctx.bafWorkflow.help().length).toBeGreaterThan(0)
    expect(() => ctx.bafWorkflow.routeStatus()).toThrow(/not frozen/)

    ctx.bafWorkflow.freezeRouteContext(ENTERPRISE, PROFILE)
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    const resolution = ctx.bafWorkflow.resolve('intake', availabilityOf(all))
    expect(resolution.model).toBe(LIGHT.model)
    expect(ctx.bafWorkflow.selectionForTurn(resolution)).toEqual({
      provider: LIGHT.provider,
      model: LIGHT.model,
    })
    expect(ctx.bafWorkflow.workerAgentOptions(resolution)).toEqual({
      provider: LIGHT.provider,
      model: LIGHT.model,
    })
    const status = ctx.bafWorkflow.routeStatus()
    expect(status.policyId).toBe('fixture-enterprise-route')
    expect(status.phases.intake?.actual?.model).toBe(LIGHT.model)
    expect(status.phases.intake?.fallbackActive).toBe(false)
  })

  it('fix #2: frozenEnterprisePolicy exposes only an explicitly frozen ceiling', async () => {
    // The dispatch-time tier routing min-restricts its per-turn synthesis
    // against this accessor's result. A tier-auto-frozen policy is the tier
    // routing's OWN synthesis — never a ceiling — and no freeze at all
    // means no ceiling (permissive local default).
    const ctx = new Context()
    await ctx.plugin(BafWorkflow, {})
    expect(ctx.bafWorkflow.frozenEnterprisePolicy()).toBeUndefined()

    ctx.bafWorkflow.freezeRouteContext(ENTERPRISE, PROFILE)
    expect(ctx.bafWorkflow.frozenEnterprisePolicy()).toBe(ENTERPRISE)
  })

  it('resolveAndAudit writes success events and rethrows after failure audit', async () => {
    const ctx = new Context()
    await ctx.plugin(BafWorkflow, {})
    ctx.bafWorkflow.freezeRouteContext(ENTERPRISE, PROFILE)
    const session = Session.create(SessionId('baf-workflow-audit'))
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    ctx.bafWorkflow.resolveAndAudit(session, 'open', availabilityOf(all))
    expect(session.snapshotEvents().some(e => e.type === 'baf/route-resolved')).toBe(true)

    expect(() => ctx.bafWorkflow.resolveAndAudit(session, 'implement', availabilityOf(new Set())))
      .toThrow(/fallback/)
    const failed = session.snapshotEvents().filter(e => e.type === 'baf/route-resolved')
    expect(failed.at(-1)?.data).toMatchObject({ source: 'failed', phase: 'implement' })
  })
})
