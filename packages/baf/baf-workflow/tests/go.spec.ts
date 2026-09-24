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
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ProjectionStore } from '../src/projection.ts'
import { driveAbandon, driveClassify } from '../src/command-drives.ts'
import { beginIntake } from '../src/begin-intake.ts'
import { driveGo, type GateAsk } from '../src/go-coordinator.ts'
import type { DispatchSignal, GoDispatch } from '../src/go-dispatch.ts'
import { DOC_REQUIREMENTS_ZH } from '../src/stages/gates.ts'
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
  // 【变更】2026-09-22 (user report #1): open runs the proposal gate now —
  // author the artifact the stage brief demands so the walkers below pass
  // open the way a real model turn would.
  await authorProposal(root, changeId)
  return changeId
}

/** A proposal that passes proposalGate (real Why/Scope/Impact content). */
async function authorProposal(root: string, changeId: string): Promise<void> {
  await author(root, changeId, 'proposal.md', [
    '# Proposal — export public API for reports',
    '',
    '## Why',
    '',
    'Customers need to pull report data out of the CLI into downstream spreadsheets without scraping stdout.',
    '',
    '## Scope',
    '',
    '- In: a public exportReportsCsv(rows) API plus wiring from the CLI',
    '- Out: any UI or format beyond CSV',
    '',
    '## Impact',
    '',
    'Adds src/export.ts; no existing public API changes; rollback is deleting the file.',
    '',
  ].join('\n'))
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

  it('adopts the lone unfinished change without a continue word', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      // A fresh session on the same cwd (host restart, or a change minted by
      // baf_gate_ask / auto-pop which never carried this session's focus):
      // a plain /baf-go binds and drives — the 2026-09-20 incident stranded
      // exactly this shape on a "请选择本会话的工作流" card whose only escape
      // was a word the customer had no reason to know.
      const fresh = focusFor(`${root}-other-session`)
      const card = await driveGo({ cwd: root, focus: fresh })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('clarify 已进入')
      expect(fresh.get()).toBe(changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('recovers a confirmed-but-blocked intake with a plain /baf-go (incident 3.jsonl)', async () => {
    const { root, focus } = await setup()
    try {
      // Mint while Git works, then hide it: the classify confirm records the
      // customer's click but the open drive is blocked — the change parks at
      // intake with confirmation=confirmed.
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      await rename(join(root, '.git'), join(root, '.git-away'))
      await expect(driveClassify(root, `confirm change=${changeId}`))
        .rejects.toMatchObject({ code: 'git_unavailable' })
      const parked = await statusOf(root, changeId)
      expect(parked.current).toBe('intake')
      expect(parked.intake?.confirmation).toBe('confirmed')

      // Environment healed: a plain /baf-go (fresh session, no continue word)
      // must retry the open — this is the exact command the customer typed
      // when the workflow "would not move".
      await rename(join(root, '.git-away'), join(root, '.git'))
      const card = await driveGo({ cwd: root, focus: focusFor(`${root}-recovered`) })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('已确认并进入 open')
      expect((await statusOf(root, changeId)).current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('classify confirm without mode= on a clarify-required verdict refuses instead of half-confirming', async () => {
    const { root, focus } = await setup()
    try {
      // The incident's own wording: the classifier cannot settle a path.
      await driveGo({ cwd: root, rawInput: '重构ecum模块', focus })
      const changeId = await activeId(root)
      expect((await statusOf(root, changeId)).intake?.mode).toBe('clarify-required')

      const card = await driveClassify(root, `confirm change=${changeId}`)
      expect(card.kind).toBe('error')
      expect(card.text).toContain('分类器未定路径')
      expect(card.text).toContain('mode=full-go-path')
      // Nothing was half-confirmed — the deadlock state never forms.
      expect((await statusOf(root, changeId)).intake?.confirmation).toBe('pending')

      // With the path named, the same confirm runs end to end.
      const ok = await driveClassify(root, `confirm mode=full-go-path change=${changeId}`)
      expect(ok.kind).toBe('success')
      expect((await statusOf(root, changeId)).current).toBe('open')
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
      // §22.19 killed the double-mint path: a second active change can no
      // longer arrive through any drive — `beginIntake` refuses beside any
      // active change (the standalone open surface and the Tab 「新建变更」
      // button now refuse too). The multi-candidate binding card below still
      // exists for workspaces that ALREADY carry twins (legacy state, or an
      // operator seeding the projection by hand), so this test seeds the
      // second change through the raw domain service.
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: `${DESCRIPTION} (second, seeded directly)`,
        workspace: { root },
      })
      const second = intake.changeId
      expect(second).not.toBe(first)

      const card = await driveGo({ cwd: root, focus: focusFor(`${root}-session-3`) })
      expect(card.kind).toBe('error')
      expect(card.text).toContain(first)
      expect(card.text).toContain(second)
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

  /** Seed the workspace's second active change the only way left: the raw domain service. */
  async function seedTwin(root: string, description: string): Promise<string> {
    const store = new ProjectionStore({ workspaceRoot: root })
    const { createWorkflowService } = await import('../src/workflow-service.ts')
    const { intake } = await createWorkflowService({ store }).intake({
      description,
      workspace: { root },
    })
    return intake.changeId
  }

  it('§22.19 R4: multi-active with a dialog pops bind-workflow and binds the clicked change', async () => {
    const { root, focus } = await setup()
    try {
      const first = await startChange(root, focus)
      const second = await seedTwin(root, `${DESCRIPTION} (second, seeded directly)`)
      const seen: { gateId: string; bindCandidates?: readonly string[] }[] = []
      const ask: GateAsk = async (gate) => {
        seen.push({
          gateId: gate.gateId,
          ...(gate.bindCandidates === undefined ? {} : { bindCandidates: gate.bindCandidates }),
        })
        if (gate.gateId === 'bind-workflow') {
          return { kind: 'answered', optionId: `bind-${first}`, label: `接手 ${first}` }
        }
        return { kind: 'paused', reason: 'dismissed' }
      }
      const fresh = focusFor(`${root}-session-bind`)
      const card = await driveGo({ cwd: root, focus: fresh, ask })
      // Exactly one pop — the bind gate, workspace-scope (no changeId). The
      // click's `/baf-go change=<first>` dispatch carries no ask channel, so
      // routing chains to the picked change's next resting point (the clarify
      // template install) instead of popping another dialog.
      expect(seen).toEqual([{ gateId: 'bind-workflow', bindCandidates: [first, second] }])
      // The session remembers the pick: binding is recorded outside the inner
      // dispatch, which cannot see this session's focus cache.
      expect(fresh.get()).toBe(first)
      expect(card.text).toContain('clarify 已进入')
      expect(card.text).toContain(first)
      expect((await statusOf(root, first)).current).toBe('clarify')
      // The unpicked twin is untouched by the binding.
      expect((await statusOf(root, second)).current).toBe('intake')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('§22.19 R4: a paused bind dialog keeps the stop card and the revive hint', async () => {
    const { root, focus } = await setup()
    try {
      const first = await startChange(root, focus)
      const second = await seedTwin(root, `${DESCRIPTION} (second, seeded directly)`)
      const fresh = focusFor(`${root}-session-bind-paused`)
      const card = await driveGo({
        cwd: root,
        focus: fresh,
        ask: async () => ({ kind: 'paused', reason: 'dismissed' }),
      })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('请选择本会话的工作流')
      expect(card.text).toContain(first)
      expect(card.text).toContain(second)
      expect(card.text).toContain('/baf-go 重新弹出确认框')
      expect(fresh.get()).toBeUndefined()
      expect((await statusOf(root, first)).current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('§22.19 R4: an answer that maps to no live candidate degrades to the stop card', async () => {
    const { root, focus } = await setup()
    try {
      await startChange(root, focus)
      await seedTwin(root, `${DESCRIPTION} (second, seeded directly)`)
      const fresh = focusFor(`${root}-session-bind-bogus`)
      const card = await driveGo({
        cwd: root,
        focus: fresh,
        ask: async () => ({ kind: 'answered', optionId: 'bind-chg-bogus', label: '接手 chg-bogus' }),
      })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('请选择本会话的工作流')
      expect(fresh.get()).toBeUndefined()
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
      // The park card names the concrete artifact paths (5.jsonl: 「填 TODO」
      // without naming files left the customer blind).
      expect(card.text).toContain(`openspec/changes/${changeId}/proposal.md`)
      expect(card.text).toContain(`openspec/changes/${changeId}/clarify.md`)
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
      // The refusal names the work: artifact path + missing items + pass
      // conditions (2026-09-21 用户需求 1).
      expect(card.text).toContain('【产物】')
      expect(card.text).toContain(`openspec/changes/${changeId}/clarify.md`)
      expect(card.text).toContain('【缺什么】')
      expect(card.text).toContain('Acceptance criteria')
      expect(card.text).toContain('【满足条件】')
      // The gate refusal never advances the projection.
      expect((await statusOf(root, changeId)).current).toBe('clarify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops at the design gate with the artifact path and missing items (5.jsonl replay)', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('design 裁决门未通过')
      expect(card.text).toContain(`openspec/changes/${changeId}/design.md`)
      expect(card.text).toContain('【缺什么】')
      expect(card.text).toContain('Approach')
      expect((await statusOf(root, changeId)).current).toBe('design')
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

describe('explicit gate re-pop (/baf-go gate=<id>)', () => {
  it('re-pops the parked design-confirm gate with the continue hint, moving nothing', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateA(root, focus)
      const card = await driveGo({ cwd: root, rawInput: `gate=design-confirm change=${changeId}`, focus })
      // No ask channel (CLI shape): the plain §22 card + the revive hint.
      expect(card.text).toContain('设计已完成，请确认')
      expect(card.text).toContain('/baf-go 重新弹出确认框')
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('design')
      expect(status.nodes.plan).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pops the named confirm gate through the dialog channel', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachGateA(root, focus)
      const pops: { gateId: string }[] = []
      const ask: GateAsk = async (gate) => {
        pops.push({ gateId: gate.gateId })
        return { kind: 'paused', reason: 'cancelled' }
      }
      const card = await driveGo({ cwd: root, rawInput: `gate=design-confirm change=${changeId}`, focus, ask })
      expect(pops).toEqual([{ gateId: 'design-confirm' }])
      expect(card.text).toContain('设计已完成，请确认')
      expect((await statusOf(root, changeId)).current).toBe('design')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a gate the change is not resting on, naming the live ones', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      // design is in-progress with the template unfilled: no confirm gate yet.
      const card = await driveGo({ cwd: root, rawInput: `gate=design-confirm change=${changeId}`, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('当前不在此门上')
      expect(card.text).toContain('当前 design')
      // abandon is offered on every active change.
      expect(card.text).toContain('gate=abandon')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses an unregistered gate id and lists the registry', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const card = await driveGo({ cwd: root, rawInput: `gate=nope change=${changeId}`, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('未注册的门')
      expect(card.text).toContain('gate=nope')
      expect(card.text).toContain('gate=design-confirm')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pops the abandon gate from any active resting point', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachDesign(root, focus)
      const card = await driveGo({ cwd: root, rawInput: `gate=abandon change=${changeId}`, focus })
      expect(card.text).toContain('放弃当前变更')
      expect((await statusOf(root, changeId)).current).toBe('design')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses gate=scaffold on an initialized workspace', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const card = await driveGo({ cwd: root, rawInput: `gate=scaffold change=${changeId}`, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('工作区已初始化')
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
      // §22 user-request 2026-09-20: the first /baf-go after design finished
      // pops the user-facing `design-advance` card (not the machine-checked
      // `design-confirm`). The `confirm` click on `design-confirm` only fires
      // after the gate is already parked (the second /baf-go / every Tab
      // re-paint) — same source code path, two gate ids, matching the §22
      // user-facing vs machine-checked split.
      const pops: PopRecord[] = []
      const card = await driveGo({ cwd: root, focus, ask: askAnswer('advance', '确认进入计划', pops) })
      expect(pops).toEqual([{ gateId: 'design-advance', changeId }])
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

describe('open proposal gate (2026-09-22 user report #1 — 每阶段产物是推进前提)', () => {
  // 【变更】2026-09-22 (user report #1): the refusal card is the whole story —
  // the wake adapter is gone (the system never queues synthetic user
  // messages), so the missing list on the card is the model's cue, delivered
  // when the customer runs /baf-go or relays the card.
  it('refuses a plain /baf-go when proposal.md is still the template', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      await driveClassify(root, `confirm change=${changeId}`)
      // Leave the proposal exactly as the scaffold installed it: a TODO
      // template — the state change 170b was advanced out of by the Tab.
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('open 裁决门未通过')
      expect(card.text).toContain('proposal.md')
      expect(card.text).toContain('Why')
      expect((await statusOf(root, changeId)).current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses the Tab confirm path the same way (the button cannot skip the gate)', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      // Undo the walker's authored proposal — back to the raw template.
      const dir = join(root, 'openspec', 'changes', changeId)
      await writeFile(join(dir, 'proposal.md'), 'TODO: one paragraph on the user goal.\n', 'utf8')
      const card = await driveGo({
        cwd: root,
        focus,
        rawInput: `change=${changeId}`,
        confirm: true,
      })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('open 裁决门未通过')
      expect((await statusOf(root, changeId)).current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('advances open→clarify once the proposal passes its gate', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('clarify 已进入')
      expect((await statusOf(root, changeId)).current).toBe('clarify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
describe('/baf-go work-order dispatch (§18.4.2, 2026-09-22 客户决策)', () => {
  // The reported bug: the workflow rested at 「模型补产物」 and nothing woke
  // the model — `/baf-go` only re-rendered the refusal card, which the
  // customer read as a crash. Typing the command now hands the same session a
  // read-only order naming the gap.

  /** A dispatch double recording every signal it was handed. */
  function recorder(): { signals: DispatchSignal[]; dispatch: GoDispatch } {
    const signals: DispatchSignal[] = []
    return { signals, dispatch: (signal) => { signals.push(signal); return 'sent' } }
  }

  it('dispatches from the clarify template-install rest — the reported stuck point', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      // open → clarify: the template is installed and the workflow would
      // otherwise go silent here.
      const { signals, dispatch } = recorder()
      const card = await driveGo({ cwd: root, focus, dispatch, dispatchOrigin: 'customer' })
      expect(card.kind).toBe('success')
      expect(card.text).toContain('clarify 已进入 · 模板已装')
      expect(card.text).toContain('已派单')
      expect(card.text).toContain('工单已送达本会话')
      expect(signals).toEqual([{
        changeId,
        node: 'clarify',
        artifactPath: `openspec/changes/${changeId}/clarify.md`,
        missing: [...DOC_REQUIREMENTS_ZH.clarify],
      }])
      // Dispatch is ask-side: it writes nothing and moves nothing.
      const status = await statusOf(root, changeId)
      expect(status.current).toBe('clarify')
      expect(status.nodes.clarify).toBe('in-progress')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('dispatches the gate own missing list from a doc-gate refusal', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      await driveGo({ cwd: root, focus })
      // A clarify.md that is real prose but lacks the accepted-criteria
      // section: the refusal's 「缺什么」 list is exactly what the order must
      // carry, so the model fixes the section, not "the file".
      await author(root, changeId, 'clarify.md', '# Clarify\n\n## Blocking questions\n\n- none\n')
      const { signals, dispatch } = recorder()
      const card = await driveGo({ cwd: root, focus, dispatch, dispatchOrigin: 'customer' })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('clarify 裁决门未通过')
      expect(card.text).toContain('已派单')
      expect(signals).toHaveLength(1)
      expect(signals[0]?.node).toBe('clarify')
      expect(signals[0]?.missing.length).toBeGreaterThan(0)
      expect(signals[0]?.missing.join('\n')).toContain('Acceptance criteria')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('dispatches the open refusal with the proposal gap', async () => {
    const { root, focus } = await setup()
    try {
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      await driveClassify(root, `confirm change=${changeId}`)
      const { signals, dispatch } = recorder()
      const card = await driveGo({ cwd: root, focus, dispatch, dispatchOrigin: 'customer' })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('open 裁决门未通过')
      expect(card.text).toContain('已派单')
      expect(signals[0]?.node).toBe('open')
      expect(signals[0]?.artifactPath).toContain('proposal.md')
      expect(signals[0]?.missing.join('\n')).toContain('Why')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('dispatches the implement waiting rest with the ledger gap', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await reachImplement(root, focus)
      const { signals, dispatch } = recorder()
      const card = await driveGo({ cwd: root, focus, dispatch, dispatchOrigin: 'customer' })
      expect(card.kind).toBe('error')
      expect(card.text).toContain('implement 进行中 · 等模型')
      expect(card.text).toContain('已派单')
      expect(signals[0]?.node).toBe('implement')
      expect(signals[0]?.artifactPath).toBe(`openspec/changes/${changeId}/plan.json`)
      expect(signals[0]?.missing.join('\n')).toContain('done')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('never dispatches in confirm mode or from the Tab / gate-card surface', async () => {
    const { root, focus } = await setup()
    try {
      await startChange(root, focus)
      const confirmMode = recorder()
      await driveGo({ cwd: root, focus, confirm: true, dispatch: confirmMode.dispatch })
      expect(confirmMode.signals).toEqual([])

      const tabMode = recorder()
      await driveGo({
        cwd: root,
        rawInput: `change=${await activeId(root)}`,
        focus,
        source: 'tab',
        dispatch: tabMode.dispatch,
        dispatchOrigin: 'customer',
      })
      expect(tabMode.signals.length).toBeGreaterThan(0) // 2026-09-23: a Tab click IS a customer action

      // 2026-09-23 issue #1: dispatch without the customer-origin marker is
      // inert — host-internal re-drives (the orchestrator's verify drive)
      // reuse driveGo with source 'gate-card' and must never dispatch.
      const internal = recorder()
      await driveGo({
        cwd: root,
        rawInput: `change=${await activeId(root)}`,
        focus,
        source: 'gate-card',
        dispatch: internal.dispatch,
      })
      expect(internal.signals).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('renders the dispatch outcome in the next-step section', async () => {
    const { root, focus } = await setup()
    try {
      await startChange(root, focus)
      const deduped = await driveGo({ cwd: root, focus, dispatch: () => 'deduped', dispatchOrigin: 'customer' })
      expect(deduped.text).toContain('已派单 · 等待补齐')
      expect(deduped.text).toContain('同样缺口的工单已派过')

      const busy = await driveGo({ cwd: root, focus, dispatch: () => 'busy', dispatchOrigin: 'customer' })
      expect(busy.text).toContain('模型回合进行中')
      expect(busy.text).toContain('本单暂不重派')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('2026-09-23 issue #1: an answered advance DIALOG dispatches at the template rest it opens', async () => {
    // The live path the customer exercises: /baf-go pops clarify-advance,
    // the click resolves through resolveViaDialog → /baf-go-confirm → the
    // design template installs — and the SAME click must hand the model the
    // design order, or the freshly-installed template sits in silence.
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      const { signals, dispatch } = recorder()
      const ask: GateAsk = async (gate) => {
        expect(gate.gateId).toBe('clarify-advance')
        return { kind: 'answered', optionId: 'advance', label: '确认进入设计' }
      }
      // Hop 1: the open-advance dialog (startChange authored the proposal) —
      // its click installs the clarify template AND dispatches the clarify
      // order in the same breath.
      const askOpen: GateAsk = async (gate) => {
        expect(gate.gateId).toBe('open-advance')
        return { kind: 'answered', optionId: 'advance', label: '确认提案 · 进入澄清' }
      }
      const intoClarify = await driveGo({ cwd: root, focus, ask: askOpen, dispatch, dispatchOrigin: 'customer' })
      expect(intoClarify.text).toContain('clarify 已进入 · 模板已装')
      expect(intoClarify.text).toContain('已派单')
      expect(signals.at(-1)?.node).toBe('clarify')
      await author(root, changeId, 'clarify.md', [
        '# Clarify',
        '',
        '## Blocking questions',
        '',
        '- none',
        '',
        '## Acceptance criteria',
        '',
        '- `npm test` exits 0',
        '',
      ].join('\n'))
      // Hop 2: the clarify-advance dialog — its click installs the design
      // template AND dispatches the design order.
      const intoDesign = await driveGo({ cwd: root, focus, ask, dispatch, dispatchOrigin: 'customer' })
      expect(intoDesign.text).toContain('design 已进入')
      expect(intoDesign.text).toContain('已派单')
      expect(signals.at(-1)?.node).toBe('design')
      expect(signals.at(-1)?.artifactPath).toBe(`openspec/changes/${changeId}/design.md`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('2026-09-23 issue #1: confirm mode dispatches when the customer typed the command', async () => {
    const { root, focus } = await setup()
    try {
      await startChange(root, focus)
      // The customer typed /baf-go-confirm — the confirm path that advances
      // open→clarify now dispatches the template order like /baf-go would.
      const { signals, dispatch } = recorder()
      const card = await driveGo({ cwd: root, focus, confirm: true, dispatch, dispatchOrigin: 'customer' })
      expect(card.text).toContain('已派单')
      expect(signals[0]?.node).toBe('clarify')
      expect(signals[0]?.missing).toEqual([...DOC_REQUIREMENTS_ZH.clarify])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('2026-09-23 issue #4: a stale focus on a terminal change cannot dead-end /baf-go while an active change exists', async () => {
    const { root, focus } = await setup()
    try {
      const changeId = await startChange(root, focus)
      // Flip the focused change terminal while the focus cache still names it
      // (a completed walk, or an abandon driven from another surface).
      await driveAbandon(root, `confirm change=${changeId}`)
      expect(focus.get()).toBe(changeId)
      // Mint a second, active change — the index now holds one active row
      // beside the terminal one.
      const second = await beginIntake(root, '第二条需求：补充冒烟测试')
      expect(second.kind).toBe('minted')
      // /baf-go must bind the ACTIVE change, not the stale terminal focus —
      // the old rule dead-ended here with 「当前变更已终态」.
      const card = await driveGo({ cwd: root, focus })
      expect(card.text).not.toContain('已终态')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the pre-dispatch card text when no dispatcher is mounted (CLI/tests/confirm)', async () => {
    const { root, focus } = await setup()
    try {
      await startChange(root, focus)
      const card = await driveGo({ cwd: root, focus })
      expect(card.text).toContain('clarify 已进入 · 模板已装')
      expect(card.text).not.toContain('已派单')
      expect(card.text).toContain('模型填写上方产物里的 TODO')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
