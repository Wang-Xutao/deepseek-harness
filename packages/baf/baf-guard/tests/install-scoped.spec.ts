/**
 * 【变更】2026-09-28 (用户问题: BAF 门禁与工作流不得影响其他模式): the install
 * row's preset isolation against a real Cordis tree — the two cross-preset
 * paths that used to leak the hard gate onto other presets' agents, pinned
 * end-to-end with the real ToolRuntime and the real guard policy:
 *
 * 1. the `agents.list()` sweep at mount time (standard-mode agents already
 *    live when the baf preset mounts next to them),
 * 2. `agent-preset/selected` (a blank session recomposed between presets) —
 *    entering installs, leaving unwinds.
 *
 * The probe is behavioral: an unguarded `bash mkfs…` runs; a guarded one is
 * denied by the real `createBafToolGuard` dangerous-command policy.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Type-only: brings the `'agent-preset/selected'` event declaration in.
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { apply, inject, name } from '../src/install.ts'

const signal = new AbortController().signal
/** A command the real guard always denies, and one it always allows. */
const DENIED = 'mkfs.ext4 /dev/sda1'
const ALLOWED = 'echo ok'

function bashTool(): ToolDefinition {
  return {
    name: 'bash',
    description: 'probe shell',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: () => Promise.resolve('ran:bash'),
  }
}

/** Run the probe through the real tool pipeline as one agent. */
async function runBash(ctx: Context, agent: Agent, command: string): Promise<string> {
  const result = await ctx.tools.execute({
    signal,
    callId: ToolCallId(`probe-${command.length}-${resultSeq++}`),
    name: 'bash',
    arguments: { command },
    agent,
  })
  const first = result.content[0]
  return first?.type === 'text' ? first.text : JSON.stringify(result.content)
}
let resultSeq = 0

/** Mint a standing preset scope — where the install row is mounted. */
async function mountPreset(ctx: Context, key: object): Promise<Scope> {
  let scope!: Scope
  await ctx.plugin((inner: Context) => { scope = createScope(inner, key) })
  return scope
}

/**
 * Mint a live agent joined to a preset. The key object doubles as the Agent
 * identity and the scope-carrier key (`scopeTarget(agent, agent)`), and its
 * `.ctx` resolves `tools`/`systemPrompt` — the standing-mount inject path the
 * row itself exercises (`agent.ctx.inject(['tools'], …)` declares its own).
 */
async function joinAgent(
  ctx: Context,
  id: string,
  presetKey: object,
  cwd: string,
): Promise<{ agent: Agent; binding: ReturnType<typeof bindScopeParent> }> {
  const agent = { id: id as SessionId, session: { header: { cwd } } } as Agent
  const binding = bindScopeParent(agent, presetKey)
  let scope!: Scope
  await ctx.plugin(Object.assign(
    (inner: Context) => { scope = createScope(inner, agent) },
    { inject: ['tools', 'systemPrompt'] },
  ))
  ;(agent as { ctx?: Context }).ctx = scope.ctx
  return { agent, binding }
}

describe('install row · preset isolation (real Cordis tree)', () => {
  it('keeps the hard gate off other presets across sweep, agent/created, and recompose', async () => {
    const ctx = new Context()
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'baf-guard-iso-'))
    try {
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ToolRuntime)
      ctx.tools.register(bashTool())
      const registry = new Map<string, Agent>()
      ctx.provide('agents', {
        list: () => [...registry.values()],
        get: (id: string) => registry.get(id),
      } as never)

      const bafKey = { preset: 'baf' }
      const standardKey = { preset: 'standard' }

      // A standard-mode agent is live BEFORE the baf preset mounts — the
      // sweep at row-mount time is the first leak vector.
      const standard = await joinAgent(ctx, 'std-session', standardKey, workspaceRoot)
      registry.set('std-session', standard.agent)
      const bafScope = await mountPreset(ctx, bafKey)
      await bafScope.ctx.plugin({ name, inject, apply })
      expect(await runBash(ctx, standard.agent, DENIED)).toBe('ran:bash')

      // A baf agent created later is heard through its own carrier and gated.
      const baf = await joinAgent(ctx, 'baf-session', bafKey, workspaceRoot)
      registry.set('baf-session', baf.agent)
      await ctx.serial(scopeTarget(baf.agent, baf.agent), 'agent/created', { agent: baf.agent } as never)
      await vi.waitFor(async () => {
        expect(await runBash(ctx, baf.agent, DENIED)).toContain('dangerous_command')
      })
      // The gate denies without over-blocking the same agent…
      expect(await runBash(ctx, baf.agent, ALLOWED)).toBe('ran:bash')
      // …and the standard neighbor stays untouched.
      expect(await runBash(ctx, standard.agent, DENIED)).toBe('ran:bash')

      // agent/created for the standard agent never reaches the baf row
      // (carrier-scoped dispatch; events flow up the agent's own chain only).
      await ctx.serial(
        scopeTarget(standard.agent, standard.agent), 'agent/created',
        { agent: standard.agent } as never,
      )
      expect(await runBash(ctx, standard.agent, DENIED)).toBe('ran:bash')

      // Recompose: the blank session leaves baf — the gate must unwind.
      baf.binding.rebind(standardKey)
      ctx.emit('agent-preset/selected', baf.agent.id, 'standard')
      await vi.waitFor(async () => {
        expect(await runBash(ctx, baf.agent, DENIED)).toBe('ran:bash')
      })

      // Recompose back — the gate returns with the re-linked chain.
      baf.binding.rebind(bafKey)
      ctx.emit('agent-preset/selected', baf.agent.id, 'baf')
      await vi.waitFor(async () => {
        expect(await runBash(ctx, baf.agent, DENIED)).toContain('dangerous_command')
      })

      // A copied baf preset is covered by its OWN row, never the original's.
      const copyKey = { preset: 'baf (copy)' }
      const copyScope = await mountPreset(ctx, copyKey)
      await copyScope.ctx.plugin({ name, inject, apply })
      const copy = await joinAgent(ctx, 'copy-session', copyKey, workspaceRoot)
      registry.set('copy-session', copy.agent)
      await ctx.serial(scopeTarget(copy.agent, copy.agent), 'agent/created', { agent: copy.agent } as never)
      await vi.waitFor(async () => {
        expect(await runBash(ctx, copy.agent, DENIED)).toContain('dangerous_command')
      })
    } finally {
      await ctx.fiber.dispose()
      await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
