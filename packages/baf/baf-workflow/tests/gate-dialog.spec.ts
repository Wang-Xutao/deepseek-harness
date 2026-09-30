/**
 * §22.17 gate-dialog unit tests: the popup channel's answer mapping.
 *
 * `askGateDialog` is the seam between the QuestionComposer's answer encoding
 * (selected labels / custom text / skip) and the §22 registry's option ids
 * that `driveGateResolve` validates. These tests pin that mapping with a
 * fake `userQuestions` service — no Cordis runtime, no UI.
 *
 * The coordinator-side behavior (pop on park, /baf-go-confirm, re-pop) lives
 * in `go.spec.ts` against real workspaces.
 */

import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { askGateDialog, makeGateAsk, toolDriveAdapters } from '../src/gate-dialog.ts'
import { apply } from '../src/gate-ask.ts'
import { driveOpen } from '../src/command-drives.ts'
import { ProjectionStore } from '../src/projection.ts'
import type { GateAskOutcome } from '../src/go-coordinator.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A `userQuestions` service double that records asks and replies canned answers. */
function fakeService(reply: AskUserQuestionAnswer | Error) {
  const calls: AskUserQuestionRequest[] = []
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      if (reply instanceof Error) throw reply
      return reply
    },
  }
}

/** An answer that selected exactly one label. */
function answered(label: string): AskUserQuestionAnswer {
  return { answers: [{ id: 'design-confirm', selected: [label] }] }
}

/** A `userQuestions` double with scripted per-ask replies (multi-leg dialogs). */
function scriptedService(replies: AskUserQuestionAnswer[]) {
  const calls: AskUserQuestionRequest[] = []
  let next = 0
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      const reply = replies[next]
      next += 1
      if (reply === undefined) throw new Error(`no scripted reply for ask #${next}`)
      return reply
    },
  }
}

/** A `bafScaffold` double that writes the fixture baseline like the real service. */
function fakeScaffoldService() {
  // Synchronous like the real adapter — `driveScaffold` calls it without await.
  return {
    scaffold(opts: { readonly workspaceRoot: string }) {
      mkdirSync(join(opts.workspaceRoot, '.baf'), { recursive: true })
      writeFileSync(
        join(opts.workspaceRoot, '.baf', 'baseline.yml'),
        readFileSync(FIXTURE_BASELINE, 'utf8'),
      )
      mkdirSync(join(opts.workspaceRoot, 'openspec', 'changes'), { recursive: true })
      return {
        kind: 'done',
        changes: {
          created: ['.baf/baseline.yml', 'openspec/changes/.gitkeep'],
          skipped: [] as string[],
          backedUp: [] as string[],
        },
      }
    },
  }
}

/** An error carrying a UserQuestionError-style `code`. */
function coded(code: string): Error {
  return Object.assign(new Error('user-questions failure'), { code })
}

/** A minimal structural Context double keyed on the service name. */
function ctxWith(services: Record<string, unknown>): Context {
  return { get: (name: string) => services[name] } as unknown as Context
}

/** Structural double of the tool `apply` registers (§22.17 I/J harnesses). */
interface ToolDouble {
  execute: (args: Record<string, unknown>, exec: { agent: unknown; signal?: AbortSignal }) => Promise<unknown>
}

/** Capture the tool `apply` registers, against a fake row ctx. */
function registerTool(): ToolDouble {
  let captured: ToolDouble | undefined
  const rowCtx = {
    tools: { register: (tool: unknown) => { captured = tool as ToolDouble } },
    get: () => undefined,
  } as unknown as Context
  apply(rowCtx)
  if (captured === undefined) throw new Error('apply did not register a tool')
  return captured
}

/** One execute() call with a live agent double whose realm carries the service. */
async function runTool(
  tool: ToolDouble,
  service: unknown,
  root: string,
  args: Record<string, unknown>,
  realm: Record<string, unknown> = {},
): Promise<string> {
  const agent = { session: { header: { cwd: root } }, ctx: ctxWith({ userQuestions: service, ...realm }) }
  const result = await tool.execute(args, { agent }) as { type: string; text: string }[]
  return result.map(block => block.text).join('\n')
}

