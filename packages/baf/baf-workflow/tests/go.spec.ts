/**
 * Phase 8.7 `baf-go` coordinator (§18): session binding, the routing table,
 * and the two mandatory customer-confirmation gates.
 *
 * These are end-to-end against a real workspace (`.baf/baseline.yml` + a Git
 * repo), because `driveGo` builds its own pipeline from `cwd` via
 * `pipelineFor()` — the same way the slash handler and the CLI do. A mocked
 * pipeline would test a path no surface uses.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ProjectionStore } from '../src/projection.ts'
import { driveClassify } from '../src/command-drives.ts'
import { driveGo, type GateAsk } from '../src/go-coordinator.ts'
import { focusFor, type FocusStore } from '../src/session-focus.ts'
import { completeTask, recordTouched } from '../src/stages/implement.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A description the heuristic classifier lands on full-go-path + public-api. */
const DESCRIPTION = 'feat: add export public API for reports'

/** Workspace fixture: baseline + a real Git repo (drift anchor + full-go-path open). */
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'baf-go-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    await readFile(FIXTURE_BASELINE, 'utf8'),
    'utf8',
  )
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return { root, focus: focusFor(root) }
}

/** Author a change artifact the way a model's guarded writes would. */
async function author(root: string, changeId: string, file: string, body: string): Promise<void> {
  const path = join(root, 'openspec', 'changes', changeId, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

/** The single active change in the workspace. */
async function activeId(root: string): Promise<string> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  const actives = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
  const only = actives[0]
  if (actives.length !== 1 || only === undefined) {
    throw new Error(`expected exactly 1 active change, got ${actives.length}`)
  }
  return only.changeId
}

/** Status of one change. */
async function statusOf(root: string, changeId: string) {
  return new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)
}

/** Every event type in the log, in order. */
async function eventTypes(root: string, changeId: string): Promise<string[]> {
  const { events } = await new ProjectionStore({ workspaceRoot: root }).readEvents(changeId)
  return events.map(e => e.type)
}

/** Classify → confirm → open, the two steps a customer does on the intake card. */
async function startChange(root: string, focus: FocusStore): Promise<string> {
  await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
  const changeId = await activeId(root)
  await driveClassify(root, `confirm change=${changeId}`)
  return changeId
}

/** Walk to `design` in-progress: the state immediately before gate A. */
async function reachDesign(root: string, focus: FocusStore): Promise<string> {
  const changeId = await startChange(root, focus)
  // open completed → install the clarify template.
  await driveGo({ cwd: root, focus })
  await author(root, changeId, 'clarify.md', [
    '# Clarify',
    '',
    '## Blocking questions',
    '',
    '- None outstanding; output format settled with the customer (2026-09-08).',
    '',
    '## Acceptance criteria',
    '',
    '- npm test exports CSV with a header row',
    '',
  ].join('\n'))
  // clarify gate passes → design template installed.
  await driveGo({ cwd: root, focus })
  return changeId
}

/** Walk to the gate A card. */
async function reachGateA(root: string, focus: FocusStore): Promise<string> {
  const changeId = await reachDesign(root, focus)
  await author(root, changeId, 'design.md', [
    '# Design',
    '',
    '## Approach',
    '',
    'Add src/export.ts exposing exportReportsCsv(rows): string, called from the CLI.',
    '',
    '## References',
    '',
    '- src/export.ts',
    '',
  ].join('\n'))
  const gate = await driveGo({ cwd: root, focus })
  expect(gate.text).toContain('等待你的确认')
  return changeId
}

