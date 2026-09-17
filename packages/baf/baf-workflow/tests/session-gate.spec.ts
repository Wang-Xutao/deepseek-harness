/**
 * Phase 8.8 session gate (§18.3): the startup binding, the toolchain probe, the
 * welcome card, and the two channels it feeds (card for the customer, prompt
 * section for the model).
 *
 * The gate's contract is mostly about what it must NOT do: block session
 * creation, throw on a broken workspace, spawn the C toolchain, or bind a
 * change on the customer's behalf. Those are the assertions below.
 *
 * `apply()` is exercised against a hand-rolled context rather than a booted
 * Cordis tree: `mount.spec.ts` already covers real plugin mounting, and a real
 * `commands.execute` needs a real session with an open turn — the very
 * constraint the gate is designed around (§18.3.3).
 */

import { chmod, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { describe, expect, it } from 'vitest'
import { ProjectionStore } from '../src/projection.ts'
import {
  WELCOME_COMMAND,
  apply,
  probeMountFlags,
  probeToolchain,
  renderProbeLines,
  renderWelcomeCard,
  resetSessionGateCache,
  resolveStartupBinding,
  runSessionGate,
  sessionGateLogLine,
  sessionGateSection,
  type ToolchainProbe,
} from '../src/session-gate.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Empty workspace: a directory, no `.baf`, no Git. */
async function emptyWorkspace(): Promise<string> {
  resetSessionGateCache()
  return mkdtemp(join(tmpdir(), 'baf-gate-'))
}

/**
 * Seed one change by appending projection events directly.
 * @param root - workspace root.
 * @param changeId - change id to create.
 * @param archive - append `change-archived` so the row turns terminal.
 */
async function seedChange(root: string, changeId: string, archive = false): Promise<string> {
  const store = new ProjectionStore({ workspaceRoot: root })
  const intake = {
    changeId,
    kind: 'new-requirement' as const,
    mode: 'full-go' as const,
    affectedScope: 'cross-module' as const,
    confidence: 0.9,
    reasonCodes: ['new-requirement'],
    openspecRequired: true,
    requiresUserConfirmation: true,
    confirmation: 'confirmed' as const,
    summary: '种子变更',
  }
  const opened = await store.append(changeId, 0, () => ({ type: 'intake-classified', intake }))
  if (!archive) return changeId
  await store.append(changeId, opened.status.projectionVersion, () => ({ type: 'change-archived' }))
  return changeId
}

/**
 * Remove a workspace fixture.
 *
 * The row-install test lets the fire-and-forget `runSessionGate` run against
 * the workspace it is about to delete, so a `.baf/projection` mkdir may still
 * be in flight on Windows; `maxRetries` covers exactly that race.
 * @param root - workspace root to delete.
 */
async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}

/** The prompt-section descriptor shape the gate installs. */
type SectionShape = { name: string; order: number; text: () => string }

/** Item lookup by probe key. */
function itemOf(probe: ToolchainProbe, key: string) {
  const item = probe.items.find(i => i.key === key)
  if (item === undefined) throw new Error(`probe item ${key} missing`)
  return item
}

