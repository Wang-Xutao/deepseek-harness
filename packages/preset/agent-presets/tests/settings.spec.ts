/**
 * The default preset is a user setting. `config.default` is the deployment's
 * engineering default; a settings overlay owned by the host composition
 * overrides it and is re-read on every use, so a person can change which
 * preset new sessions get without a restart.
 *
 * 【变更】2026-10-04 (master merge): upstream removed
 * `@deepseek-ai/dsh-settings-file` — settings sections are now plugin config
 * entries projected from the active profile by `SettingsForms`. The roster
 * only consumes the service surface (`describe` for reads, `mutate` for the
 * one clearing write), so this file mounts an in-memory implementation with
 * those exact semantics instead of the deleted file-backed provider.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type SettingsService from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it } from 'vitest'
import AgentPresets, { COMPOSITION_FILE, SETTINGS_NAMESPACE } from '../src/index.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'system'), trust: 'system' as const }]
const NS = SETTINGS_NAMESPACE

/** Every temp root created by this file, removed after each test. */
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/**
 * In-memory `settings` service. Sections live only as long as the fiber that
 * published them, matching how unloading the owning composition withdraws a
 * user layer in the real profile-backed service.
 */
function provideSettings(ctx: Context): { fiber: { dispose: () => unknown } } {
  const sections = new Map<string, object>()
  const fiber = ctx.plugin({
    name: 'fake-settings',
    apply(pluginCtx: Context) {
      const service = {
        describe: () => [...sections].map(([ns, value]) => ({ ns, value, revision: 0, applies: 'live' as const })),
        update: async (ns: string, patch: object) => { sections.set(ns, { ...sections.get(ns) ?? {}, ...patch }) },
        replace: async (ns: string, section: object) => { sections.set(ns, section) },
        mutate: async (ns: string, ops: readonly { op: string; path: readonly string[]; value?: unknown }[]) => {
          let section = { ...sections.get(ns) ?? {} }
          for (const op of ops) {
            const [head] = op.path
            if (head === undefined) throw new Error('fake-settings: empty path')
            if (op.op === 'unset') {
              const { [head]: _unset, ...rest } = section
              section = rest
            } else if (op.op === 'set') {
              section = { ...section, [head]: op.value }
            } else {
              throw new Error(`fake-settings: unsupported op ${op.op}`)
            }
          }
          sections.set(ns, section)
        },
      } as unknown as SettingsService
      pluginCtx.provide('settings', service)
    },
  })
  return { fiber }
}

/**
 * A composition with a settings service standing behind the roster.
 * `settingsFiber` is the service's own handle, so a test can take it away the
 * way an unload does.
 */
async function harness(
  extraRoots: readonly { path: string; trust: 'system' | 'user' }[] = [],
): Promise<{ ctx: Context; settingsFiber: { dispose: () => unknown } }> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-preset-settings-'))
  roots.push(home)

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const { fiber: settingsFiber } = provideSettings(ctx)
  await settingsFiber
  await ctx.plugin(AgentPresets, { default: 'standard', roots: [...ROOTS, ...extraRoots], includeShippedRoot: false, includeUserRoot: false })
  return { ctx, settingsFiber }
}

const toolNames = (ctx: Context, agent?: unknown): string[] =>
  ctx.tools.schemas(agent as never).map(schema => schema.name).sort()

describe('the default preset as a user setting', () => {
  it('falls back to the composition default while the user set none', async () => {
    const { ctx } = await harness()

    expect(ctx.agentPresets.defaultId).toBe('standard')
  })

  it('takes the user default over the composition default', async () => {
    const { ctx } = await harness()

    await ctx.settings.update(NS, { default: 'minimal' })

    expect(ctx.agentPresets.defaultId).toBe('minimal')
  })

  it('composes a new session from the user default', async () => {
    const { ctx } = await harness()
    await ctx.settings.update(NS, { default: 'minimal' })

    const handle = await ctx.agents.create({
      sessionId: SessionId('settings-default'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx),
    })
    try {
      expect(toolNames(ctx, handle.agent)).toEqual(['beta'])
    } finally {
      await handle.dispose()
    }
  })

  it('leaves a running session on the preset it was composed from', async () => {
    const { ctx } = await harness()
    const running = await ctx.agents.create({
      sessionId: SessionId('settings-running'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx),
    })
    try {
      expect(toolNames(ctx, running.agent)).toEqual(['alpha'])

      // Changing the default mid-flight must not reach an agent that already
      // composed: its history was produced under `standard`'s tools.
      await ctx.settings.update(NS, { default: 'minimal' })

      expect(ctx.agentPresets.defaultId).toBe('minimal')
      expect(toolNames(ctx, running.agent)).toEqual(['alpha'])
    } finally {
      await running.dispose()
    }
  })

  it('re-inherits the composition default when the user setting is cleared', async () => {
    const { ctx } = await harness()
    await ctx.settings.update(NS, { default: 'minimal' })
    expect(ctx.agentPresets.defaultId).toBe('minimal')

    await ctx.settings.replace(NS, {})

    expect(ctx.agentPresets.defaultId).toBe('standard')
  })

  it('clears a user default it has just deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-preset-authored-'))
    roots.push(root)
    await mkdir(join(root, 'mine'))
    await writeFile(
      join(root, 'mine', COMPOSITION_FILE),
      `- id: only\n  name: ${join(FIXTURES, 'plugins', 'contribute.js')}\n  config:\n    tool: only\n`,
    )
    const { ctx } = await harness([{ path: root, trust: 'user' as const }])
    await ctx.settings.update(NS, { default: 'mine' })
    expect(ctx.agentPresets.defaultId).toBe('mine')

    await ctx.agentPresets.remove('mine')

    // Nothing will ever supply that id again, so leaving the setting pointed at
    // it would fail every session created without an explicit pick. Clearing it
    // exposes the deployment's own default underneath.
    expect(ctx.agentPresets.defaultId).toBe('standard')
    expect((await ctx.agentPresets.resolve()).id).toBe('standard')
  })

  it('reports an unknown user default only when a session tries to use it', async () => {
    const { ctx } = await harness()

    // Storing it succeeds — the roster is a live directory, so a name that is
    // absent now may exist by the time a session asks for it.
    await ctx.settings.update(NS, { default: 'no-such-preset' })

    await expect(ctx.agentPresets.resolve())
      .rejects.toThrow(/preset "no-such-preset" not found/)
  })
})

describe('a settings provider that goes away', () => {
  it('falls back to the composition default when the provider unloads', async () => {
    const { ctx, settingsFiber } = await harness()
    await ctx.settings.update(NS, { default: 'minimal' })
    expect(ctx.agentPresets.defaultId).toBe('minimal')

    // Unloading the provider takes the user layer with it; the roster keeps
    // working on its composition default rather than holding a stale override.
    await settingsFiber.dispose()

    expect(ctx.agentPresets.defaultId).toBe('standard')
  })
})
