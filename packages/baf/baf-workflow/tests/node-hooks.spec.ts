/**
 * 【变更】2026-10-19 (六问题批 4.1b): the per-node 状态脚本 engine — planning
 * (exit-from on forward advancement only, enter-to on every main-chain entry,
 * nothing on drift/terminal edges), the runner→command mapping and outcome
 * codes (redacted + truncated output), and the `enterStage` enforcement: a
 * failing script blocks the transition BEFORE `stage-entered` is recorded,
 * leaving a `transition-rejected` audit trail and the change on the previous
 * node.
 */

import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile, type BaselineManifest, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import type { QualityCommandResult, QualityExecutor } from '@deepseek-ai/dsh-baf-quality'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import {
  DEFAULT_HOOK_TIMEOUT_MS, hookCommand, planNodeHooks, runNodeHooks,
} from '../src/node-hooks.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Minimal status standing at `current` (planNodeHooks reads nothing else). */
const statusAt = (current: WorkflowStatus['current']): WorkflowStatus =>
  ({ current }) as WorkflowStatus

/** Baseline object with an in-memory hooks block (pipeline reads the object). */
function baselineWithHooks(hooks: NonNullable<BaselineManifest['hooks']>): Promise<BaselineManifest> {
  return loadBaselineFile(FIXTURE_BASELINE).then(baseline => ({ ...baseline, hooks }))
}

/** A passing executor result. */
const pass = (stdout = ''): QualityCommandResult => ({
  command: '', stdout, stderr: '', exitCode: 0, timedOut: false, cancelled: false,
  spawnError: null, durationMs: 3,
})

describe('planNodeHooks (transition → script plan)', () => {
  it('plans exit(from) then enter(to) on forward main-chain advancement', async () => {
    const baseline = await baselineWithHooks({
      nodes: {
        implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] },
        verify: { enter: ['scripts/enter-verify.mjs'] },
      },
    })
    expect(planNodeHooks(statusAt('implement'), 'verify', baseline)).toEqual([
      { kind: 'exit', node: 'implement', entry: 'scripts/build.sh' },
      { kind: 'exit', node: 'implement', entry: 'scripts/lint.ps1' },
      { kind: 'enter', node: 'verify', entry: 'scripts/enter-verify.mjs' },
    ])
  })

  it('never re-fires exit hooks on backward edges; enter(to) still runs', async () => {
    const baseline = await baselineWithHooks({
      nodes: {
        verify: { exit: ['scripts/check.sh'] },
        implement: { enter: ['scripts/re-enter.ps1'] },
      },
    })
    expect(planNodeHooks(statusAt('verify'), 'implement', baseline))
      .toEqual([{ kind: 'enter', node: 'implement', entry: 'scripts/re-enter.ps1' }])
  })

  it('fires nothing into drift, and enter(to) when resuming OUT of drift', async () => {
    const baseline = await baselineWithHooks({
      nodes: { drift: { enter: ['d.sh'], exit: ['d2.sh'] }, intake: { enter: ['i.sh'] } },
    })
    expect(planNodeHooks(statusAt('implement'), 'drift', baseline)).toEqual([])
    // T13 resume drift → intake: drift's own lists are ignored (not a
    // main-chain FROM), the restored node's enter hooks run.
    expect(planNodeHooks(statusAt('drift'), 'intake', baseline))
      .toEqual([{ kind: 'enter', node: 'intake', entry: 'i.sh' }])
  })

  it('returns an empty plan without a hooks block', async () => {
    const baseline = await loadBaselineFile(FIXTURE_BASELINE)
    expect(planNodeHooks(statusAt('implement'), 'verify', baseline)).toEqual([])
    expect(planNodeHooks(statusAt('implement'), 'verify')).toEqual([])
  })
})