describe('BAF session gate · toolchain probe (§18.3.2)', () => {
  it('reports every row on a bare workspace and never throws', async () => {
    const root = await emptyWorkspace()
    try {
      const probe = await probeToolchain(root, { guardMounted: true, qualityMounted: true })
      expect(probe.items.map(i => i.key)).toEqual([
        'workspace', 'baseline', 'git', 'openspec', 'c-toolchain', 'guard', 'version',
      ])
      // The workspace itself is the one thing a session cannot be opened without.
      expect(itemOf(probe, 'workspace').state).toBe('ok')
      // Missing pieces are rows with a remedy, not exceptions.
      const baseline = itemOf(probe, 'baseline')
      expect(baseline.state).toBe('missing')
      expect(baseline.hint).toBeTruthy()
      expect(itemOf(probe, 'git').state).toBe('missing')
      // The OpenSpec row's *state* depends on whether this machine happens to
      // have a fast `openspec` CLI (✗ when absent, ? when it outran the item
      // budget) — the layout verdict and the remedy do not.
      const openspec = itemOf(probe, 'openspec')
      expect(['missing', 'unknown']).toContain(openspec.state)
      expect(openspec.detail).toContain('openspec/changes 缺失')
      expect(openspec.hint).toContain('baf scaffold')
      expect(itemOf(probe, 'guard').state).toBe('ok')
    } finally {
      await cleanup(root)
    }
  })

  it('degrades a non-existent workspace to a missing row', async () => {
    resetSessionGateCache()
    const probe = await probeToolchain(join(tmpdir(), 'baf-gate-does-not-exist-9f3a'))
    expect(itemOf(probe, 'workspace').state).toBe('missing')
    expect(itemOf(probe, 'workspace').hint).toContain('工作区')
  })

  it('flags unmounted guard/quality rows by name', async () => {
    const root = await emptyWorkspace()
    try {
      const probe = await probeToolchain(root, { guardMounted: false, qualityMounted: false })
      const mounts = itemOf(probe, 'guard')
      expect(mounts.state).toBe('missing')
      expect(mounts.detail).toContain('baf-guard')
      expect(mounts.detail).toContain('baf-quality')
    } finally {
      await cleanup(root)
    }
  })

  it('never spawns the C toolchain at session open (§21.4)', async () => {
    const root = await emptyWorkspace()
    try {
      await mkdir(join(root, '.baf'), { recursive: true })
      await writeFile(join(root, '.baf', 'baseline.yml'), await readFile(FIXTURE_BASELINE, 'utf8'), 'utf8')
      resetSessionGateCache()
      const probe = await probeToolchain(root)
      const c = itemOf(probe, 'c-toolchain')
      expect(c.state).toBe('unknown')
      expect(c.detail).toContain('未探测')
      expect(c.hint).toBeUndefined()
      // A real baseline flips the baseline row to ok — the same probe answers both.
      expect(itemOf(probe, 'baseline').state).toBe('ok')
    } finally {
      await cleanup(root)
    }
  })

  it('serves a cached probe inside the TTL so /baf-welcome reuses the gate run', async () => {
    const root = await emptyWorkspace()
    try {
      const first = await probeToolchain(root, { guardMounted: true, qualityMounted: true })
      const second = await probeToolchain(root, { guardMounted: true, qualityMounted: true })
      expect(second).toBe(first)
      // Mount flags are part of the cache key: a different composition is a
      // different answer, not a stale one.
      const other = await probeToolchain(root, { guardMounted: false, qualityMounted: false })
      expect(other).not.toBe(first)
    } finally {
      await cleanup(root)
    }
  })

  it('renders §20.5 marks per state and leaves info rows symbol-free', async () => {
    const root = await emptyWorkspace()
    try {
      const probe = await probeToolchain(root)
      const lines = renderProbeLines(probe)
      expect(lines[0]).toMatch(/^✓ workspace/)
      expect(lines.some(l => l.startsWith('✗ baseline'))).toBe(true)
      expect(lines.some(l => l.startsWith('? C 工具链'))).toBe(true)
      expect(lines.some(l => l.startsWith('版本'))).toBe(true)
      // A hint rides on its own indented line so the column stays scannable.
      expect(lines.some(l => l.includes('\n  ↳ '))).toBe(true)
    } finally {
      await cleanup(root)
    }
  })

  it('degrades a hung external command to ? instead of ✗ or a stalled first screen', async () => {
    // "绝不因为一个外部命令卡住首屏" (§18.3.2) is only observable against a
    // command that actually hangs, so the test ships one on PATH. A stub is
    // the only honest way to reach this branch: a real slow CLI is not
    // reproducible across machines.
    const root = await emptyWorkspace()
    const bin = await mkdtemp(join(tmpdir(), 'baf-gate-bin-'))
    const original = process.env.PATH
    try {
      if (process.platform === 'win32') {
        await writeFile(join(bin, 'openspec.cmd'), '@ping -n 3 127.0.0.1 >nul\r\n', 'utf8')
      } else {
        await writeFile(join(bin, 'openspec'), '#!/bin/sh\nsleep 3\n', 'utf8')
        await chmod(join(bin, 'openspec'), 0o755)
      }
      process.env.PATH = `${bin}${delimiter}${original ?? ''}`
      const probe = await probeToolchain(root, { timeoutMs: 300 })
      const openspec = itemOf(probe, 'openspec')
      // Undetected, never a false ✗: the CLI might be installed and merely slow.
      expect(openspec.state).toBe('unknown')
      expect(openspec.detail).toContain('超时')
      // The detected half still carries its remedy — that is the customer's
      // actual next step.
      expect(openspec.hint).toContain('scaffold')
    } finally {
      process.env.PATH = original
      await cleanup(root)
      await rm(bin, { recursive: true, force: true })
    }
  })
})

