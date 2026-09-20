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
): Promise<string> {
  const agent = { session: { header: { cwd: root } }, ctx: ctxWith({ userQuestions: service }) }
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

  it('custom free text is a pause — the §22 option set is closed', async () => {
    const service = fakeService({ answers: [{ id: 'scaffold', selected: [], custom: '先看看再说' }] })
    const outcome = await askGateDialog(service, undefined, { gateId: 'scaffold' })
    expect(outcome).toEqual({ kind: 'paused', reason: 'skipped' })
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
    expect(question?.detail).toContain('（变更 CHG-1）')
    expect(question?.detail).toContain('系统初步判断：缺陷修复路径 · 缺陷 · 置信 0.82')
    expect(question?.detail).toContain('需求摘要：登录页在空输入时崩溃')
  })

  it('§22.17 I: no judgment keeps the plain registry question', async () => {
    const service = fakeService(answered('确认 · 完整流程'))
    await askGateDialog(service, undefined, { gateId: 'intake-classify' })
    expect(service.calls[0]?.questions[0]?.detail).not.toContain('系统初步判断')
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

  it('prefers the receiving agent realm over the row ctx', () => {
    const viaAgent = fakeService(answered('初始化工作区'))
    const viaRow = fakeService(answered('初始化工作区'))
    const agent = { ctx: ctxWith({ userQuestions: viaAgent }) }
    const ask = makeGateAsk(ctxWith({ userQuestions: viaRow }), agent)
    expect(ask).toBeDefined()
    void ask?.({ gateId: 'scaffold' })
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

  it('mints the change from the requirement and pops an informed classify dialog', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService(answered('确认 · 完整流程'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: DESCRIPTION,
      })
      // One pop: the classification dialog, with the classifier verdict visible.
      expect(service.calls).toHaveLength(1)
      const question = service.calls[0]?.questions[0]
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
})

describe('§22.17 J path-choice options + bug-field draft (classify dialog v2)', () => {
  it('the bug-field draft renders into the dialog detail as one paragraph', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService({ answers: [{ id: 'intake-classify', selected: [] }] })
      await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: '登录页在空输入时崩溃',
        problem: '空输入时解析器解引用空指针',
        rootCause: 'parse() 缺少长度守卫',
        files: ['src/parser.c'],
        test: 'tests/test_parser_empty.c',
        testCmd: 'ctest -R parser_empty',
      })
      const detail = service.calls[0]?.questions[0]?.detail ?? ''
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
      const service = fakeService(answered('确认 · 缺陷修复路径'))
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

  it('a bug-path click without draft fields parks with the override still recorded', async () => {
    const root = await setupToolWorkspace()
    try {
      const service = fakeService(answered('确认 · 缺陷修复路径'))
      const text = await runTool(registerTool(), service, root, {
        gateId: 'intake-classify',
        requirement: 'feat: add export public API for reports',
      })
      // The dialog offers the path; the dispatch reports the missing fields
      // instead of silently proceeding — same refusal the slash surface gives.
      expect(text).toContain('fast-path 缺少 Bug 字段')
      const store = new ProjectionStore({ workspaceRoot: root })
      const changeId = (await store.readIndex()).changes
        .filter(c => c.current !== 'completed' && c.current !== 'abandoned')
        .map(c => c.changeId)[0] ?? ''
      const status = await store.readStatus(changeId)
      expect(status.mode).toBe('bug-fix-path')
      const events = await store.readEvents(changeId)
      expect(events.events.map(e => e.type)).toContain('intake-mode-set')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
