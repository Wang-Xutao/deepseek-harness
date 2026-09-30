/**
 * 【变更】2026-09-23 (demo2 user issue #1) requirement-park tests: the
 * parked-requirement memory and its continuation.
 *
 * The reproduced incident: requirement stated on an uninitialized workspace →
 * scaffold gate → 暂不初始化 → /baf-go re-pops → 初始化工作区 → silence (no
 * dialog, no model wake; /baf-go then answers 「没有进行中的工作流」 forever).
 * These tests pin the fix: the statement is parked pre-scaffold, and the
 * continuation carries it through 新建工作流 → 分类确认 → a dispatched work
 * order at the authoring rest — the whole chain card-driven, no re-typing.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import {
  clearParkedRequirement,
  continueParkedRequirement,
  parkRequirement,
  peekParkedRequirement,
  resetParkedRequirements,
} from '../src/requirement-park.ts'
import { askGateDialogQueued } from '../src/gate-dialog.ts'
import { resetScaffoldOffer, scaffoldDialogOffered } from '../src/scaffold-offer.ts'
import { ProjectionStore } from '../src/projection.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A `userQuestions` service double that records asks and replays canned answers. */
function serviceWith(replies: AskUserQuestionAnswer[]): {
  calls: AskUserQuestionRequest[]
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
} {
  const calls: AskUserQuestionRequest[] = []
  let n = 0
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      const reply = replies[n]
      n += 1
      if (reply === undefined) throw Object.assign(new Error('cancelled'), { code: 'ASK_CANCELLED' })
      return reply
    },
  }
}

function selected(label: string): AskUserQuestionAnswer {
  return { answers: [{ id: 'x', selected: [label] }] }
}

/** A live-agent double: scoped userQuestions + the §18.4.2 followup channel. */
function agentWith(service: unknown, sessionId: string): {
  session: { header: { id: string; cwd?: string } }
  ctx: { get(name: string): unknown }
  followup(message: UserMessage): void
  status: 'idle' | 'running'
  orders: UserMessage[]
} {
  const orders: UserMessage[] = []
  return {
    session: { header: { id: sessionId } },
    ctx: { get: (name: string) => (name === 'userQuestions' ? service : undefined) },
    followup(message: UserMessage) { orders.push(message) },
    status: 'idle',
    orders,
  }
}

/** The host ctx double `resolveUserQuestions` falls back to. */
function ctxOf(): Context {
  return { get: () => undefined } as unknown as Context
}

/** Write the baseline + git anchor (the go.spec recipe). */
async function initWorkspace(root: string): Promise<void> {
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
}

async function activeCount(root: string): Promise<number> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  return index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned').length
}

async function currentOf(root: string): Promise<string> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  const active = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
  return active[0] === undefined ? '' : String(active[0].current)
}

const REQUIREMENT = '重构 ecum 模块，把状态机拆出来'