/** Workspace fixture for tool-level tests: baseline + git repo (go.spec recipe). */
async function setupToolWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-gate-ask-'))
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
  return root
}

describe('§22.17 gate-dialog answer mapping', () => {
  it('maps a clicked label to the registry option id', async () => {
    const service = fakeService(answered('确认设计，进入计划'))
    const outcome = await askGateDialog(service, undefined, { gateId: 'design-confirm' })
    expect(outcome).toEqual({
      kind: 'answered',
      optionId: 'confirm',
      label: '确认设计，进入计划',
    })
  })

  it('maps the scaffold init label', async () => {
    const service = fakeService(answered('初始化工作区'))
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome).toEqual({ kind: 'answered', optionId: 'init', label: '初始化工作区' })
  })

  it('a __noop__ label is a pause (dismissed), never a dispatch', async () => {
    const service = fakeService(answered('暂不初始化'))
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome).toEqual({ kind: 'paused', reason: 'dismissed' })
  })

  it('skip (empty selection) is a pause', async () => {
    const service = fakeService({ answers: [{ id: 'scaffold', selected: [] }] })
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome).toEqual({ kind: 'paused', reason: 'skipped' })
  })

  it('custom free text is a pause on non-revisable gates — the §22 option set is closed', async () => {
    const service = fakeService({ answers: [{ id: 'scaffold', selected: [], custom: '先看看再说' }] })
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome).toEqual({ kind: 'paused', reason: 'skipped' })
  })

  it('2026-09-28 用户问题 1.7: custom free text on a revisable gate is a revise outcome', async () => {
    const service = fakeService({ answers: [{ id: 'open-advance', selected: [], custom: 'Why 一句话讲清目标' }] })
    const outcome = await askGateDialog(service, undefined, { gateId: 'open-advance', changeId: 'CHG-7' })
    expect(outcome).toEqual({ kind: 'revise', text: 'Why 一句话讲清目标' })
  })

  it('2026-09-28 用户问题 1.2/1.5: revisable gates carry the change chip first line + the 【产物】 links', async () => {
    const service = fakeService(answered('确认提案 · 进入澄清'))
    await askGateDialog(service, undefined, { gateId: 'open-advance', changeId: 'CHG-7' })
    const detail = service.calls[0]?.questions[0]?.detail ?? ''
    expect(detail.startsWith('{{change:CHG-7}}')).toBe(true)
    expect(detail).toContain('【产物】')
    expect(detail).toContain('- {{art:openspec/changes/CHG-7/proposal.md}} 提案')
    // The 暂不推进 hint rides the wire as customer copy (the /baf-go resume
    // hint must survive the client's filter).
    const back = service.calls[0]?.questions[0]?.options?.find(o => o.label === '暂不推进')
    expect(back?.description).toBe('工作流暂停；需要继续时再敲一次 /baf-go')
  })

  it('a label the registry does not offer is a pause, not an error', async () => {
    const service = fakeService(answered('给我来个第三条路'))
    const outcome = await askGateDialog(service, undefined, { gateId: 'design-confirm' })
    expect(outcome).toEqual({ kind: 'paused', reason: 'skipped' })
  })

  it('cancel (X button) is a pause; abort is too', async () => {
    for (const code of ['ASK_CANCELLED', 'ASK_ABORTED']) {
      const service = fakeService(coded(code))
      const outcome: GateAskOutcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
      expect(outcome).toEqual({ kind: 'paused', reason: 'cancelled' })
    }
  })

  it('a missing answerer is unavailable, so the caller degrades to the card', async () => {
    const service = fakeService(coded('NO_PROVIDER'))
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome.kind).toBe('unavailable')
  })

  it('unknown gates and empty option sets never pop', async () => {
    const service = fakeService(answered('x'))
    expect((await askGateDialog(service, undefined, { gateId: 'resume' })).kind).toBe('unavailable')
  })

  it('derives resume options from the caller-supplied candidates', async () => {
    const service = fakeService(answered('复位到 design'))
    const outcome = await askGateDialog(service, undefined, {
      gateId: 'resume',
      changeId: 'chg-1',
      resumeCandidates: ['clarify', 'design'],
    })
    expect(outcome).toEqual({ kind: 'answered', optionId: 'resume-design', label: '复位到 design' })
    // The offered labels are exactly the two candidates.
    const offered = service.calls[0]?.questions[0]?.options?.map(o => o.label) ?? []
    expect(offered).toEqual(['复位到 clarify', '复位到 design'])
  })

  it('§22.19 R4: derives bind options from the caller-supplied change ids', async () => {
    const service = fakeService(answered('接手 chg-200'))
    const outcome = await askGateDialog(service, undefined, {
      gateId: 'bind-workflow',
      bindCandidates: ['chg-100', 'chg-200'],
    })
    // The clicked label maps back to the `bind-<id>` option id that
    // `driveGateResolve` derives from the same candidate list.
    expect(outcome).toEqual({ kind: 'answered', optionId: 'bind-chg-200', label: '接手 chg-200' })
    const offered = service.calls[0]?.questions[0]?.options?.map(o => o.label) ?? []
    expect(offered).toEqual(['接手 chg-100', '接手 chg-200'])
    const descriptions = service.calls[0]?.questions[0]?.options?.map(o => o.description) ?? []
    expect(descriptions).toContain('将执行 /baf-go change=chg-100')
    expect(descriptions).toContain('将执行 /baf-go change=chg-200')
  })

  it('builds the question from the registry spec (title as question, body as detail)', async () => {
    const service = fakeService(answered('初始化工作区'))
    await askGateDialog(service, undefined, { gateId: 'scaffold' })
    const question = service.calls[0]?.questions[0]
    expect(question?.question).toBe('工作区需要初始化')
    expect(question?.detail).toContain('这个目录还没有初始化')
    expect(question?.options).toHaveLength(2)
  })

  it('§22.17 I: a judgment renders the classifier verdict into the dialog detail', async () => {
    const service = fakeService(answered('确认 · 完整流程'))
    await askGateDialog(service, undefined, {
      gateId: 'intake-classify',
      changeId: 'CHG-1',
      judgment: { mode: 'bug-fix-path', kind: 'bug', summary: '登录页在空输入时崩溃', confidence: 0.82 },
    })
    const question = service.calls[0]?.questions[0]
    expect(question?.question).toBe('需求分类待确认')
    // 【变更】2026-09-28 (用户问题 1.2): the change id rides as a `{{change:…}}`
    // first line (the client's top-right chip), no longer prose.
    expect(question?.detail).toContain('{{change:CHG-1}}')
    expect(question?.detail).toContain('系统初步判断：缺陷修复路径 · 缺陷 · 置信 0.82')
    expect(question?.detail).toContain('需求摘要：登录页在空输入时崩溃')
  })

  it('§22.17 I: no judgment keeps the plain registry question', async () => {
    const service = fakeService(answered('确认 · 完整流程'))
    await askGateDialog(service, undefined, { gateId: 'intake-classify' })
    expect(service.calls[0]?.questions[0]?.detail).not.toContain('系统初步判断')
  })

  it('2026-09-21: note paragraphs render between the question and any judgment', async () => {
    const service = fakeService(answered('暂不处理'))
    await askGateDialog(service, undefined, {
      gateId: 'active-conflict',
      changeId: 'CHG-9',
      note: ['现有变更当前进行到：design', '客户提出的新需求：「重构ecum模块」'],
    })
    const detail = service.calls[0]?.questions[0]?.detail ?? ''
    // 【变更】2026-09-28 (用户问题 1.2): `{{change:…}}` first-line chip protocol.
    expect(detail).toContain('{{change:CHG-9}}')
    expect(detail).toContain('现有变更当前进行到：design')
    expect(detail).toContain('客户提出的新需求：「重构ecum模块」')
  })
})

