/**
 * `baf_question_ask` unit tests (2026-09-21 standing rule).
 *
 * Session 6.jsonl turn 2: the model ended the workflow on a prose 「问题1
 * A/B · 问题2 A/B/C，请回 1A 2C」 message — the customer never answered and the
 * session died. The tool under test is the sanctioned channel for every
 * non-workflow choice: it pops the platform dialog, waits, and returns the
 * click. These tests pin the pop shape, the answer mapping, the pause
 * wording, and the refusals — with a fake `userQuestions` service, no UI.
 *
 * @module @deepseek-ai/dsh-baf-workflow/tests/question-ask
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { apply } from '../src/question-ask.ts'

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

/** A minimal structural Context double keyed on the service name. */
function ctxWith(services: Record<string, unknown>): Context {
  return { get: (name: string) => services[name] } as unknown as Context
}

/** Structural double of the tool `apply` registers (gate-dialog harness pattern). */
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
  args: Record<string, unknown>,
): Promise<string> {
  const agent = { session: { header: { cwd: 'D:/ws' } }, ctx: ctxWith({ userQuestions: service }) }
  const result = await tool.execute(args, { agent }) as { type: string; text: string }[]
  return result.map(block => block.text).join('\n')
}

/** The session-6 shape: two questions, A/B and A/B/C. */
function sessionSixQuestions(): Record<string, unknown> {
  return {
    questions: [
      {
        question: 'design.md 的验收标准要不要独立列一遍？',
        detail: 'AC 目前写在 clarify.md 里；design 自包含便于 plan 阶段直接落地。',
        options: [
          { label: '复制一遍到 design.md', description: 'design 自包含，plan 阶段作者直接用' },
          { label: '只引一句指向 clarify.md', description: '避免双源漂移' },
        ],
      },
      {
        question: 'proposal.md / tasks.md 还是 TODO 骨架，要补吗？',
        options: [
          { label: '补 proposal.md', description: '写清背景/范围/影响；tasks 留给 plan 阶段' },
          { label: '都不补', description: 'proposal 保持骨架' },
          { label: '都补', description: 'proposal + tasks 草稿一起写' },
        ],
      },
    ],
  }
}

describe('baf_question_ask pop shape', () => {
  it('pops every question as one dialog and returns the clicked labels verbatim', async () => {
    const service = fakeService({
      answers: [
        { id: 'q1', selected: ['复制一遍到 design.md'] },
        { id: 'q2', selected: ['都补'], custom: 'tasks 只列层级骨架就行' },
      ],
    })
    const text = await runTool(registerTool(), service, sessionSixQuestions())
    // One pop carrying both questions — the 「请回 1A 2C」 shape replaced by
    // one card with two clickable questions.
    expect(service.calls).toHaveLength(1)
    expect(service.calls[0]?.questions).toHaveLength(2)
    expect(service.calls[0]?.questions[0]?.header).toBe('BAF 选择卡')
    expect(service.calls[0]?.questions[0]?.options?.map(o => o.label)).toEqual(['复制一遍到 design.md', '只引一句指向 clarify.md'])
    expect(text).toContain('客户已点选')
    expect(text).toContain('客户选择：复制一遍到 design.md')
    expect(text).toContain('客户选择：都补')
    expect(text).toContain('客户补充：「tasks 只列层级骨架就行」')
  })

  it('a skipped question is reported as not chosen — the model must not fill it in', async () => {
    const service = fakeService({ answers: [{ id: 'q1', selected: ['只引一句指向 clarify.md'] }] })
    const text = await runTool(registerTool(), service, sessionSixQuestions())
    expect(text).toContain('客户选择：只引一句指向 clarify.md')
    expect(text).toContain('客户未选择（该问题被跳过）')
    expect(text).toContain('不要替客户补一个答案')
  })

  it('a custom-only answer is surfaced as text, not mapped onto an option', async () => {
    const service = fakeService({
      answers: [{ id: 'q1', selected: [], custom: '先看看 clarify.md 再说' }],
    })
    const first = (sessionSixQuestions().questions as { question: string; options: unknown[] }[])[0]
    const text = await runTool(registerTool(), service, {
      questions: [first],
    })
    expect(text).toContain('客户未点选项，补充了文字：「先看看 clarify.md 再说」')
  })

  it('cancel (X button) is the unified pause wording, never a fabricated choice', async () => {
    const service = fakeService(Object.assign(new Error('cancelled'), { code: 'ASK_CANCELLED' }))
    const text = await runTool(registerTool(), service, sessionSixQuestions())
    expect(text).toContain('客户暂未选择')
    expect(text).toContain('不要替客户决定')
    expect(text).toContain('再次调用本工具')
  })

  it('no answerer degrades to the verbatim question card — not a prose license', async () => {
    const service = fakeService({ answers: [] })
    const agent = { session: { header: { cwd: 'D:/ws' } }, ctx: ctxWith({}) }
    const tool = registerTool()
    const result = await tool.execute(sessionSixQuestions(), { agent }) as { type: string; text: string }[]
    const text = result.map(block => block.text).join('\n')
    expect(service.calls).toHaveLength(0)
    expect(text).toContain('当前环境无法弹卡')
    expect(text).toContain('不要改为在消息里罗列 A/B/C 选项')
  })
})

describe('baf_question_ask validation (the card never pops half-shaped)', () => {
  it('refuses a question with fewer than two options (schema rejects none at all)', async () => {
    const service = fakeService({ answers: [] })
    // options missing entirely is rejected by the tool schema (ToolArgsError)
    // before execute runs; a single-option array reaches the parser, which
    // refuses it as not a real choice.
    const text = await runTool(registerTool(), service, {
      questions: [{ question: '你怎么看？', options: [{ label: '唯一的选项' }] }],
    })
    expect(service.calls).toHaveLength(0)
    expect(text).toContain('参数不合法')
    expect(text).toContain('至少需要 2 个选项')
  })

  it('refuses more than 4 options and more than 4 questions', async () => {
    const service = fakeService({ answers: [] })
    const five = ['a', 'b', 'c', 'd', 'e'].map(label => ({ label }))
    const text = await runTool(registerTool(), service, {
      questions: [{ question: 'q', options: five }],
    })
    expect(text).toContain('最多 4 个选项')
    const many = await runTool(registerTool(), service, {
      questions: [1, 2, 3, 4, 5].map(i => ({ question: `q${i}`, options: [{ label: 'a' }, { label: 'b' }] })),
    })
    expect(many).toContain('一次最多 4 个问题')
    expect(service.calls).toHaveLength(0)
  })

  it('refuses duplicate option labels within one question', async () => {
    const service = fakeService({ answers: [] })
    const text = await runTool(registerTool(), service, {
      questions: [{ question: 'q', options: [{ label: '一样' }, { label: '一样' }] }],
    })
    expect(text).toContain('label 有重复')
    expect(service.calls).toHaveLength(0)
  })
})
