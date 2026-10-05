/**
 * 多模型路由 auto 模型 — the session controller's integration with the
 * host-realm `bafRouteAuto` runtime (2026-10-05 批, customer points 4+5):
 * - `buildModelCatalog` PREPENDS the `baf-route/auto` pseudo group while the
 *   runtime is mounted and active, and offers nothing otherwise
 *   (没有使能则没有 auto);
 * - `selectModel` on the pseudo pair bypasses availability checks, call-config
 *   resolution, and default-model persistence (auto must never become the
 *   deployment default) while staying a durable session selection;
 * - `rawSelectionOf` exposes the UNRESOLVED pick for the dispatch gate;
 * - the per-step `current` selection resolves auto through the runtime each
 *   turn and falls back to the durable header / deployment default when
 *   routing goes away mid-flight;
 * - a resolved request header never consumes the auto pick (the session stays
 *   on auto; each turn re-resolves).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { buildModelCatalog } from '../src/catalog.ts'
import { ApiSessionAgentController } from '../src/agent.ts'
import { createSessionTestController } from './test-remote.ts'

class SimpleAdapter extends LlmAdapter {
  constructor(
    private readonly models: readonly LlmModelInfo[],
    private readonly efforts?: readonly string[],
  ) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Fixture' }
  }

  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...(this.efforts === undefined ? {} : {
        reasoning: {
          efforts: this.efforts.map(id => ({ id: ReasoningEffortId(id), name: id })),
          defaultEffort: ReasoningEffortId(this.efforts[this.efforts.length - 1] ?? 'high'),
        },
      }),
    })
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Catalog tests never enter provider streaming.
  }
}

/** Structural fake of the baf-workflow BafRouteAutoRuntime service. */
function fakeAuto(options: {
  resolve?: () => { provider: string; model: string; reasoningEffort?: string } | undefined
  active?: boolean
} = {}) {
  const calls = { resolve: 0 }
  const service = {
    accepts: (provider: string, model: string) => provider === 'baf-route' && model === 'auto',
    resolveAuto: (_sessionId: string) => {
      calls.resolve += 1
      return options.resolve === undefined
        ? { provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high' }
        : options.resolve()
    },
    catalogGroups: () => options.active === false
      ? []
      : [{ id: 'baf-route', name: '多模型路由', models: [{ id: 'auto', name: 'Auto' }] }],
    pinForNextRequest: () => {},
  }
  return { service, calls }
}

async function harness(auto?: unknown): Promise<{
  ctx: Context
  agent: Agent
  sessionId: SessionId
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(AgentRegistry)
  ctx.llm.registerAdapter(['deepseek-official'], new SimpleAdapter([
    { provider: 'deepseek-official', id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { provider: 'deepseek-official', id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
  ], ['high', 'max']))
  if (auto !== undefined) ctx.provide('bafRouteAuto', auto)
  const session = ctx.sessions.create()
  const agent = {
    id: session.id,
    session,
    status: 'running',
    ctx,
    inbox: { nextTurn: [], nextStep: [] },
  } as unknown as Agent
  await ctx.agents.register(agent)
  return { ctx, agent, sessionId: session.id }
}

function currentSelection(ctx: Context, sessionId: SessionId) {
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('expected a live test Session')
  return ctx.sessionProjections.snapshot(session).values.modelSelection?.next
    ?? ctx.agentDefaultModel.currentSelection()
}

describe('多模型路由 auto — catalog injection', () => {
  it('prepends the baf-route/auto group while the runtime is mounted and active', async () => {
    const { ctx } = await harness(fakeAuto().service)
    const catalog = await buildModelCatalog(
      ctx, { provider: 'deepseek-official', model: 'deepseek-chat' },
    )
    await ctx.fiber.dispose()
    expect(catalog.groups[0]).toMatchObject({ id: 'baf-route', name: '多模型路由' })
    expect(catalog.groups[0]?.models).toEqual([{ id: 'auto', name: 'Auto' }])
    expect(catalog.groups[1]?.id).toBe('deepseek-official')
    expect(catalog.routableProviders).toContain('baf-route')
  })

  it('offers no auto entry without the runtime, or when routing is inactive', async () => {
    const bare = await harness()
    const bareCatalog = await buildModelCatalog(
      bare.ctx, { provider: 'deepseek-official', model: 'deepseek-chat' },
    )
    expect(bareCatalog.groups.map(group => group.id)).toEqual(['deepseek-official'])
    await bare.ctx.fiber.dispose()

    const inactive = await harness(fakeAuto({ active: false }).service)
    const inactiveCatalog = await buildModelCatalog(
      inactive.ctx, { provider: 'deepseek-official', model: 'deepseek-chat' },
    )
    expect(inactiveCatalog.groups.map(group => group.id)).toEqual(['deepseek-official'])
    await inactive.ctx.fiber.dispose()
  })
})

describe('多模型路由 auto — selectModel bypass', () => {
  it('installs the pseudo selection without availability, call-config, or default persistence', async () => {
    const saved: unknown[] = []
    const { ctx, sessionId } = await harness(fakeAuto().service)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      cwd: '/tmp',
      saveDefaultModelSelection: (selection) => {
        saved.push(selection)
      },
    })
    const selected = await controller.selectModel({
      sessionId,
      provider: 'baf-route',
      model: 'auto',
    })
    // Without the bypass this throws session/model-unavailable (no such
    // provider in the LLM registry); the durable projection holds the pseudo
    // pair; the deployment default is untouched.
    expect(selected).toEqual({ selected: { provider: 'baf-route', model: 'auto' } })
    expect(currentSelection(ctx, sessionId)).toEqual({ provider: 'baf-route', model: 'auto' })
    expect(saved).toEqual([])
    await ctx.fiber.dispose()
  })
})

describe('多模型路由 auto — raw selection passthrough + per-step resolution', () => {
  it('rawSelectionOf exposes the unresolved pick; current resolves it each turn', async () => {
    const auto = fakeAuto()
    const { ctx, agent, sessionId } = await harness(auto.service)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      cwd: '/tmp',
    })
    await controller.selectModel({ sessionId, provider: 'baf-route', model: 'auto' })
    const selection = new ApiSessionAgentController(ctx).selectionFor(agent)
    expect(controller.rawSelectionOf(agent)).toEqual({ provider: 'baf-route', model: 'auto' })
    expect(selection.current).toEqual({
      provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
    // Per-step: a second read re-resolves (the keyword/default path runs again).
    expect(selection.current).toEqual({
      provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
    expect(auto.calls.resolve).toBe(2)
    await ctx.fiber.dispose()
  })

  it('falls back to the deployment default when routing went away after the pick', async () => {
    const auto = fakeAuto({ resolve: () => undefined })
    const { ctx, agent, sessionId } = await harness(auto.service)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      cwd: '/tmp',
    })
    await controller.selectModel({ sessionId, provider: 'baf-route', model: 'auto' })
    expect(controller.rawSelectionOf(agent)).toEqual({ provider: 'baf-route', model: 'auto' })
    // Accepted-but-unresolvable: the pseudo pick must never leak into a request.
    expect(new ApiSessionAgentController(ctx).selectionFor(agent).current).toEqual({
      provider: 'deepseek-official', model: 'deepseek-chat',
    })
    await ctx.fiber.dispose()
  })

  it('a resolved request header never consumes the auto pick (the session stays on auto)', async () => {
    const auto = fakeAuto()
    const { ctx, agent, sessionId } = await harness(auto.service)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      cwd: '/tmp',
    })
    await controller.selectModel({ sessionId, provider: 'baf-route', model: 'auto' })
    // The request logs the RESOLVED concrete model — not the auto pair — so
    // the pending pseudo pick survives and the next turn routes again.
    expect(new ApiSessionAgentController(ctx).consumeSelection(
      agent, 'deepseek-official', 'deepseek-reasoner', 'high',
    )).toBe(false)
    expect(controller.rawSelectionOf(agent)).toEqual({ provider: 'baf-route', model: 'auto' })
    expect(new ApiSessionAgentController(ctx).selectionFor(agent).current).toEqual({
      provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
    await ctx.fiber.dispose()
  })

  it('a non-auto pick is returned as-is (point 4: 否则使用选中的模型)', async () => {
    const auto = fakeAuto()
    const { ctx, agent, sessionId } = await harness(auto.service)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      cwd: '/tmp',
    })
    await controller.selectModel({
      sessionId,
      provider: 'deepseek-official',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    })
    const selection = new ApiSessionAgentController(ctx).selectionFor(agent)
    expect(controller.rawSelectionOf(agent)).toEqual({
      provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
    expect(selection.current).toEqual({
      provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
    expect(auto.calls.resolve).toBe(0)
    await ctx.fiber.dispose()
  })
})