describe('hookCommand (entry → shell line)', () => {
  const root = join('W:', 'ws')
  it('picks the runner by extension and quotes the absolute path', () => {
    expect(hookCommand('scripts/build.sh', root)).toBe(`sh "${join(root, 'scripts/build.sh')}"`)
    expect(hookCommand('scripts/lint.ps1', root))
      .toBe(`powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, 'scripts/lint.ps1')}"`)
    for (const entry of ['a.js', 'a.mjs', 'a.cjs']) {
      expect(hookCommand(entry, root)).toBe(`node "${join(root, entry)}"`)
    }
    expect(hookCommand('tools/check.exe', root)).toBe(`"${join(root, 'tools/check.exe')}"`)
  })
})

describe('runNodeHooks (sequential execution, fail-closed)', () => {
  const root = 'W:\\ws'

  /** Executor stub scripted per invocation. */
  const scripted = (results: readonly QualityCommandResult[]): { executor: QualityExecutor; commands: string[] } => {
    const commands: string[] = []
    let index = 0
    const executor: QualityExecutor = async (command, options) => {
      commands.push(command)
      expect(options.cwd).toBe(root)
      expect(options.timeoutMs).toBe(DEFAULT_HOOK_TIMEOUT_MS)
      const result = results[index] ?? pass()
      index += 1
      return { ...result, command }
    }
    return { executor, commands }
  }

  it('runs every script in order when all pass', async () => {
    const { executor, commands } = scripted([pass('ok1'), pass('ok2')])
    const outcome = await runNodeHooks(
      [
        { kind: 'exit', node: 'implement', entry: 'a.sh' },
        { kind: 'enter', node: 'verify', entry: 'b.ps1' },
      ],
      { workspaceRoot: root, executor },
    )
    expect(outcome.failure).toBeUndefined()
    expect(outcome.executed.map(run => run.passed)).toEqual([true, true])
    expect(commands).toEqual([hookCommand('a.sh', root), hookCommand('b.ps1', root)])
  })

  it('stops at the first failing script and reports a redacted, truncated payload', async () => {
    // Secret at the FRONT — it must be redacted before the 600-char cap
    // chops the tail; the long noise proves the cap engages at all.
    const noisy = `sk-abcdefghijklmnopqrst build failed ${'x'.repeat(2000)}`
    const { executor } = scripted([
      { ...pass(), exitCode: 2, stdout: noisy, stderr: '' },
    ])
    const outcome = await runNodeHooks(
      [
        { kind: 'exit', node: 'implement', entry: 'a.sh' },
        { kind: 'enter', node: 'verify', entry: 'b.ps1' },
      ],
      { workspaceRoot: root, executor },
    )
    expect(outcome.executed).toHaveLength(1)
    expect(outcome.failure).toMatchObject({
      kind: 'exit', node: 'implement', entry: 'a.sh', reasonCode: 'exit_code', exitCode: 2,
    })
    expect(outcome.failure?.output).toContain('build failed')
    expect(outcome.failure?.output).toContain('[REDACTED]')
    expect(outcome.failure?.output).not.toContain('sk-abcdefghijklmnopqrst')
    expect(outcome.failure?.output.length).toBeLessThan(700)
  })

  it('maps timeout / cancelled / spawn errors to their reason codes', async () => {
    for (const [result, reasonCode] of [
      [{ ...pass(), timedOut: true }, 'timeout'],
      [{ ...pass(), cancelled: true }, 'cancelled'],
      [{ ...pass(), spawnError: 'ENOENT' }, 'spawn_error'],
    ] as const) {
      const { executor } = scripted([result])
      const outcome = await runNodeHooks(
        [{ kind: 'enter', node: 'plan', entry: 'a.sh' }],
        { workspaceRoot: root, executor },
      )
      expect(outcome.failure?.reasonCode).toBe(reasonCode)
    }
  })

  it('returns immediately for an empty plan', async () => {
    expect(await runNodeHooks([], { workspaceRoot: root })).toEqual({ executed: [] })
  })
})

