/**
 * BafWorkflow service freeze + resolveAndAudit.
 */

import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import BafWorkflow from '../src/index.ts'
import { ENTERPRISE, FALLBACK, LIGHT, PRIMARY, PROFILE, availabilityOf } from './fixtures.ts'

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