describe('§22.17 makeGateAsk service resolution', () => {
  /** A minimal structural Context double keyed on the service name. */
  function ctxWith(services: Record<string, unknown>): Context {
    return { get: (name: string) => services[name] } as unknown as Context
  }

  it('returns undefined when no userQuestions service is mounted', () => {
    expect(makeGateAsk(ctxWith({}), undefined)).toBeUndefined()
    expect(makeGateAsk(ctxWith({ userQuestions: undefined }), undefined)).toBeUndefined()
  })

  it('returns a channel when the row ctx sees the service', () => {
    const service = fakeService(answered('初始化工作区'))
    const ask = makeGateAsk(ctxWith({ userQuestions: service }), undefined)
    expect(ask).toBeTypeOf('function')
  })

  it('prefers the receiving agent realm over the row ctx', async () => {
    const viaAgent = fakeService(answered('初始化工作区'))
    const viaRow = fakeService(answered('初始化工作区'))
    const agent = { ctx: ctxWith({ userQuestions: viaAgent }) }
    const ask = makeGateAsk(ctxWith({ userQuestions: viaRow }), agent)
    expect(ask).toBeDefined()
    // §22.19: the channel rides the ask queue, so the service call lands a
    // microtask later — await the call instead of firing and forgetting.
    await ask?.({ gateId: 'scaffold' })
    expect(viaAgent.calls).toHaveLength(1)
    expect(viaRow.calls).toHaveLength(0)
  })
})

