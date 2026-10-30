/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the intake confidence
 * evaluator — the model call that replaces the classifier's two fixed tiers
 * with a real percentage.
 *
 * The call is auxiliary, not a turn: `purpose: 'intake-confidence'` says so,
 * the requirement is the single user message, and nothing is written to the
 * session log. The model answers with one JSON object:
 *
 *   {"kind":"new-requirement|bug|maintenance|unknown",
 *    "confidence":{"full-go-path":0-100,"bug-fix-path":0-100},
 *    "reason":"不超过 30 字的中文理由"}
 *
 * 【变更】2026-10-30 (用户问题 8): the model no longer judges the 影响范围 —
 * it reads a requirement text, not the code base, and its guess froze the
 * classification card on 「跨模块」 before a single file existed. The scope is
 * settled by the plan's frozen file list (deriveScopeFromAllowlist).
 *
 * The parser is tolerant (the model may wrap the object in prose or a code
 * fence); anything it cannot read yields undefined, and the classifier falls
 * back to its keyword answer. A failed evaluation never blocks the intake.
 *
 * @module ui-baf-workflow/intake-evaluator
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { AffectedScope, ChangeKind } from '@deepseek-ai/dsh-baf-core'
import type { IntakeConfidenceVerdict } from '@deepseek-ai/dsh-baf-workflow'

/** The system prompt one evaluation runs under. */
export const INTAKE_CONFIDENCE_SYSTEM = [
  '你是变更分类评估器。根据用户的需求描述，判断它应该走哪条处理路径，并给出置信度。',
  '',
  '两条路径：',
  '- full-go-path：完整流程（澄清→设计→计划→实现→验证→归档）。适合新功能、重构、跨模块或大范围修改。',
  '- bug-fix-path：缺陷修复路径（先写回归测试，再修根因）。只适合影响面很小的缺陷。',
  '',
  'kind 取值：new-requirement（新需求）/ bug（缺陷）/ maintenance（维护）/ unknown（待定）。',
  '',
  'confidence 给出两条路径各自的把握程度（0-100 的整数）：把握越大越接近 100，两条路径可以都低（说明需求本身说不清）。',
  '',
  '不要判断影响范围（你看不到代码，改动会碰到哪些模块由计划阶段冻结的文件清单决定）。',
  '',
  '只输出一个 JSON 对象，不要输出其它文字：',
  '{"kind":"...","confidence":{"full-go-path":0,"bug-fix-path":0},"reason":"不超过 30 字的中文理由"}',
].join('\n')

/** The output cap one evaluation runs under. */
export const INTAKE_CONFIDENCE_MAX_TOKENS = 512

/** The route one evaluation runs on. */
export interface IntakeEvaluationRoute {
  readonly provider: string
  readonly model: string
}

const KINDS: readonly ChangeKind[] = ['new-requirement', 'bug', 'maintenance', 'unknown']

/**
 * Read one percentage out of the model's answer.
 * @param value - the raw score.
 * @returns the clamped percentage, or undefined when the value is not a number.
 */
function percent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Parse the model's answer into a verdict.
 *
 * The model is free to wrap the JSON in prose or a code fence; the parser
 * takes the first balanced object it finds.
 * @param text - the model's answer.
 * @returns the verdict, or undefined when the answer carries no usable JSON.
 */
export function parseIntakeConfidence(text: string): IntakeConfidenceVerdict | undefined {
  const start = text.indexOf('{')
  if (start < 0) return undefined
  const end = text.lastIndexOf('}')
  if (end <= start) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const row = parsed as { kind?: unknown; scope?: unknown; affectedScope?: unknown; confidence?: unknown; reason?: unknown }
  const scores = (typeof row.confidence === 'object' && row.confidence !== null)
    ? row.confidence as { 'full-go-path'?: unknown; 'bug-fix-path'?: unknown }
    : {}
  const full = percent(scores['full-go-path'])
  const bug = percent(scores['bug-fix-path'])
  if (full === undefined && bug === undefined) return undefined
  const kind = KINDS.includes(row.kind as ChangeKind) ? row.kind as ChangeKind : 'unknown'
  // 【变更】2026-10-30 (用户问题 8): the model no longer judges the scope —
  // it cannot see the code base, and the scope is settled by the plan's
  // frozen file list. A scope in the answer is tolerated but never read.
  const scope: AffectedScope = 'unknown'
  const reason = typeof row.reason === 'string' ? row.reason.trim().slice(0, 60) : ''
  return {
    kind,
    affectedScope: scope,
    pathConfidence: {
      'full-go-path': full ?? 0,
      'bug-fix-path': bug ?? 0,
    },
    ...(reason === '' ? {} : { reason }),
  }
}

/**
 * Ask the model how confident it is about one requirement.
 *
 * The evaluator NEVER throws and never blocks: a missing route, a provider
 * error or an unreadable answer all resolve to undefined, and the classifier
 * keeps its keyword answer.
 * @param ctx - host context (owns `ctx.llm`).
 * @param route - the route the evaluation runs on.
 * @param input - the requirement + what the keyword layer already guessed.
 * @returns the verdict, or undefined.
 */
export async function evaluateIntakeConfidence(
  ctx: Context,
  route: IntakeEvaluationRoute | undefined,
  input: { readonly description: string; readonly kind: ChangeKind; readonly affectedScope: AffectedScope },
): Promise<IntakeConfidenceVerdict | undefined> {
  if (route === undefined) return undefined
  const messages: RequestMessage[] = [
    {
      role: 'user',
      content: [{
        type: 'text',
        text: [
          '需求描述：',
          input.description.trim().slice(0, 2000),
          '',
          `关键词初步判断：类型=${input.kind}，影响范围=${input.affectedScope}`,
        ].join('\n'),
      }],
    },
  ]
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
    system: INTAKE_CONFIDENCE_SYSTEM,
    maxTokens: INTAKE_CONFIDENCE_MAX_TOKENS,
    purpose: 'intake-confidence',
  }
  try {
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') return undefined
    const text = assembler.blocks()
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
    if (text === '') return undefined
    return parseIntakeConfidence(text)
  } catch {
    return undefined
  }
}