describe('enterStage enforcement (scripts gate the transition)', () => {
  /** Harness mirroring stages.spec, with injected hooks + hook executor. */
  async function setup(hooks: NonNullable<BaselineManifest['hooks']>, executor: QualityExecutor) {
    const root = await mkdtemp(join(tmpdir(), 'baf-hooks-'))
    const store = new ProjectionStore({ workspaceRoot: root })
    await mkdir(join(root, '.baf'), { recursive: true })
    await writeFile(join(root, '.baf', 'baseline.yml'), await readFile(FIXTURE_BASELINE, 'utf8'), 'utf8')
    const baseline = await baselineWithHooks(hooks)
    const pipeline = new StagePipeline({
      store, workspaceRoot: root, gitRevision: 'rev-1', baseline, hookExecutor: executor,
    })
    const service = createWorkflowService({ store })
    const { intake } = await service.intake({
      description: 'feat: add export API',
      workspace: { root },
      affectedScopeHint: 'public-api',
    })
    await confirmIntake(store, intake.changeId, 'user')
    await pipeline.driveOpenStage(intake.changeId, 'Add export API', 'slash')
    return { root, store, pipeline, changeId: intake.changeId }
  }

  const driveClarify = (pipeline: StagePipeline, changeId: string) =>
    pipeline.driveClarifyStage({
      changeId,
      questions: [{ question: 'Format?', answer: 'CSV', status: 'decided' }],
      acceptanceCriteria: ['exports CSV'],
    })

  it('blocks the transition on a failing exit script — rejected audit, no stage-entered, status unchanged', async () => {
    const commands: string[] = []
    const executor: QualityExecutor = async (command) => {
      commands.push(command)
      return { ...pass(), command, exitCode: 2, stderr: 'compile error' }
    }
    const { root, store, pipeline, changeId } = await setup(
      { nodes: { open: { exit: ['scripts/exit-open.ps1'] } } },
      executor,
    )
    try {
      await expect(driveClarify(pipeline, changeId)).rejects.toMatchObject({ code: 'node_hook_failed' })
      // The flow stays on the previous node.
      const status = await store.readStatus(changeId)
      expect(status.current).toBe('open')
      // The refusal is audited and the entry was never recorded.
      const events = (await store.readEvents(changeId)).events
      expect(events.at(-1)).toMatchObject({ type: 'transition-rejected', from: 'open', to: 'clarify' })
      expect(events.some(event => event.type === 'stage-entered' && event.node === 'clarify')).toBe(false)
      expect(commands).toEqual([hookCommand('scripts/exit-open.ps1', root)])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs exit(from) then enter(to) in order and records the entry when all pass', async () => {
    const commands: string[] = []
    const executor: QualityExecutor = async (command) => {
      commands.push(command)
      return { ...pass('ok'), command }
    }
    const { root, store, pipeline, changeId } = await setup(
      {
        nodes: {
          open: { exit: ['scripts/exit-open.ps1'] },
          clarify: { enter: ['scripts/enter-clarify.mjs'] },
        },
      },
      executor,
    )
    try {
      await driveClarify(pipeline, changeId)
      expect(commands).toEqual([
        hookCommand('scripts/exit-open.ps1', root),
        hookCommand('scripts/enter-clarify.mjs', root),
      ])
      expect((await store.readStatus(changeId)).current).toBe('clarify')
      const events = (await store.readEvents(changeId)).events
      expect(events.some(event => event.type === 'stage-entered' && event.node === 'clarify')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('carries the failing run in the error details payload', async () => {
    const executor: QualityExecutor = async command =>
      ({ ...pass(), command, exitCode: 1, stdout: 'boom' })
    const { root, pipeline, changeId } = await setup(
      { nodes: { clarify: { enter: ['scripts/enter-clarify.mjs'] } } },
      executor,
    )
    try {
      await expect(driveClarify(pipeline, changeId)).rejects.toMatchObject({
        code: 'node_hook_failed',
        details: {
          node: 'clarify',
          kind: 'enter',
          entry: 'scripts/enter-clarify.mjs',
          reasonCode: 'exit_code',
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
