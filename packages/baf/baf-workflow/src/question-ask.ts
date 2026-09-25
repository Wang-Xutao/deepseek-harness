/**
 * Model-facing `baf_question_ask` tool (2026-09-21 standing rule).
 *
 * 「所有需要让用户选择的提问，都要以弹窗卡的形式，让用户点击」— every
 * customer choice, not just workflow-path decisions, must surface as a
 * clickable card. `baf_gate_ask` owns the workflow decisions (fixed registry);
 * this tool owns every OTHER choice the model wants the customer to make:
 * content tradeoffs, scope preferences, mid-stage artifact questions — the
 * session 6.jsonl shape where the model wrote a prose 「问题1 A/B · 问题2
 * A/B/C，请回 1A 2C」 message and the workflow dead-ended on an unanswered
 * letter.
 *
 * The tool reuses the platform `ctx.userQuestions` channel (the same one the
 * §22.17 gate dialogs ride), so the desktop pops the familiar dialog and WAITS
 * for the click; the returned text is what the customer actually picked. With
 * no answerer (CLI / test compositions) it degrades to a card that lists the
 * questions and options verbatim — never a license to fall back to prose
 * option lists in the GUI.
 *
 * Sits in the Host composition beside `baf-gate-ask` (the `tools` registry is
 * a host-plane service), so a broken row degrades softly (§17.7 R19).
 *
 * @module @deepseek-ai/dsh-baf-workflow/question-ask
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatCommandReport } from './command-format.ts'
import { resolveUserQuestionsForTool } from './gate-dialog.ts'
import { enqueueAsk } from './ask-queue.ts'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'

/** Preset row identity — referenced from `agent.cordis.yml`. */
export const name = 'baf-question-ask'

/** Service injection list. */
export const inject = ['tools'] as const

/** One parsed question (post-validation shape the dialog + result share). */
interface ParsedQuestion {
  readonly question: string
  readonly detail: string | undefined
  readonly header: string | undefined
  readonly options: readonly { readonly label: string; readonly description: string | undefined }[]
}

/** Why a request never popped (the refusal card names the field). */
interface Invalid {
  readonly reason: string
}

/** Hard limits mirrored from the composer's own dialog limits. */
const MAX_QUESTIONS = 4
const MIN_OPTIONS = 2
const MAX_OPTIONS = 4

/**
 * Tool description — the standing rule, stated where the model reads it. The
 * pairing with `baf_gate_ask` is the whole contract: gates decide the
 * workflow path, this tool decides everything else, and prose A/B lists are
 * never an acceptable third channel.
 */
const description = [
  'Pop a clickable question card for the customer and WAIT for their click.',
  'Use this for EVERY customer choice that is NOT a workflow-path decision:',
  'content tradeoffs, scope preferences, "which of these two drafts", whether',
  'to also fill a neighboring artifact, mid-stage design questions — anything',
  'where you would otherwise list options A/B/C in prose and ask the customer',
  'to reply with a letter or "1A 2C". That prose shape is forbidden: if the',
  'customer must pick, they pick on a card. Workflow decisions (initialization,',
  'classification, stage gates, abandon, resume) still go through baf_gate_ask',
  'ONLY — never through this tool, and never through generic question tools.',
  'The dialog pauses until the customer answers, cancels, or skips; the',
  'returned text is what the customer actually clicked (plus any free-text',
  'they typed) — report from it, never from what you assume they chose. If',
  'the customer paused (closed the card), say so plainly and re-call this',
  'tool (or wait for their explicit direction); do not treat silence, a later',
  'prose remark, or a typed letter as their choice. 1-4 questions per call,',
  'each with 2-4 options; every option needs a short label and ideally one',
  'sentence of description saying what picking it means. Put the option you',
  'recommend first and keep labels in the customer\'s language (plain Chinese',
  'in Chinese sessions, no internal vocabulary such as stage ids or gate ids).',
].join(' ')

/** Canonical output contract: a single text content block (gate-ask pattern). */
const OUTPUT_SCHEMA = {
  type: 'array',
  items: { type: 'json' },
} as const

/** Structural read of the runtime agent's session cwd (gate-ask pattern). */
function agentCwd(agent: unknown): string | undefined {
  const cwd = (agent as { session?: { header?: { cwd?: string } } } | undefined)
    ?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** Structural read of the runtime agent's session id (ask-queue scope). */
function agentSessionId(agent: unknown): string {
  const id = (agent as { session?: { header?: { id?: unknown } } } | undefined)
    ?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : 'baf-unknown-session'
}

/** A single text content block. */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

/** Is this value a non-empty string? */
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Parse + validate the tool args into dialog questions.
 *
 * The limits are the composer's own (1-4 questions, 2-4 options each, unique
 * labels per question) — an invalid call returns a refusal card instead of
 * popping something half-shaped.
 */