describe('BAF session gate · startup binding (§18.3.1)', () => {
  it('reports no binding on an untouched workspace and writes no change log', async () => {
    const root = await emptyWorkspace()
    try {
      const binding = await resolveStartupBinding(root)
      expect(binding.actives).toEqual([])
      const card = renderWelcomeCard({ cwd: root, probe: await probeToolchain(root), binding })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('无未完成工作流')
      expect(card.text).toContain('直接描述你的需求')
      // Reading the index may create the empty index document, but it must
      // never mint a change: the gate is read-only (§18.6 guard 4).
      const files = await readdir(join(root, '.baf', 'projection'))
      expect(files.filter(f => f.endsWith('.jsonl'))).toEqual([])
    } finally {
      await cleanup(root)
    }
  })

  it('reports one active change without binding it, and prints the command to type', async () => {
    const root = await emptyWorkspace()
    try {
      await seedChange(root, 'CHG-ONE')
      const binding = await resolveStartupBinding(root)
      expect(binding.actives.map(c => c.changeId)).toEqual(['CHG-ONE'])
      const card = renderWelcomeCard({ cwd: root, probe: await probeToolchain(root), binding })
      expect(card.text).toContain('检测到未完成工作流 CHG-ONE')
      expect(card.text).toContain('继续还是新开？')
      expect(card.text).toContain('/baf-go continue 继续 CHG-ONE')
      expect(card.text).toContain('本会话尚未绑定')
    } finally {
      await cleanup(root)
    }
  })

  it('asks which one when several are active, and never picks', async () => {
    const root = await emptyWorkspace()
    try {
      await seedChange(root, 'CHG-A')
      await seedChange(root, 'CHG-B')
      const binding = await resolveStartupBinding(root)
      expect(binding.actives).toHaveLength(2)
      const card = renderWelcomeCard({ cwd: root, probe: await probeToolchain(root), binding })
      expect(card.text).toContain('检测到 2 条未完成工作流')
      expect(card.text).toContain('/baf-go change=<id>')
    } finally {
      await cleanup(root)
    }
  })

  it('excludes archived changes from the binding count', async () => {
    const root = await emptyWorkspace()
    try {
      await seedChange(root, 'CHG-DONE', true)
      await seedChange(root, 'CHG-LIVE')
      const binding = await resolveStartupBinding(root)
      expect(binding.actives.map(c => c.changeId)).toEqual(['CHG-LIVE'])
    } finally {
      await cleanup(root)
    }
  })

  it('still renders a usable card when everything is missing (session must open)', async () => {
    resetSessionGateCache()
    const root = join(tmpdir(), 'baf-gate-missing-71c2')
    const probe = await probeToolchain(root)
    const binding: Awaited<ReturnType<typeof resolveStartupBinding>> = { actives: [] }
    const card = renderWelcomeCard({ cwd: root, probe, binding })
    expect(card.kind).toBe('success')
    expect(card.text).toContain('BAF 模式已就绪')
    // The card always ends with something the customer can actually do.
    expect(card.text).toContain('【下一步】')
  })
})

describe('BAF session gate · two channels (§18.3.3)', () => {
  it('logs one §20.4 line with metadata only', async () => {
    const root = await emptyWorkspace()
    try {
      await seedChange(root, 'CHG-LOG')
      const snapshot = {
        cwd: root,
        probe: await probeToolchain(root),
        binding: await resolveStartupBinding(root),
        at: Date.UTC(2026, 8, 17, 4, 5, 6),
      }
      const line = sessionGateLogLine(snapshot)
      expect(line).toMatch(/^\[baf\] 2026-09-17T04:05:06\.000Z - session baf:session-gate binding=one actives=1 change=CHG-LOG /)
      expect(line).toContain('workspace=ok')
      expect(line).toContain('baseline=missing')
      expect(line).toContain('c_toolchain=unknown')
      // Metadata only — the requirement summary must not leak into the log.
      expect(line).not.toContain('种子变更')
    } finally {
      await cleanup(root)
    }
  })

  it('tells the model the probe is still running, then reports the facts', async () => {
    const root = await emptyWorkspace()
    const fresh = sessionGateSection(root)
    expect(fresh).toContain('体检进行中')
    expect(fresh).toContain(root)
    try {
      await seedChange(root, 'CHG-SEC')
      const commands = { execute: async () => undefined }
      await runSessionGate(fakeCtx({ commands, logger: quietLogger() }), fakeAgent(root))
      const settled = sessionGateSection(root)
      expect(settled).toContain('本会话事实')
      expect(settled).toContain('CHG-SEC')
      expect(settled).toContain('客户未确认前')
      // Policy travels with the facts: the model is told the gates exist.
      expect(settled).toContain('两个确认门')
      expect(settled).toContain('分类确认前不得修改源码')
    } finally {
      await cleanup(root)
    }
  })

  it('delivers the card by executing /baf-welcome, and only logs when it is absent', async () => {
    const root = await emptyWorkspace()
    try {
      const calls: string[] = []
      const logs: string[] = []
      const warnings: string[] = []
      await runSessionGate(
        fakeCtx({
          commands: { execute: async (_agent: unknown, line: string) => { calls.push(line); return {} } },
          logger: { info: (m: string) => { logs.push(m) }, warn: (m: string) => { warnings.push(m) } },
        }),
        fakeAgent(root),
      )
      expect(calls).toEqual([WELCOME_COMMAND])
      expect(logs).toHaveLength(1)
      expect(logs[0]).toContain('session baf:session-gate')
      expect(warnings).toEqual([])

      // Unregistered command → warn, never throw: a broken composition must
      // still leave an openable session (§17.7 R19).
      resetSessionGateCache()
      const second: string[] = []
      await runSessionGate(
        fakeCtx({
          commands: { execute: async () => undefined },
          logger: { info: () => undefined, warn: (m: string) => { second.push(m) } },
        }),
        fakeAgent(root),
      )
      expect(second.join('\n')).toContain('/baf-welcome is not registered')
    } finally {
      await cleanup(root)
    }
  })

  it('contains an exploding command layer instead of failing the session', async () => {
    const root = await emptyWorkspace()
    try {
      const warnings: string[] = []
      await runSessionGate(
        fakeCtx({
          commands: { execute: async () => { throw new Error('registry exploded') } },
          logger: { info: () => undefined, warn: (m: string) => { warnings.push(m) } },
        }),
        fakeAgent(root),
      )
      expect(warnings.join('\n')).toContain('registry exploded')
    } finally {
      await cleanup(root)
    }
  })
})