describe('parked-requirement continuation (demo2 issue #1)', () => {
  it('carries a parked requirement through 新建 → 分类确认 → dispatched open order', { timeout: 120_000 }, async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      // The incident shape: the statement arrived while the workspace was
      // still uninitialized, so nothing could mint it.
      parkRequirement('sess-demo2', REQUIREMENT)
      await initWorkspace(root)

      // 新建工作流 → 确认 · 完整流程
      const service = serviceWith([selected('新建工作流'), selected('确认 · 完整流程')])
      const agent = agentWith(service, 'sess-demo2')
      const card = await continueParkedRequirement(ctxOf(), agent, root)

      // The requirement is quoted on the create dialog.
      expect(service.calls[0]?.questions[0]?.id).toBe('new-workflow')
      expect(service.calls[0]?.questions[0]?.detail).toContain(REQUIREMENT)
      // The classify dialog carries the classifier's judgment.
      expect(service.calls[1]?.questions[0]?.question).toBe('需求分类待确认')
      expect(service.calls[1]?.questions[0]?.detail).toContain('系统初步判断')
      // The chain minted exactly one change and opened it; the returned card
      // merges the classify confirm with the follow-up drive's honest open
      // rest state (refusal naming the gap + the dispatched order marker).
      // 【变更】2026-09-23 (demo1 issue #1): the OVERALL kind is success — the
      // follow's refusal card is the normal dispatched resting state, and the
      // old `error` kind made the session row read「分类确认被拒绝」.
      expect(card?.kind).toBe('success')
      expect(card?.text).toContain('已确认并进入 open')
      expect(card?.text).toContain('open 裁决门未通过')
      expect(card?.text).toContain('已派单')
      expect(await activeCount(root)).toBe(1)
      expect(await currentOf(root)).toBe('open')
      // The model was woken: one work order queued for the proposal rest.
      expect(agent.orders).toHaveLength(1)
      expect(JSON.stringify(agent.orders[0])).toContain('【BAF 工单')
      // The parked statement is spent.
      expect(peekParkedRequirement('sess-demo2')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('暂不处理 keeps the requirement parked (unified cancel rule, demo3)', async () => {
    // demo3 user rule: BOTH cancel shapes — closing the dialog AND clicking
    // 暂不处理 — must leave the decision revivable by /baf-go. The park only
    // clears when the requirement settles (mint / conflict-advance).
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      parkRequirement('sess-hold', REQUIREMENT)
      await initWorkspace(root)
      const service = serviceWith([selected('暂不处理')])
      const agent = agentWith(service, 'sess-hold')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      expect(card?.text).toContain('暂不新建')
      expect(card?.text).toContain('/baf-go')
      expect(await activeCount(root)).toBe(0)
      expect(agent.orders).toHaveLength(0)
      expect(peekParkedRequirement('sess-hold')).toBe(REQUIREMENT)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a busy workspace re-offers the active-conflict dialog instead of discarding the park', async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: an earlier running change',
        workspace: { root },
      })
      parkRequirement('sess-busy', REQUIREMENT)
      const service = serviceWith([])
      const agent = agentWith(service, 'sess-busy')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      // The collision dialog popped with the requirement quoted…
      expect(service.calls[0]?.questions[0]?.question).toBe('已有进行中的变更')
      expect(service.calls[0]?.questions[0]?.detail).toContain(REQUIREMENT)
      // …and the closed dialog KEEPS the park for the next /baf-go.
      expect(card?.text).toContain('客户暂未选择')
      expect(card?.text).toContain('/baf-go')
      expect(peekParkedRequirement('sess-busy')).toBe(REQUIREMENT)
      expect((await store.readStatus(intake.changeId)).terminal).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('conflict 放弃现有变更 frees the workspace and continues straight into the create leg', { timeout: 120_000 }, async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake: earlier } = await createWorkflowService({ store }).intake({
        description: 'feat: an earlier running change',
        workspace: { root },
      })
      parkRequirement('sess-abandon', REQUIREMENT)
      // 放弃现有变更 → 新建工作流 → 确认 · 完整流程
      const service = serviceWith([
        selected('放弃现有变更，稍后再提新需求'),
        selected('新建工作流'),
        selected('确认 · 完整流程'),
      ])
      const agent = agentWith(service, 'sess-abandon')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      // The earlier change is abandoned (audit kept), the requirement became
      // the new change and opened, and the work order woke the model.
      expect((await store.readStatus(earlier.changeId)).terminal).toBe('abandoned')
      expect(card?.text).toContain('已确认并进入 open')
      expect(await currentOf(root)).toBe('open')
      expect(agent.orders.length).toBeGreaterThanOrEqual(1)
      expect(peekParkedRequirement('sess-abandon')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('conflict 继续推进现有变更 drives the running change and spends the park', async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'feat: an earlier running change',
        workspace: { root },
      })
      parkRequirement('sess-advance', REQUIREMENT)
      const service = serviceWith([selected('继续推进现有变更')])
      const agent = agentWith(service, 'sess-advance')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      // The click re-dispatched /baf-go for the running change (its intake is
      // unconfirmed → the classification re-surfaces for it)…
      expect(card?.text).toBeTruthy()
      expect(peekParkedRequirement('sess-advance')).toBeUndefined()
      expect(await activeCount(root)).toBe(1)
      expect((await store.readIndex()).changes.some(c => c.changeId === intake.changeId)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a closed create dialog keeps the requirement parked (/baf-go re-pops it)', async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      parkRequirement('sess-pause', REQUIREMENT)
      await initWorkspace(root)
      const service = serviceWith([]) // every ask throws ASK_CANCELLED
      const agent = agentWith(service, 'sess-pause')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      expect(card?.text).toContain('客户暂未选择')
      expect(card?.text).toContain('/baf-go')
      expect(await activeCount(root)).toBe(0)
      expect(peekParkedRequirement('sess-pause')).toBe(REQUIREMENT)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a closed classify dialog parks the change at intake and names the re-pop surface', async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      parkRequirement('sess-q', REQUIREMENT)
      await initWorkspace(root)
      const service = serviceWith([selected('新建工作流')])
      const agent = agentWith(service, 'sess-q')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      expect(card?.text).toContain('分类待确认')
      expect(card?.text).toContain('gate=intake-classify')
      expect(await currentOf(root)).toBe('intake')
      expect(agent.orders).toHaveLength(0)
      expect(peekParkedRequirement('sess-q')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('nothing parked, no service, and uninitialized workspace all decline', async () => {
    resetParkedRequirements()
    const bare = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    const idle = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      // No service mounted → no dialog channel → decline.
      expect(await continueParkedRequirement(ctxOf(), undefined, idle)).toBeUndefined()
      // Nothing parked.
      const idleService = serviceWith([])
      expect(await continueParkedRequirement(ctxOf(), agentWith(idleService, 'sess-x'), idle)).toBeUndefined()
      expect(idleService.calls).toHaveLength(0)
      // Uninitialized — the scaffold decision is still the live one.
      parkRequirement('sess-bare', REQUIREMENT)
      const bareService = serviceWith([])
      expect(await continueParkedRequirement(ctxOf(), agentWith(bareService, 'sess-bare'), bare)).toBeUndefined()
      expect(bareService.calls).toHaveLength(0)
      expect(peekParkedRequirement('sess-bare')).toBe(REQUIREMENT)
    } finally {
      await rm(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
      await rm(idle, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a running model reports busy and nothing is queued (mid-turn parity)', async () => {
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      parkRequirement('sess-run', REQUIREMENT)
      await initWorkspace(root)
      const service = serviceWith([selected('新建工作流'), selected('确认 · 完整流程')])
      const agent = agentWith(service, 'sess-run')
      agent.status = 'running'
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      // The confirm still landed (projection-driven), but no order was queued.
      expect(await currentOf(root)).toBe('open')
      expect(agent.orders).toHaveLength(0)
      expect(card?.text).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('park/clear round-trips and blank text never parks', () => {
    resetParkedRequirements()
    parkRequirement('s', '  ')
    expect(peekParkedRequirement('s')).toBeUndefined()
    parkRequirement('s', ' x ')
    expect(peekParkedRequirement('s')).toBe('x')
    clearParkedRequirement('s')
    expect(peekParkedRequirement('s')).toBeUndefined()
    resetParkedRequirements()
  })

  it('shares the park across module-instance boundaries (bundle-split regression, demo2 re-test)', async () => {
    // The 2026-09-23 web re-test failure: tsdown bundles each preset entry
    // independently, so the module-level PARKED map existed once per bundle —
    // baf-auto-pop's park was invisible to the commands bundle's continuation
    // and the post-scaffold flow went silent. The host-memory anchor fixes it;
    // this test simulates the split with a second module instance (query
    // string ⇒ own module state, same globalThis) and pins the sharing.
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      // @ts-expect-error — vitest treats the query string as a DISTINCT module
      // instance (the tsdown bundle-split simulation); the host tsconfig
      // cannot resolve the specifier, and the spec never runs under that
      // build face anyway.
      const copy = await import('../src/requirement-park.ts?bundle-copy') as typeof import('../src/requirement-park.ts')
      // Parked through the OTHER instance (the auto-pop bundle's copy)…
      copy.parkRequirement('sess-split', REQUIREMENT)
      expect(peekParkedRequirement('sess-split')).toBe(REQUIREMENT)
      // …continued through THIS instance (the commands bundle's copy): the
      // 暂不处理 card proves the chain ran off the shared park.
      const service = serviceWith([selected('暂不处理')])
      const agent = agentWith(service, 'sess-split')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      expect(card?.text).toContain('暂不新建')
      expect(await activeCount(root)).toBe(0)
      copy.resetParkedRequirements()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('records the scaffold offer at the queue choke point (double-pop regression)', async () => {
    // askGateDialogQueued is the single point every scaffold dialog passes
    // through (gate-ask bootstrap / orchestrator / /baf-go / Tab) — the offer
    // must land on the SHARED marker so the orchestrator's turn-end
    // evaluation stands down after any channel already asked.
    resetParkedRequirements()
    resetScaffoldOffer()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      const service = serviceWith([])
      const agent = agentWith(service, 'sess-choke')
      expect(scaffoldDialogOffered('sess-choke')).toBe(false)
      await askGateDialogQueued(service as never, agent as never, { gateId: 'scaffold' }, { sessionId: 'sess-choke' })
      expect(scaffoldDialogOffered('sess-choke')).toBe(true)
      // Non-scaffold gates do not touch the marker.
      await askGateDialogQueued(service as never, agent as never, { gateId: 'new-workflow' }, { sessionId: 'sess-choke2' })
        .catch(() => undefined)
      expect(scaffoldDialogOffered('sess-choke2')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
      resetScaffoldOffer()
    }
  })

  it('a bug-fix classify confirm with extraArgs parks on the advance card; the confirm click dispatches the order', { timeout: 120_000 }, async () => {
    // The same follow-up through the raw resolve channel — this is the path
    // the Tab's bug-fix form (extraArgs) and the dialogs take.
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
      })
      const service = serviceWith([])
      const agent = agentWith(service, 'sess-bugfix')
      const { driveGateResolve } = await import('../src/command-drives.ts')
      const { makeGoDispatcher } = await import('../src/go-dispatch.ts')
      const dispatch = makeGoDispatcher(root, agent)
      const card = await driveGateResolve(
        root,
        'intake-classify',
        'confirm-bugfix',
        {},
        undefined,
        undefined,
        'gate-card',
        {
          changeId: intake.changeId,
          extraArgs: [
            'problem="Parser crashes on empty input"',
            'root-cause="Missing length guard"',
            'file="src/parser.c"',
            'test="tests/test_parser_empty.c"',
            'test-cmd="ctest -R parser_empty"',
          ],
          ...(dispatch === undefined ? {} : { dispatch }),
        },
      )
      // 【变更】2026-09-27 (web 验收·瞬时推进 round 2): the click itself never
      // crosses open→implement anymore — the model can prefill
      // plausible-looking fields the customer has not reviewed, so the
      // follow-up parks on the clipped advance card instead.
      expect(await currentOf(root)).toBe('open')
      expect(agent.orders).toHaveLength(0)
      expect(card.text).toContain('已确认并进入 open')
      expect(card.text).toContain('提案已完成 · 请确认推进')
      // The advance card's 确认 option is the customer review — it enters
      // implement and dispatches the regression-first work order.
      const advance = await driveGateResolve(
        root,
        'bugfix-open-advance',
        'advance',
        {},
        undefined,
        undefined,
        'gate-card',
        {
          changeId: intake.changeId,
          ...(dispatch === undefined ? {} : { dispatch }),
        },
      )
      expect(await currentOf(root)).toBe('implement')
      expect(agent.orders).toHaveLength(1)
      expect(JSON.stringify(agent.orders[0])).toContain('【BAF 工单')
      expect(advance.text).toContain('已进入 implement')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a full-go classify confirm reports success even though its follow parks at the open gate (demo1 issue #1)', { timeout: 120_000 }, async () => {
    // The demo1 misread: the classify confirm succeeded (full-go-path chosen
    // on the dialog), the follow-up driveGo parked at the open 裁决门 with the
    // work order just delivered — and the combined card inherited the follow's
    // `kind: 'error'`, so the session row read「分类确认 / 拒绝」with error
    // styling. The combined kind must stay success when the follow dispatched;
    // only a real failure keeps error.
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      // No feature/bug keywords → heuristic kind 'unknown', mode
      // 'clarify-required' — exactly the demo1「重构ecum模块」shape; the
      // customer then picks 完整流程 on the dialog (mode=full-go-path).
      const { intake } = await createWorkflowService({ store }).intake({
        description: '重构 ecum 模块',
        workspace: { root },
      })
      const service = serviceWith([])
      const agent = agentWith(service, 'sess-fullgo')
      const { driveGateResolve } = await import('../src/command-drives.ts')
      const { makeGoDispatcher } = await import('../src/go-dispatch.ts')
      const dispatch = makeGoDispatcher(root, agent)
      const card = await driveGateResolve(
        root,
        'intake-classify',
        'confirm-full',
        {},
        undefined,
        undefined,
        'gate-card',
        {
          changeId: intake.changeId,
          ...(dispatch === undefined ? {} : { dispatch }),
        },
      )
      expect(await currentOf(root)).toBe('open')
      // The order for the template proposal reached the model.
      expect(agent.orders).toHaveLength(1)
      expect(JSON.stringify(agent.orders[0])).toContain('【BAF 工单')
      // The card carries BOTH halves: the confirm outcome and the dispatched
      // resting state — and the OVERALL kind is success (the demo1 bug).
      expect(card.text).toContain('已确认并进入 open')
      expect(card.text).toContain('已派单')
      expect(card.kind).toBe('success')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a park already settled into the active change is spent, not re-offered as a conflict (demo1 issue #1 follow-up)', async () => {
    // Web-walk repro: the model's baf_gate_ask bootstrap minted the parked
    // statement (新建工作流 clicked) but the park survived; the customer's
    // next /baf-go then popped active-conflict against the very change the
    // statement spawned. The continuation must recognize the settled summary,
    // spend the park, and continue nothing.
    resetParkedRequirements()
    const root = await mkdtemp(join(tmpdir(), 'baf-req-park-'))
    try {
      await initWorkspace(root)
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: REQUIREMENT,
        workspace: { root },
      })
      expect(intake.confirmation).toBe('pending')
      // The statement is parked (as auto-pop would have) while the change it
      // spawned is already active.
      parkRequirement('sess-settled', REQUIREMENT)
      const service = serviceWith([])
      const agent = agentWith(service, 'sess-settled')
      const card = await continueParkedRequirement(ctxOf(), agent, root)
      expect(card).toBeUndefined()
      expect(service.calls).toHaveLength(0)
      expect(peekParkedRequirement('sess-settled')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