function parseQuestions(args: Record<string, unknown>): { questions: readonly ParsedQuestion[] } | Invalid {
  const raw = args.questions
  if (!Array.isArray(raw) || raw.length === 0) return { reason: 'questions 必须是 1-4 个问题对象的数组' }
  if (raw.length > MAX_QUESTIONS) return { reason: `一次最多 ${MAX_QUESTIONS} 个问题（收到 ${raw.length} 个）` }
  const questions: ParsedQuestion[] = []
  for (const [index, item] of raw.entries()) {
    if (typeof item !== 'object' || item === null) return { reason: `问题 ${index + 1} 不是对象` }
    const q = item as Record<string, unknown>
    if (!nonEmpty(q.question)) return { reason: `问题 ${index + 1} 缺少非空的 question` }
    const rawOptions = q.options
    if (!Array.isArray(rawOptions) || rawOptions.length < MIN_OPTIONS) {
      return { reason: `问题 ${index + 1} 至少需要 ${MIN_OPTIONS} 个选项（选择卡不接收开放式问题）` }
    }
    if (rawOptions.length > MAX_OPTIONS) {
      return { reason: `问题 ${index + 1} 最多 ${MAX_OPTIONS} 个选项（收到 ${rawOptions.length} 个；请先收敛再问）` }
    }
    const options: ParsedQuestion['options'][number][] = []
    for (const [optIndex, opt] of rawOptions.entries()) {
      if (typeof opt !== 'object' || opt === null) return { reason: `问题 ${index + 1} 的选项 ${optIndex + 1} 不是对象` }
      const o = opt as Record<string, unknown>
      if (!nonEmpty(o.label)) return { reason: `问题 ${index + 1} 的选项 ${optIndex + 1} 缺少非空 label` }
      options.push({
        label: o.label.trim(),
        description: nonEmpty(o.description) ? o.description.trim() : undefined,
      })
    }
    const labels = new Set(options.map(o => o.label))
    if (labels.size !== options.length) {
      return { reason: `问题 ${index + 1} 的选项 label 有重复（点选结果无法区分）` }
    }
    questions.push({
      question: q.question.trim(),
      detail: nonEmpty(q.detail) ? q.detail.trim() : undefined,
      header: nonEmpty(q.header) ? q.header.trim() : undefined,
      options,
    })
  }
  return { questions }
}

/** Render the questions verbatim as card sections (degradation / refusal body). */
function questionSections(questions: readonly ParsedQuestion[]): readonly { title: string; lines: string[] }[] {
  return questions.map((q, i) => ({
    title: `问题 ${i + 1}`,
    lines: [
      q.question,
      ...q.options.map((opt, j) => `[${String.fromCharCode(65 + j)}] ${opt.label}${opt.description === undefined ? '' : ` — ${opt.description}`}`),
    ],
  }))
}

/** Best-effort error code read (UserQuestionError carries `code`). */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

/** Render the answered card: one section per question, the click verbatim. */
function answerSections(
  questions: readonly ParsedQuestion[],
  answer: AskUserQuestionAnswer,
): readonly { title: string; lines: string[] }[] {
  return questions.map((q, i) => {
    const id = `q${i + 1}`
    const item = answer.answers.find(a => a.id === id)
    const picked = (item?.selected ?? []).filter(label => label !== '')
    const custom = item?.custom?.trim() ?? ''
    const lines = [
      q.question,
      ...(picked.length > 0
        ? [`客户选择：${picked.join('、')}`]
        : custom !== ''
          ? [`客户未点选项，补充了文字：「${custom}」`]
          : ['客户未选择（该问题被跳过）——不要替客户补一个答案']),
      ...(picked.length > 0 && custom !== '' ? [`客户补充：「${custom}」`] : []),
    ]
    return { title: `问题 ${i + 1} · 结果`, lines }
  })
}

/** Build the userQuestions request item for one parsed question. */
function requestItem(q: ParsedQuestion, index: number): AskUserQuestionRequest['questions'][number] {
  return {
    id: `q${index + 1}`,
    question: q.question,
    ...(q.detail === undefined ? {} : { detail: q.detail }),
    header: q.header ?? 'BAF 选择卡',
    options: q.options.map(o => ({
      label: o.label,
      ...(o.description === undefined ? {} : { description: o.description }),
    })),
  }
}

