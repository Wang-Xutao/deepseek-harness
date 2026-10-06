/**
 * 多模型路由 M3 批次C — the Tab host's cold read of `baf/route-resolved`
 * audits from a session log (the same `sessionQuery.observeSession` read the
 * token-attribution and change-derivation paths use — no agent wake).
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { readSessionRouteAudits, readSessionRouteScan } from '../src/index.ts'

/** One recorded observeSession call. */
interface QueryCall {
  readonly projectionMode: string | undefined
  disposed: boolean
}

/** A minimal host ctx double whose sessionQuery serves one fixed log. */
function queryCtx(events: readonly { type: string; data?: unknown }[]): { ctx: Context; calls: QueryCall[] } {
  const calls: QueryCall[] = []
  const ctx = {
    sessionQuery: {
      observeSession: async (_id: string, options?: { projectionMode?: string }) => {
        const call: QueryCall = { projectionMode: options?.projectionMode, disposed: false }
        calls.push(call)
        return {
          events: [...events],
          [Symbol.dispose]: () => { call.disposed = true },
        }
      },
    },
  } as unknown as Context
  return { ctx, calls }
}

describe('readSessionRouteAudits (M3 批次C host cold read)', () => {
  it('collects baf/route-resolved payloads in log order and disposes the observation', async () => {
    const audit = {
      provider: 'p1', model: 'big-brain', source: 'phase', phase: 'design',
      tier: 'high', at: '2026-10-05T00:00:00.000Z', sessionId: 's1',
    }
    const { ctx, calls } = queryCtx([
      { type: 'user/message', data: { content: 'hi' } },
      { type: 'baf/route-resolved', data: audit },
      { type: 'assistant/message', data: { content: [] } },
    ])
    const entries = await readSessionRouteAudits(ctx, 's1')
    expect(entries).toEqual([audit])
    // The read is cold (projectionMode none) and always disposed.
    expect(calls[0]?.projectionMode).toBe('none')
    expect(calls[0]?.disposed).toBe(true)
  })

  it('returns an empty list when sessionQuery is not composed', async () => {
    const ctx = {} as unknown as Context
    expect(await readSessionRouteAudits(ctx, 's1')).toEqual([])
  })
})

describe('readSessionRouteScan (九点批 问题 5 audits + session model, one pass)', () => {
  const audit = {
    provider: 'p1', model: 'big-brain', source: 'phase', phase: 'design',
    tier: 'high', at: '2026-10-05T00:00:00.000Z', sessionId: 's1',
  }

  it('flags the session model auto when the LAST header epoch is the baf-route/auto pseudo entry', async () => {
    const { ctx } = queryCtx([
      { type: 'request/header', data: { header: { config: { provider: 'p1', model: 'old-model' } } } },
      { type: 'baf/route-resolved', data: audit },
      { type: 'request/header', data: { header: { config: { provider: 'baf-route', model: 'auto' } } } },
    ])
    const scan = await readSessionRouteScan(ctx, 's1')
    expect(scan.audits).toEqual([audit])
    expect(scan.sessionModel).toEqual({ provider: 'baf-route', model: 'auto', auto: true })
  })

  it('reports a pinned concrete model with auto false (the routing-never-engages case)', async () => {
    const { ctx } = queryCtx([
      { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'chat-pro' } } } },
    ])
    const scan = await readSessionRouteScan(ctx, 's1')
    expect(scan.sessionModel).toEqual({ provider: 'deepseek', model: 'chat-pro', auto: false })
  })

  it('omits sessionModel when the log carries no readable header epoch', async () => {
    const { ctx } = queryCtx([
      { type: 'request/header', data: { header: {} } },
      { type: 'baf/route-resolved', data: audit },
    ])
    const scan = await readSessionRouteScan(ctx, 's1')
    expect(scan.audits).toEqual([audit])
    expect(scan.sessionModel).toBeUndefined()
  })

  it('degrades to an empty scan when sessionQuery is not composed', async () => {
    const ctx = {} as unknown as Context
    expect(await readSessionRouteScan(ctx, 's1')).toEqual({ audits: [] })
  })
})
