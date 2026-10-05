/**
 * Provider display order for the composer / command model pickers.
 *
 * 【变更】2026-10-05 (auto 批): the `baf-route` pseudo group (the Auto model
 * the 多模型路由 runtime injects into the catalog) ranks FIRST — Auto is the
 * "let routing decide" entry point, so it belongs at the top of the picker,
 * ahead of the account/official providers.
 */
import { describe, expect, it } from 'vitest'
import { orderModelProviders } from '../src/client/provider-order.ts'

describe('orderModelProviders — 多模型路由 auto 批 (2026-10-05)', () => {
  it('ranks the baf-route auto group first, ahead of account/official', () => {
    const ordered = orderModelProviders([
      { id: 'deepseek-official' },
      { id: 'misc' },
      { id: 'baf-route' },
      { id: 'deepseek-account' },
    ])
    expect(ordered.map(group => group.id)).toEqual([
      'baf-route', 'deepseek-account', 'deepseek-official', 'misc',
    ])
  })

  it('keeps relative order among ordinary providers', () => {
    expect(orderModelProviders([{ id: 'b' }, { id: 'a' }]).map(group => group.id)).toEqual(['b', 'a'])
  })
})
