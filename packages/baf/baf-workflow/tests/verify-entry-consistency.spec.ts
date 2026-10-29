/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): ONE verdict for 「may this
 * change enter verify?」, the 测试流 the transition runs itself, and the ONE
 * archive decision.
 *
 * The customer's three complaints (issue 9):
 * - 「弹出确认门『实现已完成 · 请确认进入验证』但是点击不了『确认推进』，报错」
 *   → the Tab's 推进 readiness and the coordinator's transition judged the
 *   entry differently; they now read the SAME verdict.
 * - 「测试流使能了但没有跑」 → the entry demanded evidence only the verify stage
 *   could produce (a deadlock); the transition now runs the chain itself, and
 *   the customer's explicit stage switches count as a configured flow.
 * - 「归档的弹窗也是弹了两次」 → the archive decision has ONE host entry point
 *   now, and it honours the baseline's `guard.requireHumanConfirmation`.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { QualityExecutor } from '@deepseek-ai/dsh-baf-quality'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { driveGo, driveArchiveDecision } from '../src/go-coordinator.ts'
import { buildWorkflowTabView } from '../src/tab-view.ts'
import { verifyEntryVerdict } from '../src/test-flow-gate.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { completeTask, recordTouched } from '../src/stages/implement.ts'
import { focusFor, type FocusStore } from '../src/session-focus.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/**
 * A workspace fixture: the baseline (optionally with a real `stack.test`) plus
 * the 测试流's per-stage switches (the file the settings canvas writes).
 */
async function setupWorkspace(options: {
  readonly realTest?: boolean
  readonly stagesEnabled?: boolean
} = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-verify-entry-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  const body = await readFile(FIXTURE_BASELINE, 'utf8')
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    options.realTest === true ? body.replace('test: <enterprise-tbd>', 'test: ceedling test') : body,
    'utf8',
  )
  if (options.stagesEnabled === true) {
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await writeFile(
      join(root, '.baf', 'quality', 'test-flow.json'),
      JSON.stringify({
        stages: {
          build: { enabled: true, haltOnError: true },
          test: { enabled: true, haltOnError: true },
          instrument: { enabled: true, haltOnError: true },
          report: { enabled: true, haltOnError: true },
          gate: { enabled: true, haltOnError: true },
          lint: { enabled: true, haltOnError: true },
          analyze: { enabled: true, haltOnError: true },
        },
      }, null, 2),
      'utf8',
    )
  }
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return root
}