describe('§22.17 toolDriveAdapters isolate resolution', () => {
  /** A minimal structural Context double keyed on the service name. */
  function ctxWith(services: Record<string, unknown>): Context {
    return { get: (name: string) => services[name] } as unknown as Context
  }

  /**
   * The production incident (tmp/session/2.jsonl): the customer clicked
   * 「初始化工作区」, the dispatch routed correctly, and the card still read
   * 「初始化服务没有加载」 — bafQuality / bafGuard / bafScaffold sit in the
   * baf-domain isolate, invisible to every plain `get` the tool row can do.
   * Only `agentPresets.serviceFor(agent, name)` crosses that boundary.
   */
  it('resolves all three adapters through agentPresets.serviceFor when every get misses', () => {
    const stack = { adapter: () => ({ id: () => 'stack' }) }
    const guard = { policy: () => ({ path: 'guard' }) }
    const scaffold = { scaffold: () => ({ kind: 'done' }) }
    const agent = { ctx: ctxWith({}) }
    const presets = {
      serviceFor: (_who: unknown, name: string): unknown =>
        name === 'bafQuality' ? stack : name === 'bafGuard' ? guard : name === 'bafScaffold' ? scaffold : undefined,
    }
    const adapters = toolDriveAdapters(ctxWith({ agentPresets: presets }), agent, 'D:/ws')
    expect(adapters.stack).toBeDefined()
    expect(adapters.guard).toBeDefined()
    expect(adapters.scaffold).toBe(scaffold)
  })

  it('omits every adapter when neither channel can see the isolate services', () => {
    const agent = { ctx: ctxWith({}) }
    const adapters = toolDriveAdapters(ctxWith({}), agent, 'D:/ws')
    expect(adapters.stack).toBeUndefined()
    expect(adapters.guard).toBeUndefined()
    expect(adapters.scaffold).toBeUndefined()
  })
})

