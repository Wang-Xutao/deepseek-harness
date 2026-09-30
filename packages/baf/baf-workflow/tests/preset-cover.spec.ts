/**
 * 【变更】2026-09-28 (用户问题: BAF 门禁与工作流不得影响其他模式): the preset
 * membership predicate the two host-plane per-agent rows (`baf-guard-install`,
 * `baf-session-gate`) share — the one test their sweep filter and
 * `agent-preset/selected` sync lean on. These cases pin the predicate itself
 * against real scopes; each row's end-to-end wiring is pinned in its own
 * package (`dsh-baf-guard` install-scoped spec, session-gate isolation spec).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, createScope, scopeChainOf } from '@deepseek-ai/dsh-scope'
import type { Scope, ScopeParentBinding } from '@deepseek-ai/dsh-scope'
import { presetCovers } from '../src/preset-cover.ts'

/** Mint a standing-mount scope — the shape a preset's mount owns. */
async function mountPreset(ctx: Context, key: object): Promise<Scope> {
  let scope!: Scope
  await ctx.plugin((inner: Context) => { scope = createScope(inner, key) })
  return scope
}

/**
 * Mint an agent scope joined to a preset, holding the binding `recompose`
 * moves. The key doubles as the agent identity, as in production dispatch
 * (`scopeTarget(agent, agent)`).
 */
async function joinAgent(
  ctx: Context,
  key: object,
  presetKey: object,
): Promise<{ scope: Scope; binding: ScopeParentBinding }> {
  const binding = bindScopeParent(key, presetKey)
  let scope!: Scope
  await ctx.plugin((inner: Context) => { scope = createScope(inner, key) })
  return { scope, binding }
}

describe('presetCovers', () => {
  it('a row mounted without a scope keeps the cover-everything contract (CLI / test compositions)', async () => {
    const ctx = new Context()
    try {
      const presetKey = { preset: 'standard' }
      const preset = await mountPreset(ctx, presetKey)
      const agentKey = { agent: 'std-1' }
      const agent = await joinAgent(ctx, agentKey, presetKey)
      // No second preset exists in those compositions; the rows sit host-plane
      // and must keep covering every agent they see.
      expect(presetCovers(ctx, { ctx })).toBe(true)
      expect(presetCovers(ctx, { ctx: preset.ctx })).toBe(true)
      expect(presetCovers(ctx, { ctx: agent.scope.ctx })).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('a standing row covers exactly the agents joined to its own mount', async () => {
    const ctx = new Context()
    try {
      const bafKey = { preset: 'baf' }
      const standardKey = { preset: 'standard' }
      const baf = await mountPreset(ctx, bafKey)
      const standard = await mountPreset(ctx, standardKey)
      const bafAgent = await joinAgent(ctx, { agent: 'baf-1' }, bafKey)
      const stdAgent = await joinAgent(ctx, { agent: 'std-1' }, standardKey)
      expect(presetCovers(baf.ctx, { ctx: bafAgent.scope.ctx })).toBe(true)
      expect(presetCovers(standard.ctx, { ctx: stdAgent.scope.ctx })).toBe(true)
      // The cross-preset leak the predicate exists to close.
      expect(presetCovers(baf.ctx, { ctx: stdAgent.scope.ctx })).toBe(false)
      expect(presetCovers(standard.ctx, { ctx: bafAgent.scope.ctx })).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('re-linking the agent scope moves membership with the chain (the recompose path)', async () => {
    const ctx = new Context()
    try {
      const bafKey = { preset: 'baf' }
      const standardKey = { preset: 'standard' }
      const baf = await mountPreset(ctx, bafKey)
      await mountPreset(ctx, standardKey)
      const agentKey = { agent: 'blank-1' }
      const agent = await joinAgent(ctx, agentKey, bafKey)
      expect(presetCovers(baf.ctx, { ctx: agent.scope.ctx })).toBe(true)
      // `agentPresets.recompose` re-links without re-firing agent/created.
      agent.binding.rebind(standardKey)
      expect(scopeChainOf(agentKey)).toEqual([agentKey, standardKey])
      expect(presetCovers(baf.ctx, { ctx: agent.scope.ctx })).toBe(false)
      agent.binding.rebind(bafKey)
      expect(presetCovers(baf.ctx, { ctx: agent.scope.ctx })).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('membership is by mount, not preset id — a copied baf preset answers to its own row only', async () => {
    const ctx = new Context()
    try {
      const bafKey = { preset: 'baf' }
      const bafCopyKey = { preset: 'baf (copy)' }
      const baf = await mountPreset(ctx, bafKey)
      const bafCopy = await mountPreset(ctx, bafCopyKey)
      const copyAgent = await joinAgent(ctx, { agent: 'copy-1' }, bafCopyKey)
      expect(presetCovers(bafCopy.ctx, { ctx: copyAgent.scope.ctx })).toBe(true)
      // Same preset CONTENT, different standing mount: the original's row must
      // not reach into the copy's agents (and vice versa).
      expect(presetCovers(baf.ctx, { ctx: copyAgent.scope.ctx })).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('a scope nested under a covered agent stays covered (subagent fan-out)', async () => {
    const ctx = new Context()
    try {
      const bafKey = { preset: 'baf' }
      const baf = await mountPreset(ctx, bafKey)
      const parentKey = { agent: 'baf-1' }
      await joinAgent(ctx, parentKey, bafKey)
      const childKey = { agent: 'sub-1' }
      const child = await joinAgent(ctx, childKey, parentKey)
      expect(scopeChainOf(childKey)).toEqual([childKey, parentKey, bafKey])
      expect(presetCovers(baf.ctx, { ctx: child.scope.ctx })).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