describe('BAF session gate · row install (§18.3)', () => {
  it('installs one prompt section per existing agent and per new agent', async () => {
    const root = await emptyWorkspace()
    try {
      const sections: SectionShape[] = []
      const handlers = new Map<string, (payload: { agent: Agent }) => void>()
      const disposed: string[] = []
      const existing = fakeAgent(root, sections, disposed)
      const ctx = fakeCtx({
        agents: { list: () => [existing] },
        commands: { execute: async () => ({}) },
        logger: quietLogger(),
        on: ((event: string, handler: (payload: { agent: Agent }) => void) => {
          handlers.set(event, handler)
        }),
        effect: () => undefined,
      })
      apply(ctx)
      expect(sections.map(s => s.name)).toEqual(['baf:session-gate'])
      expect(sections[0]?.order).toBe(605)

      // The section is synchronous and reads the cached snapshot, so a second
      // agent's provider must answer without awaiting anything.
      const laterSections: SectionShape[] = []
      const later = fakeAgent(root, laterSections, disposed, 'later')
      handlers.get('agent/created')?.({ agent: later })
      expect(laterSections).toHaveLength(1)
      expect(typeof laterSections[0]?.text()).toBe('string')

      handlers.get('agent/disposed')?.({ agent: later })
      expect(disposed).toContain('later')
    } finally {
      await cleanup(root)
    }
  })

  it('reads mount flags from the composition', () => {
    const present = fakeCtx({ get: () => ({}) })
    expect(probeMountFlags(present)).toEqual({ guardMounted: true, qualityMounted: true })
    const absent = fakeCtx({ get: () => undefined })
    expect(probeMountFlags(absent)).toEqual({ guardMounted: false, qualityMounted: false })
  })
})

// ── fakes ───────────────────────────────────────────────────────────────────

/** A logger that keeps nothing, for tests that only care about control flow. */
function quietLogger() {
  return { info: () => undefined, warn: () => undefined }
}

/** A context carrying only the services the gate actually reads. */
function fakeCtx(overrides: Record<string, unknown>): Context {
  return { get: () => undefined, ...overrides } as unknown as Context
}

/**
 * An agent whose `session.header.cwd` is the workspace and whose `ctx.inject`
 * records the prompt section, mirroring `file-reference-local`'s contract.
 * @param root - workspace root the agent is bound to.
 * @param sections - collected section descriptors.
 * @param disposed - collected ids of disposed fibers.
 * @param id - agent identity for the dispose assertion.
 */
function fakeAgent(
  root: string,
  sections: SectionShape[] = [],
  disposed: string[] = [],
  id = 'fake',
): Agent {
  return {
    session: { header: { cwd: root } },
    ctx: {
      inject: (_services: readonly string[], run: (scope: { systemPrompt: { section: (s: unknown) => void } }) => void) => {
        run({ systemPrompt: { section: (s) => { sections.push(s as SectionShape) } } })
        return { dispose: async () => { disposed.push(id) } }
      },
    },
  } as unknown as Agent
}