describe('§22.17 I baf_gate_ask intake bootstrap (requirement param)', () => {
  /**
   * The 2026-09-20 incident (screenshot): the customer stated a requirement,
   * the workspace was one step from the classification decision, and the
   * model answered with a manual-steps prose message — no dialog, because no
   * model tool could reach the classification pop at all (opening a change
   * was slash/Tab only). These tests pin the requirement bootstrap that
   * closes that dead-end: one tool call mints the change AND pops the gate.
   */
  /** A description the heuristic classifier lands on full-go-path (go.spec's). */
  const DESCRIPTION = 'feat: add export public API for reports'

  it('pops the new-workflow confirmation first, then the informed classify dialog (spec §1)', async () => {
    const root = await setupToolWorkspace()
    try {
      // 2026-09-22 user decision: the FIRST dialog of a new requirement is the
      // explicit 新建工作流 confirmation — the requirement itself is intent,
      // but the create/bind decision settles on a card.
      const service = scriptedService([answered('新建工作流'), answered('确认 · 完整流程')])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: DESCRIPTION,
      })
      expect(service.calls).toHaveLength(2)
      expect(service.calls[0]?.questions[0]?.question).toBe('未发现进行中的工作流')
      expect(service.calls[0]?.questions[0]?.detail).toContain(DESCRIPTION)
      const question = service.calls[1]?.questions[0]
      expect(question?.question).toBe('需求分类待确认')
      expect(question?.detail).toContain('系统初步判断：完整流程')
      // The click confirmed: full-go-path opened (the fixture baseline admits it).
      expect(text).toContain('已确认')
      const minted = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(minted).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('暂不处理 on the new-workflow card mints nothing and says so plainly', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService(answered('暂不处理'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: DESCRIPTION,
      })
      expect(service.calls).toHaveLength(1)
      expect(service.calls[0]?.questions[0]?.question).toBe('未发现进行中的工作流')
      expect(text).toContain('暂不新建工作流')
      expect(text).toContain('没有创建任何变更')
      const minted = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(minted).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('redirects to the scaffold gate when the workspace is uninitialized', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-gate-ask-'))
    try {
      const service = fakeService(answered('暂不初始化'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: '重构 ecum 模块',
      })
      expect(service.calls).toHaveLength(1)
      expect(service.calls[0]?.questions[0]?.question).toBe('工作区需要初始化')
      expect(text).toContain('工作区需要初始化')
      expect(text).toContain('客户暂未选择')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses to mint beside a pending intake and names the change to reuse', async () => {
    const root = await setupToolWorkspace()
    try {
      await driveOpen(root, DESCRIPTION)
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: '另一个需求',
      })
      expect(service.calls).toHaveLength(0)
      expect(text).toContain('已有待确认分类的变更')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('without changeId or requirement the tool explains instead of popping', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, { gateId: 'intake-classify' })
      expect(service.calls).toHaveLength(0)
      expect(text).toContain('requirement')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('【变更】2026-09-27 an INVENTED changeId with requirement mints from the requirement instead (demo-bugfix4)', async () => {
    // The model authored fix-ecum-export-empty-crash out of thin air and the
    // dialog popped for a change that does not exist — the customer's confirm
    // landed on「无此变更」. The invented id is now treated as absent: the
    // normal bootstrap runs (new-workflow card → classify) and the minted id
    // is what the workflow carries forward.
    const root = await setupToolWorkspace()
    try {
      const service = scriptedService([answered('新建工作流'), answered('确认 · 缺陷修复路径')])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        changeId: 'fix-ecum-export-empty-crash',
        requirement: '修复一个bug：ecum模块导出报表时如果数据行为空会崩溃',
      })
      expect(service.calls[0]?.questions[0]?.question).toBe('未发现进行中的工作流')
      expect(text).toContain('已确认')
      const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
      expect(index.changes.some(c => c.changeId === 'fix-ecum-export-empty-crash')).toBe(false)
      const minted = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(minted).toHaveLength(1)
      expect(minted[0]?.changeId).toMatch(/^change-/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('【变更】2026-09-27 an INVENTED changeId without requirement is refused with the minting rule', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService(answered('确认 · 缺陷修复路径'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        changeId: 'fix-ecum-export-empty-crash',
      })
      expect(service.calls).toHaveLength(0)
      expect(text).toContain('不存在')
      expect(text).toContain('由系统铸造')
      const minted = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(minted).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('scaffold diversion continues the bootstrap (2026-09-22, session 1.jsonl)', () => {
  /**
   * Session 1 turn 1: uninitialized workspace, the customer stated 重构ecum模块,
   * `baf_gate_ask` diverted to the scaffold gate, the customer clicked
   * 「初始化工作区」 — and the tool returned the scaffold slash-card alone. The
   * model read 「类型：系统斜杠指令，无需大模型」 as "nobody clicked", re-asked the
   * choice as a prose A/B question, and the requirement died in model context.
   * These tests pin the fix: the click chains into the classification dialog
   * inside the same tool call, and the returned text opens with the choice.
   */
  const NEW_REQUIREMENT = '重构ecum模块'

  it('初始化工作区 click walks 新建确认 → 分类确认 as legs of the same call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-gate-ask-'))
    try {
      // Spec §1 ordering on a fresh workspace: scaffold (environment) →
      // 新建确认 → 分类确认 — three pops, no prose round-trip.
      const service = scriptedService([
        answered('初始化工作区'),
        answered('新建工作流'),
        answered('确认 · 完整流程'),
      ])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: NEW_REQUIREMENT,
      }, { bafScaffold: fakeScaffoldService() })
      expect(service.calls).toHaveLength(3)
      expect(service.calls[0]?.questions[0]?.question).toBe('工作区需要初始化')
      expect(service.calls[1]?.questions[0]?.question).toBe('未发现进行中的工作流')
      expect(service.calls[2]?.questions[0]?.question).toBe('需求分类待确认')
      // The model-facing text opens with what the customer clicked and never
      // claims "this card needed no model" / "not yet clicked".
      expect(text).toContain('【客户选择】')
      expect(text).toContain('「初始化工作区」')
      expect(text).not.toContain('系统斜杠指令，无需大模型')
      // The classify click confirmed: exactly one active change exists.
      const actives = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(actives).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pausing the classification leg still leaves the requirement minted (durable)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-gate-ask-'))
    try {
      const service = scriptedService([
        answered('初始化工作区'),
        answered('新建工作流'),
        { answers: [{ id: 'intake-classify', selected: [] }] },
      ])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: NEW_REQUIREMENT,
      }, { bafScaffold: fakeScaffoldService() })
      expect(service.calls).toHaveLength(3)
      // The scaffold leg's choice + result precede the pause note, so the
      // model cannot misread the pause as "the scaffold click never landed".
      expect(text).toContain('【客户选择】')
      expect(text).toContain('「初始化工作区」')
      expect(text).toContain('客户暂未选择')
      // Durable: the change sits at intake awaiting classification, so the
      // §22.19 turn-end auto-pop has something to re-pop.
      const actives = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(actives).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('active-conflict: the collision pops as a dialog (2026-09-21, session 6.jsonl)', () => {
  /**
   * Session 6 turn 1: the customer stated 重构ecum模块 beside a running
   * change, `baf_gate_ask` answered with a text-only refusal, and the model
   * bridged the gap with a prose 「A. 继续推进 / B. 新开会话」 question the
   * customer had to answer by typing "A". These tests pin the fix: the
   * collision itself pops the registered active-conflict dialog and the click
   * dispatches through the standard resolve channel.
   */
  const EXISTING = 'feat: add export public API for reports'
  const NEW_REQUIREMENT = '重构ecum模块'

  /** Mint a change and drive it past intake to `open` (no pending gate). */
  async function mintOpenedChange(root: string, description: string): Promise<string> {
    await driveOpen(root, description)
    const store = new ProjectionStore({ workspaceRoot: root })
    const changeId = (await store.readIndex()).changes
      .filter(c => c.current !== 'completed' && c.current !== 'abandoned')[0]?.changeId
    if (changeId === undefined) throw new Error('mint failed')
    const { driveClassify } = await import('../src/command-drives.ts')
    await driveClassify(root, `confirm mode=full-go-path change=${changeId}`)
    // 【变更】2026-09-22 (user report #1): open gates on proposal.md now —
    // author it so the 继续推进 click below actually advances (the conflict
    // dialog's own behavior is this suite's subject, not the open gate).
    const proposalDir = join(root, 'openspec', 'changes', changeId)
    await mkdir(proposalDir, { recursive: true })
    await writeFile(join(proposalDir, 'proposal.md'), [
      '# Proposal',
      '',
      '## Why',
      '',
      'The existing requirement needs a public report export API.',
      '',
      '## Scope',
      '',
      '- In: exportReportsCsv API',
      '',
      '## Impact',
      '',
      'Adds src/export.ts; rollback is deleting the file.',
      '',
    ].join('\n'), 'utf8')
    return changeId
  }

  it('pops the conflict dialog naming the running change and the new requirement', async () => {
    const root = await setupToolWorkspace()
    try {
      const changeId = await mintOpenedChange(root, EXISTING)
      const service = fakeService(answered('暂不处理'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: NEW_REQUIREMENT,
      })
      expect(service.calls).toHaveLength(1)
      const question = service.calls[0]?.questions[0]
      expect(question?.question).toBe('已有进行中的变更')
      // 【变更】2026-09-28 (用户问题 1.2): `{{change:…}}` first-line chip protocol.
      expect(question?.detail).toContain(`{{change:${changeId}}}`)
      expect(question?.detail).toContain('现有变更当前进行到：open')
      expect(question?.detail).toContain(`客户提出的新需求：「${NEW_REQUIREMENT}」`)
      const labels = question?.options?.map(o => o.label) ?? []
      expect(labels).toEqual(['继续推进现有变更', '放弃现有变更，稍后再提新需求', '暂不处理'])
      // 暂不处理 = __noop__: paused shape, no second change minted.
      expect(text).toContain('客户暂未选择')
      const actives = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(actives).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('clicking 继续推进现有变更 dispatches /baf-go on that change — no prose hand-off', async () => {
    const root = await setupToolWorkspace()
    try {
      const changeId = await mintOpenedChange(root, EXISTING)
      const service = fakeService(answered('继续推进现有变更'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: NEW_REQUIREMENT,
      })
      // The click drove the existing change forward (open → clarify entered);
      // the returned card is the resulting state, not a menu.
      expect(text).toContain('clarify')
      const actives = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(actives.map(c => c.changeId)).toEqual([changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('clicking 放弃现有变更 abandons exactly that change and frees the workspace', async () => {
    const root = await setupToolWorkspace()
    try {
      const changeId = await mintOpenedChange(root, EXISTING)
      const service = fakeService(answered('放弃现有变更，稍后再提新需求'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: NEW_REQUIREMENT,
      })
      expect(text).toContain('已放弃')
      expect(text).toContain(changeId)
      // The tool tells the model the exact next call so the new requirement
      // continues from the classification pop instead of dying in prose.
      expect(text).toContain('重新调用 baf_gate_ask')
      expect(text).toContain(NEW_REQUIREMENT)
      const actives = (await new ProjectionStore({ workspaceRoot: root }).readIndex())
        .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
      expect(actives).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('confirmed-but-never-opened intake: explain, do not re-pop (2026-09-20 incident)', () => {
  /**
   * Incident 3.jsonl: the classify dialog's 确认·完整流程 click landed, the
   * open drive was blocked by missing Git, and every later surface behaved as
   * if the classification were still pending — the tool told the model to
   * re-call with changeId, the re-popped confirm dialog got cancelled, and the
   * customer read the unchanged confirmed state as "cancel was ignored". The
   * settled state must instead come back as an explanation pointing at /baf-go.
   */
  const DESCRIPTION = 'feat: add export public API for reports'

  it('a confirmed intake via requirement bootstrap: no pop, the parked-state note', async () => {
    const root = await setupToolWorkspace()
    try {
      const changeId = await mintConfirmed(root, DESCRIPTION, 'full-go-path')
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: DESCRIPTION,
      })
      expect(service.calls).toHaveLength(0)
      expect(text).toContain('分类已确认（完整流程）')
      expect(text).toContain('/baf-go')
      expect(text).toContain(changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a confirmed intake addressed by changeId: no pop either (retry is not a decision)', async () => {
    const root = await setupToolWorkspace()
    try {
      const changeId = await mintConfirmed(root, DESCRIPTION, 'full-go-path')
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        changeId,
      })
      expect(service.calls).toHaveLength(0)
      expect(text).toContain('分类已确认（完整流程）')
      expect(text).toContain('进入建立变更')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a confirmed clarify-required verdict still pops — the path choice is genuinely open', async () => {
    const root = await setupToolWorkspace()
    try {
      // The incident's own description classifies as clarify-required.
      const changeId = await mintConfirmed(root, '重构ecum模块', 'clarify-required')
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        changeId,
      })
      expect(service.calls).toHaveLength(1)
      expect(text).toContain('已确认')
      expect((await new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)).current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  /** Mint + service-level confirm (no open drive) — the parked incident shape. */
  async function mintConfirmed(
    root: string,
    description: string,
    expectMode: 'full-go-path' | 'clarify-required',
  ): Promise<string> {
    const { driveOpen } = await import('../src/command-drives.ts')
    const { confirmIntake } = await import('../src/workflow-service.ts')
    await driveOpen(root, description)
    const store = new ProjectionStore({ workspaceRoot: root })
    const changeId = (await store.readIndex())
      .changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')[0]?.changeId
    if (changeId === undefined) throw new Error('mint failed')
    const status = await store.readStatus(changeId)
    if (status.intake?.mode !== expectMode) {
      throw new Error(`classifier landed ${status.intake?.mode}, expected ${expectMode}`)
    }
    await confirmIntake(store, changeId, 'user')
    return changeId
  }
})

describe('§22.17 J path-choice options + bug-field draft (classify dialog v2)', () => {
  it('the bug-field draft renders into the dialog detail as one paragraph', async () => {
    const root = await setupToolWorkspace()
    try {
      // Spec §1 (2026-09-22): the 新建工作流 card pops first — answer it, then
      // the classify dialog carries the draft paragraph; skip on the classify
      // leg so the detail is inspectable.
      const service = scriptedService([
        answered('新建工作流'),
        { answers: [{ id: 'intake-classify', selected: [] }] },
      ])
      await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: '登录页在空输入时崩溃',
        problem: '空输入时解析器解引用空指针',
        rootCause: 'parse() 缺少长度守卫',
        files: ['src/parser.c'],
        test: 'tests/test_parser_empty.c',
        testCmd: 'ctest -R parser_empty',
      })
      const detail = service.calls[1]?.questions[0]?.detail ?? ''
      expect(detail).toContain('缺陷修复草案')
      expect(detail).toContain('现象：空输入时解析器解引用空指针')
      expect(detail).toContain('根因：parse() 缺少长度守卫')
      expect(detail).toContain('涉及文件：src/parser.c')
      expect(detail).toContain('回归测试：tests/test_parser_empty.c')
      expect(detail).toContain('测试命令：ctest -R parser_empty')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('clicking 确认·缺陷修复路径 on a full-classified change re-routes it end to end', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = scriptedService([answered('新建工作流'), answered('确认 · 缺陷修复路径')])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: 'feat: add export public API for reports',
        // The bug draft rides the confirm dispatch — one click settles path + fields.
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        files: ['src/parser.c'],
        test: 'tests/test_parser_empty.c',
        testCmd: 'ctest -R parser_empty',
      })
      expect(text).toContain('已确认并进入 open')
      const store = new ProjectionStore({ workspaceRoot: root })
      const changeId = (await store.readIndex()).changes
        .filter(c => c.current !== 'completed' && c.current !== 'abandoned')
        .map(c => c.changeId)[0] ?? ''
      const status = await store.readStatus(changeId)
      expect(status.mode).toBe('bug-fix-path')
      expect(status.openspecSkipped?.skipped).toBe(true)
      expect(status.current).toBe('open')
      // The override is audited as its own event, not a silent rewrite.
      const events = await store.readEvents(changeId)
      expect(events.events.map(e => e.type)).toContain('intake-mode-set')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a bug-path click without draft fields opens a TODO draft the model completes (工作流 3)', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = scriptedService([answered('新建工作流'), answered('确认 · 缺陷修复路径')])
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: 'feat: add export public API for reports',
      })
      // 【变更】2026-09-26 (用户需求 工作流 3): the fieldless confirm used to
      // refuse AFTER confirming the intake — the dead state nothing could
      // advance (the reported「bug-fix-path 会卡住」). It now opens the change
      // with a TODO draft record, the same authoring-rest shape full-go-path's
      // template proposal gets.
      expect(text).not.toContain('fast-path 缺少 Bug 字段')
      expect(text).toContain('fast-path 草稿')
      expect(text).toContain('TODO')
      const store = new ProjectionStore({ workspaceRoot: root })
      const changeId = (await store.readIndex()).changes
        .filter(c => c.current !== 'completed' && c.current !== 'abandoned')
        .map(c => c.changeId)[0] ?? ''
      const status = await store.readStatus(changeId)
      expect(status.mode).toBe('bug-fix-path')
      expect(status.current).toBe('open')
      const record = await readFile(join(root, 'openspec', 'changes', changeId, 'proposal.md'), 'utf8')
      expect(record).toContain('## Root cause')
      expect(record).toContain('TODO')
      // The problem section carries the requirement summary (real content).
      expect(record).toContain('feat: add export public API for reports')
      const events = await store.readEvents(changeId)
      expect(events.events.map(e => e.type)).toContain('intake-mode-set')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
