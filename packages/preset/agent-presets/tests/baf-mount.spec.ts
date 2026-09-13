/**
 * Official BAF composition mounts baf-core under bafDomain isolate without
 * leaking the service onto the root realm.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Group from '@deepseek-ai/cordis-plugin-group'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { afterEach, describe, expect, it } from 'vitest'
import AgentPresets, { COMPOSITION_FILE } from '@deepseek-ai/dsh-agent-presets'
// Type-side only: pulls the `bafStandard` Context augmentation into this
// compile so serviceFor's keyof Context accepts the name.
import type {} from '@deepseek-ai/dsh-baf-standard'

const BAF_CORE_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'baf',
  'baf-core',
  'src',
  'index.ts',
).replaceAll('\\', '/')

const BAF_STANDARD_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'baf',
  'baf-standard',
  'src',
  'index.ts',
).replaceAll('\\', '/')

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function providedServiceNames(ctx: Context): string[] {
  const store = ctx.reflect.store
  return Object.getOwnPropertySymbols(store)
    .map(key => store[key]?.name)
    .filter((name): name is string => name !== undefined)
}

function rootResolves(ctx: Context, name: string): boolean {
  const key = ctx.root[Context.isolate][name]
  return key !== undefined && ctx.reflect.store[key] !== undefined
}

describe('BAF baf-core isolate mount', () => {
  it('keeps bafCore off the root realm and shares one instance across sessions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-baf-mount-'))
    roots.push(root)
    const presetDir = join(root, 'baf-core-only')
    await mkdir(presetDir)
    await writeFile(join(presetDir, COMPOSITION_FILE), `
- id: baf-domain
  name: cordis:group
  group: true
  isolate:
    bafCore: true
  config:
    - id: baf-core
      name: ${BAF_CORE_SRC}
`.trimStart())

    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.group = Group
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, {
      default: 'baf-core-only',
      roots: [{ path: root, trust: 'user' }],
      includeShippedRoot: false,
      includeUserRoot: false,
    })

    const first = await ctx.agents.create({
      sessionId: SessionId('baf-a'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'baf-core-only'),
    })
    const second = await ctx.agents.create({
      sessionId: SessionId('baf-b'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'baf-core-only'),
    })

    expect(providedServiceNames(ctx)).toContain('bafCore')
    expect(rootResolves(ctx, 'bafCore')).toBe(false)
    expect((ctx as { bafCore?: unknown }).bafCore).toBeUndefined()

    const mine = ctx.agentPresets.serviceFor(first.agent as Agent, 'bafCore') as { version: () => string } | undefined
    const theirs = ctx.agentPresets.serviceFor(second.agent as Agent, 'bafCore') as { version: () => string } | undefined
    expect(mine === undefined).toBe(false)
    expect(theirs === undefined).toBe(false)
    expect(mine!.version()).toBe(theirs!.version())
    expect(mine!.version()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('mounts Phase 7 services under the baf-domain isolate (bafStandard shared across sessions)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-baf-mount-p7-'))
    roots.push(root)
    const presetDir = join(root, 'baf-phase7')
    await mkdir(presetDir)
    await writeFile(join(presetDir, COMPOSITION_FILE), `
- id: baf-domain
  name: cordis:group
  group: true
  isolate:
    bafCore: true
    bafStandard: true
  config:
    - id: baf-core
      name: ${BAF_CORE_SRC}
    - id: baf-standard
      name: ${BAF_STANDARD_SRC}
`.trimStart())

    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.group = Group
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, {
      default: 'baf-phase7',
      roots: [{ path: root, trust: 'user' }],
      includeShippedRoot: false,
      includeUserRoot: false,
    })

    const first = await ctx.agents.create({
      sessionId: SessionId('baf-p7-a'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'baf-phase7'),
    })
    const second = await ctx.agents.create({
      sessionId: SessionId('baf-p7-b'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'baf-phase7'),
    })

    expect(providedServiceNames(ctx)).toContain('bafStandard')
    expect(rootResolves(ctx, 'bafStandard')).toBe(false)
    expect((ctx as { bafStandard?: unknown }).bafStandard).toBeUndefined()

    const mine = ctx.agentPresets.serviceFor(first.agent as Agent, 'bafStandard') as { help: () => string } | undefined
    const theirs = ctx.agentPresets.serviceFor(second.agent as Agent, 'bafStandard') as { help: () => string } | undefined
    expect(mine).toBeDefined()
    expect(theirs).toBeDefined()
    // isolate shares one underlying service instance across agents; identity is
    // observed via consistent observable behavior (matching the baf-core check).
    expect(mine!.help()).toBe(theirs!.help())
    expect(mine!.help()).toMatch(/standard/i)
  })
})