/** Author a change artifact the way a model's guarded writes would. */
async function author(root: string, changeId: string, file: string, body: string): Promise<void> {
  const path = join(root, 'openspec', 'changes', changeId, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

/** The 检查单 the verify stage ticks item by item. */
async function writeChecklist(root: string, changeId: string, ticked: boolean): Promise<void> {
  await author(root, changeId, 'checklist.md', [
    '# Checklist',
    '',
    `- [${ticked ? 'x' : ' '}] npm test exports CSV with a header row`,
    `- [${ticked ? 'x' : ' '}] no console.error during the export run`,
    '',
  ].join('\n'))
}

/**
 * Walk a workspace to the implement rest with every task done — the resting
 * point whose only remaining question is 「may this change enter verify?」.
 */
async function walkToImplement(root: string): Promise<{ readonly changeId: string; readonly focus: FocusStore }> {
  const focus = focusFor(root)
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(join(root, '.baf', 'baseline.yml'))
  const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-1', baseline })
  const { intake } = await createWorkflowService({ store }).intake({
    description: 'feat: add export public API for reports',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  const changeId = intake.changeId
  await confirmIntake(store, changeId, 'user')
  await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
  await author(root, changeId, 'proposal.md', [
    '# Proposal — export public API for reports',
    '',
    '## Why',
    '',
    'Customers need to pull report data out of the CLI.',
    '',
    '## Scope',
    '',
    '- In: a public exportReportsCsv(rows) API',
    '- Out: any UI or format beyond CSV',
    '',
    '## Impact',
    '',
    'Adds src/export.ts; no public API change.',
    '',
  ].join('\n'))
  await pipeline.driveClarifyStage({
    changeId,
    questions: [],
    acceptanceCriteria: ['npm test exports CSV with a header row'],
  })
  // The design stage cites a real path — the reference must exist.
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'export.ts'), 'export {}\n', 'utf8')
  await pipeline.driveDesignStage({ changeId, approach: 'Approach', references: ['src/export.ts'] })
  await pipeline.drivePlanStage({
    changeId,
    tasks: [{
      id: 't1',
      title: 'Implement the CSV serializer',
      files: ['src/export.ts'],
      verify: ['npm test'],
      rollback: 'git revert HEAD',
    }],
    allowlist: ['src/export.ts'],
  }, 'slash')
  await author(root, changeId, 'plan.md', '# Plan\n\n## Tasks\n\n- t1 Implement the CSV serializer\n')
  await author(root, changeId, 'plan.json', `${JSON.stringify({
    tasks: [{
      id: 't1',
      title: 'Implement the CSV serializer',
      files: ['src/export.ts'],
      verify: ['npm test'],
      rollback: 'git revert HEAD',
    }],
    allowlist: ['src/export.ts'],
    touched: [],
  }, null, 2)}\n`)
  await author(root, changeId, 'tasks.md', '# Tasks\n\n- [x] t1 Implement the CSV serializer\n')
  await pipeline.enterImplementStage(changeId, 'slash')
  await recordTouched(root, { changeId, file: 'src/export.ts' })
  await completeTask(root, changeId, 't1')
  return { changeId, focus }
}

/** The 测试流's two durable reports, green. */
async function writeGreenReports(root: string): Promise<void> {
  await mkdir(join(root, '.baf', 'reports'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'reports', 'ut-coverage.json'),
    JSON.stringify({ passed: true, line: 92, minimum: 80 }),
    'utf8',
  )
  await writeFile(
    join(root, '.baf', 'reports', 'static-analysis.json'),
    JSON.stringify({ passed: true, errors: 0 }),
    'utf8',
  )
}

/** A 测试流 executor that leaves the green durable reports behind. */
function greenExecutor(): QualityExecutor {
  return async (command, options) => {
    await writeGreenReports(options.cwd)
    return {
      command,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      cancelled: false,
      spawnError: null,
      durationMs: 1,
    }
  }
}

/** A 测试流 executor whose every step fails (the toolchain is missing). */
function redExecutor(): QualityExecutor {
  return async command => ({
    command,
    stdout: '',
    stderr: "'baf-quality' is not recognized as an internal or external command",
    exitCode: 1,
    timedOut: false,
    cancelled: false,
    spawnError: null,
    durationMs: 1,
  })
}

/** The change's live status. */
async function statusOf(root: string, changeId: string) {
  return new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)
}

/** The event types of one change's log. */
async function eventTypes(root: string, changeId: string): Promise<string[]> {
  const { events } = await new ProjectionStore({ workspaceRoot: root }).readEvents(changeId)
  return events.map(event => event.type)
}

describe('the shared verify-entry verdict (用户问题 9 · 点不了还报错)', () => {
  it('a change whose checklist is NOT ready reports ready: false with the checklist reason', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId } = await walkToImplement(root)
      const verdict = await verifyEntryVerdict({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
      })
      expect(verdict.ready).toBe(false)
      // The REAL blocker, named — not a generic 「未就绪」.
      expect(verdict.missing.join('\n')).toContain('验证检查单未就绪：checklist.md 不存在')
      expect(verdict.checklist.ok).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a change whose checklist IS ready reports ready: true', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const verdict = await verifyEntryVerdict({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
      })
      expect(verdict.ready).toBe(true)
      expect(verdict.missing).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('the Tab readiness and the coordinator refusal name the SAME blocker', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const view = await buildWorkflowTabView(store, changeId)
      // The button may not promise an advance the coordinator would refuse.
      expect(view.advance?.ready).toBe(false)
      const missing = view.advance?.missing.join('\n') ?? ''
      expect(missing).toContain('验证检查单未就绪：checklist.md 不存在')

      // The coordinator refuses with the same lines.
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('验证检查单未就绪 · 不能开始验证')
      expect(card.text).toContain('验证检查单未就绪：checklist.md 不存在')
      // And the change never entered verify.
      expect((await statusOf(root, changeId)).current).toBe('implement')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('the Tab readiness flips to ready once the checklist is authored', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId } = await walkToImplement(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      expect((await buildWorkflowTabView(store, changeId)).advance?.ready).toBe(false)
      await writeChecklist(root, changeId, true)
      expect((await buildWorkflowTabView(store, changeId)).advance?.ready).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('the verify stage does not run while the checklist is not ready', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      await driveGo({ cwd: root, focus })
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('implement')
      expect(status.nodes.verify).not.toBe('completed')
      // No verify was entered at all.
      const { events: log } = await new ProjectionStore({ workspaceRoot: root }).readEvents(changeId)
      expect(log.some(event => event.type === 'stage-entered' && event.node === 'verify')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('the archive decision (用户问题 9 · 归档的弹窗弹了两次)', () => {
  it('the archive does not complete before the customer answers the verify-archive gate', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      // The verify runs and the change rests at the archive gate.
      const first = await driveGo({ cwd: root, focus })
      expect(first.text).toContain('验证已完成 · 请确认归档')
      expect((await statusOf(root, changeId)).terminal).toBeUndefined()
      expect(await eventTypes(root, changeId)).toContain('awaiting-confirm')

      // The customer's answer (the parked gate's tail event) archives.
      const second = await driveGo({ cwd: root, focus })
      expect(second.text).toContain('检查已确认 · 已归档')
      expect((await statusOf(root, changeId)).terminal).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('the archive is refused while a checklist box is still open', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, false)
      await driveGo({ cwd: root, focus })
      const card = await driveArchiveDecision({ cwd: root, changeId, source: 'tab' })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('检查单未全部确认 · 不能归档')
      expect((await statusOf(root, changeId)).terminal).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a second, concurrent archive request stands down instead of archiving twice', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      await driveGo({ cwd: root, focus })
      // The gate is parked — the answer is the next drive.
      const answered = await driveGo({ cwd: root, focus })
      expect(answered.text).toContain('检查已确认 · 已归档')
      expect((await statusOf(root, changeId)).terminal).toBe('completed')
      // A late duplicate request is a calm refusal, not a second archive.
      const again = await driveArchiveDecision({ cwd: root, changeId, source: 'tab' })
      expect(again.kind).toBe('success')
      expect(again.text).toContain('已归档')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('the 测试流 at the implement→verify transition (用户问题 9 · 测试流使能了但没有跑)', () => {
  it('a gated workspace runs the chain itself and advances on a green run', async () => {
    const root = await setupWorkspace({ realTest: true })
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const card = await driveGo({ cwd: root, focus, testFlowExecutor: greenExecutor() })
      // The entry no longer refuses: the chain ran and went green.
      expect(card.kind).not.toBe('error')
      expect((await statusOf(root, changeId)).current).toBe('verify')
      // The chain really ran — the durable reports exist.
      await expect(readFile(join(root, '.baf', 'reports', 'ut-coverage.json'), 'utf8')).resolves.toContain('"passed":true')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a gated workspace whose chain fails produces the failure card — no silent pass', async () => {
    const root = await setupWorkspace({ realTest: true })
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const card = await driveGo({ cwd: root, focus, testFlowExecutor: redExecutor() })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('测试流未通过 · 不能开始验证')
      // The toolchain failure is named, never a silent pass.
      expect(card.text).toContain('tool_missing')
      // The change stayed at implement — no verify ran.
      expect((await statusOf(root, changeId)).current).toBe('implement')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('explicitly enabled stages gate the workspace even with the baseline placeholder', async () => {
    const root = await setupWorkspace({ stagesEnabled: true })
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const verdict = await verifyEntryVerdict({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(verdict.testFlow.gated).toBe(true)
      expect(verdict.testFlow.ok).toBe(false)
      // The transition runs the chain — and the run's failure is reported.
      const card = await driveGo({ cwd: root, focus, testFlowExecutor: redExecutor() })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('测试流未通过 · 不能开始验证')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a workspace with no test flow at all is untouched by the whole flow', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId, focus } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const verdict = await verifyEntryVerdict({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(verdict.testFlow.gated).toBe(false)
      expect(verdict.testFlow.ok).toBe(true)
      // The transition is not blocked by any test-flow work.
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).not.toBe('error')
      expect((await statusOf(root, changeId)).current).toBe('verify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a workspace with no test flow configured never reads as 全部通过', async () => {
    const root = await setupWorkspace()
    try {
      const { changeId } = await walkToImplement(root)
      await writeChecklist(root, changeId, true)
      const store = new ProjectionStore({ workspaceRoot: root })
      const baseline = await loadBaselineFile(join(root, '.baf', 'baseline.yml'))
      // The quality stack IS wired — the test-flow row then reports the REAL
      // reason it did not run (the flow is not configured), not a missing tool.
      const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
        detect: async () => ({ available: true, compiler: 'gcc' }),
        runQuality: async input => ({
          schema: 1,
          baselineId: input.baseline.baselineId,
          workspace: input.workspace.root,
          toolVersions: { gcc: 'gcc 13' },
          checks: [{ id: 'build', passed: true }],
          artifacts: [],
          passed: true,
          diagnostics: [],
        }),
      }
      const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-1', baseline, stack })
      const driven = await pipeline.driveVerifyStage(changeId)
      if (driven.node !== 'verify') throw new Error('expected a verify drive')
      const flowRow = driven.result.report.checks.find(row => row.name === 'test-flow')
      expect(flowRow?.ok).toBe(true)
      expect(flowRow?.diagnostics.join('\n')).toContain('未执行真实测试')
      // The customer-facing verdict says so too — it never reads as 全部通过.
      const md = await readFile(join(root, 'openspec', 'changes', changeId, 'verify.md'), 'utf8')
      expect(md).toContain('未执行真实测试')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