/** Walk from gate A through plan to the implement stage. */
async function reachImplement(root: string, focus: FocusStore): Promise<string> {
  const changeId = await reachGateA(root, focus)
  // The unlock: the customer types baf-go again.
  await driveGo({ cwd: root, focus })
  await author(root, changeId, 'plan.md', [
    '# Plan',
    '',
    '## Tasks',
    '',
    '- t1 Implement the CSV serializer in src/export.ts',
    '',
  ].join('\n'))
  await author(root, changeId, 'plan.json', `${JSON.stringify({
    tasks: [{
      id: 't1',
      title: 'Implement serializer',
      files: ['src/export.ts'],
      verify: ['npm test'],
      rollback: 'git revert HEAD',
    }],
    allowlist: ['src/export.ts'],
    touched: [],
  }, null, 2)}\n`)
  await author(root, changeId, 'proposal.md', [
    '# Add report export API',
    '',
    '## Why',
    '',
    'Users need CSV export for monthly reports.',
    '',
  ].join('\n'))
  await author(root, changeId, 'tasks.md', '# Tasks\n\n- [x] t1 Implement serializer\n')
  await driveGo({ cwd: root, focus })
  return changeId
}

/** Walk from implement to the gate B card (verify passes). */
async function reachGateB(root: string, focus: FocusStore): Promise<string> {
  const changeId = await reachImplement(root, focus)
  await recordTouched(root, { changeId, file: 'src/export.ts' })
  await completeTask(root, changeId, 't1')
  const card = await driveGo({ cwd: root, focus })
  expect(card.text).toContain('等待你的确认')
  return changeId
}