/**
 * Register the `baf_question_ask` tool on the host `tools` registry.
 *
 * @param ctx - cordis context; `tools` is injected, `userQuestions` is
 *   resolved lazily (a composition without it keeps the card-only tool).
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'baf_question_ask',
    description,
    parameters: {
      questions: {
        type: 'array',
        required: true,
        description: '1-4 questions to pop as one clickable card. Each question carries its own 2-4 options; the customer clicks one option per question.',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            question: { type: 'string', required: true, description: 'The question in plain customer language.' },
            detail: { type: 'string', description: 'Optional context paragraph shown under the question (why you are asking, what depends on it).' },
            header: { type: 'string', description: 'Optional short heading for the question; defaults to 「BAF 选择卡」.' },
            options: {
              type: 'array',
              required: true,
              description: '2-4 clickable options.',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  label: { type: 'string', required: true, description: 'Short option label the customer clicks.' },
                  description: { type: 'string', description: 'One sentence saying what picking this option means.' },
                },
              },
            },
          },
        },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => value as unknown as ContentBlock[],
    },
    execute: async (args, exec) => {
      const parsed = parseQuestions(args)
      if ('reason' in parsed) {
        return [textBlock(formatCommandReport(false, 'BAF 选择卡 · 参数不合法，未弹出', [
          { title: '原因', lines: [parsed.reason] },
          { title: '用法', lines: ['questions: 1-4 个问题，每个 2-4 个选项（label + 可选 description）'] },
        ]))] as unknown as JsonValue[]
      }
      const service = resolveUserQuestionsForTool(ctx, exec.agent)
      if (service === undefined || exec.agent === undefined) {
        // No answerer (CLI / test composition) — degrade to the verbatim card.
        // This is the ONLY sanctioned non-dialog shape, and it still does not
        // invite the model to re-ask as prose options.
        return [textBlock(formatCommandReport(false, 'BAF 选择卡 · 当前环境无法弹卡', [
          ...questionSections(parsed.questions),
          {
            title: '结果',
            lines: [
              '本环境没有可用的弹窗通道，卡片没有弹出。',
              '不要改为在消息里罗列 A/B/C 选项；可如实转述上方问题与选项，等客户答复后继续（仅此降级场景）。',
            ],
          },
        ]))] as unknown as JsonValue[]
      }
      const agent = exec.agent
      const cwd = agentCwd(agent)
      // §22.19: the card rides the session's single-flight ask queue — it
      // waits behind any in-flight workflow gate instead of covering it, and
      // an identical card already queued collapses to one pop.
      const sessionId = agentSessionId(agent)
      try {
        const queued = await enqueueAsk({
          sessionId,
          key: `question:${parsed.questions.map(q => q.question).join('|').slice(0, 120)}`,
          ...(exec.signal === undefined ? {} : { signal: exec.signal }),
          run: controller => service.ask({
            questions: parsed.questions.map(requestItem),
            agent,
            signal: controller.signal,
          }),
        })
        if (queued.kind !== 'answered') {
          return [textBlock(formatCommandReport(false, 'BAF 选择卡 · 客户暂未选择', [
            ...questionSections(parsed.questions),
            {
              title: '结果',
              lines: [
                '客户暂未选择（关闭了选择框，或这张卡已由其他弹卡通道处理）。',
                '不要替客户决定；可再次调用本工具重弹这张卡，或等客户明确说出倾向后再继续。',
              ],
            },
          ]))] as unknown as JsonValue[]
        }
        const answer = queued.value
        return [textBlock(formatCommandReport(true, 'BAF 选择卡 · 客户已点选', [
          ...answerSections(parsed.questions, answer),
          ...(cwd === undefined ? [] : [{ title: '工作区', lines: [`cwd: ${cwd}`] }]),
        ]))] as unknown as JsonValue[]
      } catch (error) {
        // Same taxonomy the §22 gate dialogs use: X-button / abort = the
        // customer walked away (paused); anything else = no dialog could show.
        const code = errorCode(error)
        if (code === 'ASK_CANCELLED' || code === 'ASK_ABORTED') {
          return [textBlock(formatCommandReport(false, 'BAF 选择卡 · 客户暂未选择', [
            ...questionSections(parsed.questions),
            {
              title: '结果',
              lines: [
                '客户暂未选择（关闭了选择框）。',
                '不要替客户决定；可再次调用本工具重弹这张卡，或等客户明确说出倾向后再继续。',
              ],
            },
          ]))] as unknown as JsonValue[]
        }
        return [textBlock(formatCommandReport(false, 'BAF 选择卡 · 弹卡失败', [
          ...questionSections(parsed.questions),
          {
            title: '结果',
            lines: [
              `选择框不可用（${code ?? 'ask failed'}）；上方是问题与选项原文。`,
              '稍后重试本工具；不要改为在消息里罗列 A/B/C 选项。',
            ],
          },
        ]))] as unknown as JsonValue[]
      }
    },
  }))
}