describe('session binding (§18.3.1 / §18.6)', () => {
  it('reports "nothing unfinished" when unbound and no change exists', async () => {
    const { root, focus } = await setup()
    try {
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('没有进行中的工作流')
      expect(card.text).toContain('不需要写 /baf-go + 需求')
      expect(focus.get()).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs the intake classifier when an unbound session states a requirement', async () => {
    const { root, focus } = await setup()
    try {
      const card = await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      // The classifier card is a success card carrying the pending decision —
      // §18.2 keeps 确认/补充/退出 on the card, not behind `baf-go`.
      expect(card.kind).toBe('success')
      expect(card.text).toContain('分类卡')
      expect(card.text).toContain('mode: full-go-path')
      // The change it minted is bound to this session: it was created by this
      // conversation, so the next `baf-go` needs no `continue` word.
      const changeId = await activeId(root)
      expect(focus.get()).toBe(changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a second requirement in a session that already carries a change', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const card = await driveGo({ cwd: root, rawInput: 'fix: also rename the CLI flag', focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('本会话已有工作流')
      expect(card.text).toContain(changeId)
      expect(focus.get()).toBe(changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('never adopts a lone unfinished change without an explicit continue', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      // A fresh session on the same cwd: same projection, empty focus.
      const fresh = focusFor(`${root}-other-session`)
      const card = await driveGo({ cwd: root, focus: fresh })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('请选择本会话的工作流')
      expect(card.text).toContain('/baf-go continue')
      expect(fresh.get()).toBeUndefined()
      expect(await activeId(root)).toBe(changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('binds on an explicit continue and remembers the focus afterwards', async () => {
    const { root } = await setup()
    try {
      const seed = focusFor(root)
      await startChange(root, seed)
      const fresh = focusFor(`${root}-session-2`)
      const bound = await driveGo({ cwd: root, rawInput: 'continue', focus: fresh })
      expect(fresh.get()).toBe(await activeId(root))
      // continue binds and drives in one step: the next resting point is the
      // clarify template, not another binding card.
      expect(bound.text).toContain('clarify 已进入')
      const again = await driveGo({ cwd: root, focus: fresh })
      expect(again.text).not.toContain('请选择本会话的工作流')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('lists every candidate when several changes are active', async () => {
    const { root, focus } = await setup()
    try {
      const first = await startChange(root, focus)
      // A second active change can only arrive from outside `baf-go` (§18.6.5
      // refuses to mint one in a session that already carries a change), so it
      // is created through the standalone open surface — the same thing the
      // Tab「新建变更」button does.
      const { driveOpen } = await import('../src/command-drives.ts')
      await driveOpen(root, DESCRIPTION)
      const second = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.changeId !== first)
        .map(c => c.changeId)[0]
      expect(second).toBeDefined()

      const card = await driveGo({ cwd: root, focus: focusFor(`${root}-session-3`) })
      expect(card.kind).toBe('error')
      expect(card.text).toContain(first)
      expect(card.text).toContain(second ?? '')
      expect(card.text).toContain('/baf-go change=<changeId>')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses an explicit change that does not exist', async () => {
    const { root, focus } = await setup()
    try {
      const card = await driveGo({ cwd: root, rawInput: 'change=chg-nope', focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('指定变更不可用')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('routing table (§18.4.2)', () => {
  it('replays the classification card while intake is unconfirmed', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      const card = await driveGo({ cwd: root, focus })
      expect(card.text).toContain('当前分类')
      expect(card.text).toContain('confirmation: pending')
      // Read-only: replaying must not confirm anything on the customer's behalf.
      expect((await statusOf(root, changeId)).intake?.confirmation).toBe('pending')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('finishes a confirmed-but-unopened intake instead of demanding the command', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      // Confirm intake without letting driveClassify run open (the state a
      // crash between the two writes leaves behind).
      const { confirmIntake } = await import('../src/workflow-service.ts')
      await confirmIntake(store, changeId, 'user')
      expect((await statusOf(root, changeId)).current).toBe('intake')

      const card = await driveGo({ cwd: root, focus })
      expect(card.text).toContain('已确认并进入 open')
      expect((await statusOf(root, changeId)).nodes.open).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('installs the clarify template when clarify has not started', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('clarify 已进入 · 模板已装')
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('clarify')
      expect(status.nodes.clarify).toBe('in-progress')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops at the clarify gate when the artifact is still a template', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      await driveGo({ cwd: root, focus })
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('clarify 裁决门未通过')
      expect(card.text).toContain('stage_incomplete')
      // The gate refusal never advances the projection.
      expect((await statusOf(root, changeId)).current).toBe('clarify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('advances clarify → design once the artifact is authored', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('design')
      expect(status.nodes.clarify).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports implement progress without moving the projection', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachImplement(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('implement 进行中 · 等模型')
      expect(card.text).toContain('stage_incomplete')
      expect(card.text).toContain('0/1 tasks done')
      expect((await statusOf(root, changeId)).current).toBe('implement')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs verify and parks on gate B', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateB(root, focus)
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('verify')
      expect(status.nodes.verify).toBe('completed')
      expect(await eventTypes(root, changeId)).toContain('awaiting-confirm')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('archives only after the gate B confirmation', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateB(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('检查已确认 · 已归档')
      expect((await statusOf(root, changeId)).terminal).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses to drive a terminal change', async () => {
    const { root, focus } = await setup()
    try {
      await reachGateB(root, focus)
      await driveGo({ cwd: root, focus })
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('当前变更已终态')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('confirmation gates (§18.5)', () => {
  it('stops after design and does not start plan', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateA(root, focus)
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('design')
      expect(status.nodes.design).toBe('completed')
      expect(status.nodes.plan).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats the second baf-go as the gate A confirmation', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateA(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('设计已确认 · 已进入计划阶段')
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('plan')
      expect(status.nodes.plan).toBe('in-progress')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('parks once and consumes the unlock with a single further call', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateA(root, focus)
      const store = new ProjectionStore({ workspaceRoot: root })
      const parks = async () => (await store.readEvents(changeId)).events
        .filter(e => e.type === 'awaiting-confirm')
      const first = await parks()
      expect(first.map(e => (e as { gate: string }).gate)).toEqual(['design-to-plan'])

      // The unlock is one call: it moves to plan and does *not* re-write the
      // park event, so a customer holding down /baf-go cannot inflate the log.
      const unlocked = await driveGo({ cwd: root, focus })
      expect(unlocked.text).toContain('设计已确认 · 已进入计划阶段')
      expect(await parks()).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('names both gate cards with the waiting-for-confirmation headline', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await author(root, changeId, 'design.md', '# Design\n\n## Approach\n\nAdd src/export.ts.\n')
      const gateA = await driveGo({ cwd: root, focus })
      // §22.14-D: gate A now renders the registered §22 card verbatim. The
      // headline is `等待你的确认 · <title> · 点本行展开/折叠详情` and the
      // body lists the registered options in plain language. The customer-facing card no
      // longer carries an internal status token as a separate
      // token — it is the registered `设计确认门` card itself.
      expect(gateA.kind).toBe('success')
      expect(gateA.text).toContain('等待你的确认')
      expect(gateA.text).toContain('设计文档已经写好')
      expect(gateA.text).toContain('【选项】')
      expect(gateA.text).toContain('/baf-go')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('interactive gate dialog (§22.17)', () => {
  /** The pop calls the coordinator made, for asserting which gate popped. */
  interface PopRecord { gateId: string; changeId?: string }

  /** An ask channel that answers one registry option and records every pop. */
  function askAnswer(optionId: string, label: string, pops: PopRecord[]): GateAsk {
    return async (gate) => {
      pops.push({ gateId: gate.gateId, ...(gate.changeId === undefined ? {} : { changeId: gate.changeId }) })
      return { kind: 'answered', optionId, label }
    }
  }

  /** An ask channel where the customer pauses (closed / skipped the dialog). */
  const askPause: GateAsk = async () => ({ kind: 'paused', reason: 'dismissed' })

  it('pops gate A on park and a confirmed dialog advances to plan', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await author(root, changeId, 'design.md', '# Design\n\n## Approach\n\nAdd src/export.ts.\n')
      const pops: PopRecord[] = []
      const card = await driveGo({ cwd: root, focus, ask: askAnswer('confirm', '确认设计，进入计划', pops) })
      expect(pops).toEqual([{ gateId: 'design-confirm', changeId }])
      expect(card.text).toContain('设计已确认 · 已进入计划阶段')
      expect((await statusOf(root, changeId)).current).toBe('plan')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a paused dialog keeps the workflow parked and hints how to continue', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await author(root, changeId, 'design.md', '# Design\n\n## Approach\n\nAdd src/export.ts.\n')
      const card = await driveGo({ cwd: root, focus, ask: askPause })
      expect(card.text).toContain('等待你的确认')
      expect(card.text).toContain('/baf-go 重新弹出确认框')
      expect(card.text).toContain('/baf-go-confirm 不弹框直接继续')
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('design')
      expect(status.nodes.plan).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a parked gate re-pops on the next /baf-go instead of silently unlocking', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await author(root, changeId, 'design.md', '# Design\n\n## Approach\n\nAdd src/export.ts.\n')
      // First pop: paused. The workflow stays parked at gate A.
      await driveGo({ cwd: root, focus, ask: askPause })
      // Second /baf-go must POP AGAIN (the customer revives the dialog), and
      // this time the confirm click continues the workflow.
      const pops: PopRecord[] = []
      const card = await driveGo({ cwd: root, focus, ask: askAnswer('confirm', '确认设计，进入计划', pops) })
      expect(pops).toEqual([{ gateId: 'design-confirm', changeId }])
      expect(card.text).toContain('设计已确认 · 已进入计划阶段')
      expect((await statusOf(root, changeId)).current).toBe('plan')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pops gate B and archives on the confirm click', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateB(root, focus)
      const pops: PopRecord[] = []
      const card = await driveGo({ cwd: root, focus, ask: askAnswer('confirm', '确认归档', pops) })
      expect(pops).toEqual([{ gateId: 'verify-archive', changeId }])
      expect(card.text).toContain('检查已确认 · 已归档')
      expect((await statusOf(root, changeId)).terminal).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pops the intake gate and confirms the classification on click', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      const pops: PopRecord[] = []
      const card = await driveGo({ cwd: root, focus, ask: askAnswer('confirm-full', '确认 · 完整流程', pops) })
      expect(pops).toEqual([{ gateId: 'intake-classify', changeId }])
      const status = await statusOf(root, changeId)
      expect(status.intake?.confirmation).toBe('confirmed')
      expect(card.text).not.toContain('重新弹出确认框')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('§22.17 I: the intake pop carries the classifier judgment', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      const seen: { gateId: string; judgment?: { mode: string } }[] = []
      await driveGo({
        cwd: root,
        focus,
        ask: async (gate) => {
          seen.push({
            gateId: gate.gateId,
            ...(gate.judgment === undefined ? {} : { judgment: gate.judgment }),
          })
          return { kind: 'paused', reason: 'dismissed' }
        },
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]?.gateId).toBe('intake-classify')
      expect(seen[0]?.judgment?.mode).toBe('full-go-path')
      // The paused branch replays the classification card, change untouched.
      expect((await statusOf(root, changeId)).intake?.confirmation).toBe('pending')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('/baf-go-confirm passes gate A on the first call without any dialog', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await author(root, changeId, 'design.md', '# Design\n\n## Approach\n\nAdd src/export.ts.\n')
      const pops: PopRecord[] = []
      const card = await driveGo({
        cwd: root,
        focus,
        confirm: true,
        ask: askAnswer('confirm', '确认设计，进入计划', pops), // must never be consulted
      })
      expect(pops).toEqual([])
      expect(card.text).toContain('设计已确认 · 已进入计划阶段')
      expect((await statusOf(root, changeId)).current).toBe('plan')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('/baf-go-confirm continues a parked gate B by archiving', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateB(root, focus)
      const card = await driveGo({ cwd: root, focus, confirm: true })
      expect(card.text).toContain('检查已确认 · 已归档')
      expect((await statusOf(root, changeId)).terminal).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('an uninitialized workspace surfaces the scaffold gate instead of "nothing to do"', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-go-scaffold-'))
    const focus = focusFor(root)
    try {
      const card = await driveGo({ cwd: root, focus })
      expect(card.text).toContain('工作区需要初始化')
      expect(card.text).toContain('初始化工作区')
      expect(card.text).toContain('暂不初始化')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('an uninitialized workspace pops scaffold; confirm mode dispatches the init', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-go-scaffold-'))
    const focus = focusFor(root)
    try {
      // Dialog path: the init click routes to driveScaffold — no scaffold
      // adapter in this test composition, so the drive's own "service not
      // mounted" card proves the dispatch happened.
      const pops: PopRecord[] = []
      const viaDialog = await driveGo({ cwd: root, focus, ask: askAnswer('init', '初始化工作区', pops) })
      expect(pops).toEqual([{ gateId: 'scaffold' }])
      expect(viaDialog.text).toContain('初始化服务没有加载')
      // Confirm mode takes the same positive path without any dialog.
      const viaConfirm = await driveGo({ cwd: root, focus, confirm: true })
      expect(viaConfirm.text).toContain('初始化服务没有加载')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a paused scaffold dialog hints the two continue paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-go-scaffold-'))
    const focus = focusFor(root)
    try {
      const card = await driveGo({ cwd: root, focus, ask: askPause })
      expect(card.text).toContain('工作区需要初始化')
      expect(card.text).toContain('/baf-go 重新弹出确认框')
      expect(card.text).toContain('/baf-go-confirm 不弹框直接继续')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('drift handoff (§19.4)', () => {
  it('hands a drifted change to the resume candidate card', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      // Move HEAD so the detector's locked revision no longer matches.
      await execFileAsync('git', [
        '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
        'commit', '-q', '--allow-empty', '-m', 'unrelated change',
      ], { cwd: root })
      const pipeline = (await import('../src/command-drives.ts')).pipelineFor
      await (await pipeline(root)).driveDriftStage(changeId)

      const card = await driveGo({ cwd: root, focus })
      expect(card.text).toContain('请选择要退回的阶段')
      expect(card.text).toContain('/baf-workflow-resume design')
      expect(card.text).toContain('git-revision-changed')
      // Never auto-picks: the projection stays parked in drift.
      expect((await statusOf(root, changeId)).current).toBe('drift')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('forwards an explicit resume target named on the same command', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      await execFileAsync('git', [
        '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
        'commit', '-q', '--allow-empty', '-m', 'unrelated change',
      ], { cwd: root })
      const { pipelineFor } = await import('../src/command-drives.ts')
      await (await pipelineFor(root)).driveDriftStage(changeId)

      const card = await driveGo({ cwd: root, focus, rawInput: 'clarify' })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('已退回到 clarify')
      expect((await statusOf(root, changeId)).current).toBe('clarify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
