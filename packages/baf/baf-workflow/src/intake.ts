/**
 * Change intake classifier: keyword suggest + model evaluation + rule review.
 *
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the classifier used to answer
 * with one of TWO fixed tiers (0.7 on a keyword hit, 0.4 otherwise) and its
 * keyword lists were ASCII-only — the Chinese alternatives in the old regexes
 * could never match, because `\b` is an ASCII word boundary and Chinese
 * characters are not word characters. A pure-Chinese requirement therefore
 * always landed on 「待定 · 40%」.
 *
 * The classifier now has three layers:
 *   1. KEYWORDS — plain substring lists (Chinese-safe). A requirement that
 *      hits exactly one path keyword is a DIRECT hit: confidence 100%.
 *   2. THE MODEL — when no keyword decides, the host plane asks the model to
 *      evaluate the requirement and returns a real percentage per path
 *      (see {@link IntakeConfidenceEvaluator}).
 *   3. THE RULES — the baseline/scope policy still has the last word on which
 *      path may run at all (a public-API change can never take the fast path).
 *
 * @module @deepseek-ai/dsh-baf-workflow/intake
 */

import {
  generateChangeId,
  type AffectedScope,
  type BaselineManifest,
  type ChangeIntake,
  type ChangeKind,
  type IntakeConfidenceSource,
  type IntakeInput,
  type IntakePathConfidence,
  type WorkflowMode,
} from '@deepseek-ai/dsh-baf-core'
import { OPENSPEC_ROOT } from '@deepseek-ai/dsh-baf-openspec'

/** Candidate produced by suggest() before rule review. */
export interface IntakeCandidate {
  readonly kind: ChangeKind
  readonly mode: WorkflowMode
  readonly affectedScope: AffectedScope
  readonly confidence: number
  readonly reasonCodes: readonly string[]
  readonly summary: string
  readonly openspecRequired: boolean
  /** 【变更】2026-10-29 (批次三十七): where the confidence came from. */
  readonly confidenceSource: IntakeConfidenceSource
  /** 【变更】2026-10-29 (批次三十七): the path the confidence points at. */
  readonly recommendedMode: WorkflowMode
}

/** Rule-engine review result. */
export interface IntakeReview {
  readonly kind: ChangeKind
  readonly mode: WorkflowMode
  readonly affectedScope: AffectedScope
  readonly confidence: number
  readonly reasonCodes: readonly string[]
  readonly openspecRequired: boolean
  readonly requiresUserConfirmation: boolean
  readonly confidenceSource: IntakeConfidenceSource
  readonly recommendedMode: WorkflowMode
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the keyword groups the
 * classifier matches on. Plain substrings — a Chinese requirement must match
 * too, so no ASCII word boundaries here.
 */
export const INTAKE_KEYWORDS = {
  /** A new capability: the full path. */
  feature: [
    'feat', 'feature', '新增', '新功能', '需求', '实现', '支持', '接入', '增加', '添加',
    '开发', 'add support', 'new requirement', 'implement', 'support',
  ],
  /** A defect: the fast path when the blast radius allows it. */
  bug: [
    'bug', 'fix', '修复', '缺陷', 'crash', '回归', 'regress', '报错', '崩溃',
    '失效', '不生效', '死机', '乱码', '泄漏',
  ],
  /** A rework — usually a wide, multi-module change: the full path. */
  rework: [
    '重构', 'refactor', '重写', 'rewrite', '迁移', 'migration', '架构', 'architecture',
    '改造', '拆分', '解耦', '重整', '替换', 'replace', 'cleanup', '清理',
  ],
  /** A wide change — the full path, with a raised blast radius. */
  broad: [
    '大范围', '全面', '整体', '多模块', '跨模块', '全局', '所有模块', '批量', '系统性',
    'cross-module', 'cross module', 'everywhere', '全量',
  ],
} as const

/** One keyword group's id. */
export type IntakeKeywordGroup = keyof typeof INTAKE_KEYWORDS

/** What the keyword layer found in the requirement text. */
export interface IntakeKeywordSignals {
  readonly feature: boolean
  readonly bug: boolean
  readonly rework: boolean
  readonly broad: boolean
  /** The literal keywords that matched (for the reason codes). */
  readonly matched: readonly string[]
  /** The groups that matched. */
  readonly groups: readonly IntakeKeywordGroup[]
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the model's verdict on one
 * requirement. `pathConfidence` carries a REAL percentage per path (0..100) —
 * the recommended path is the higher of the two.
 */
export interface IntakeConfidenceVerdict {
  readonly kind: ChangeKind
  readonly affectedScope: AffectedScope
  readonly pathConfidence: IntakePathConfidence
  readonly reason?: string
}

/**
 * The hook the host plane injects so the classifier can ask a model how
 * confident it is. It never throws: a failed evaluation returns undefined and
 * the classifier falls back to the keyword/default answer.
 */
export type IntakeConfidenceEvaluator = (input: {
  readonly description: string
  readonly kind: ChangeKind
  readonly affectedScope: AffectedScope
}) => Promise<IntakeConfidenceVerdict | undefined>

/**
 * Match the requirement text against the keyword groups.
 *
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): substring matching, so Chinese
 * works; ASCII keywords match on a word-ish boundary so 「prefix」 does not
 * trigger 「fix」.
 * @param text - the requirement description.
 * @returns the matched groups and keywords.
 */
export function matchIntakeKeywords(text: string): IntakeKeywordSignals {
  const haystack = text.toLowerCase()
  const matched: string[] = []
  const groups: IntakeKeywordGroup[] = []
  for (const group of Object.keys(INTAKE_KEYWORDS) as IntakeKeywordGroup[]) {
    let hit = false
    for (const keyword of INTAKE_KEYWORDS[group]) {
      const needle = keyword.toLowerCase()
      const found = /^[a-z]/.test(needle)
        ? new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack)
        : haystack.includes(needle)
      if (!found) continue
      hit = true
      matched.push(keyword)
    }
    if (hit) groups.push(group)
  }
  return {
    feature: groups.includes('feature'),
    bug: groups.includes('bug'),
    rework: groups.includes('rework'),
    broad: groups.includes('broad'),
    matched,
    groups,
  }
}

/**
 * Heuristic suggest (Phase 4) — the KEYWORD layer.
 *
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): a requirement that hits exactly
 * one path keyword is a DIRECT hit and answers with 100%; a requirement that
 * hits both a defect and a capability/rework keyword is AMBIGUOUS and is left
 * to the model (its answer decides the path and the percentage).
 * @param input - intake input.
 * @returns candidate classification.
 */
export function suggestIntake(input: IntakeInput): IntakeCandidate {
  const text = input.description
  const scopeHint = input.affectedScopeHint ?? 'unknown'
  const signals = matchIntakeKeywords(text)
  const reasonCodes: string[] = []

  let kind: ChangeKind = 'unknown'
  let confidence = 0.45
  let confidenceSource: IntakeConfidenceSource = 'default'
  let recommendedMode: WorkflowMode = 'full-go-path'
  const ambiguous = signals.bug && (signals.feature || signals.rework)

  if (ambiguous) {
    // 【变更】2026-10-29 (批次三十七): a requirement that reads as BOTH a
    // defect and a rework is exactly the case the model must judge.
    reasonCodes.push('keyword-ambiguous')
  } else if (signals.bug) {
    kind = 'bug'
    confidence = 1
    confidenceSource = 'keyword'
    recommendedMode = 'bug-fix-path'
    reasonCodes.push('keyword-bug')
  } else if (signals.feature || signals.rework) {
    kind = 'new-requirement'
    confidence = 1
    confidenceSource = 'keyword'
    recommendedMode = 'full-go-path'
    reasonCodes.push(signals.rework ? 'keyword-rework' : 'keyword-feature')
  } else {
    reasonCodes.push('keyword-unknown')
  }

  let affectedScope: AffectedScope = scopeHint
  if (signals.broad) {
    // 【变更】2026-10-30 (用户问题 8): only the customer's OWN breadth words
    // set the scope. The rework group (重构 / 迁移 / 改造 …) says what KIND of
    // change this is, never how wide it is — a rework of ONE module read as
    // 「跨模块」 on the classification card although no file had been touched
    // yet. The scope is settled by the plan's frozen file list (see
    // `deriveScopeFromAllowlist`), so until then it stays 待定.
    affectedScope = 'cross-module'
    reasonCodes.push('keyword-broad-scope')
  } else if (PUBLIC_API_RE.test(text)) {
    affectedScope = 'public-api'
    reasonCodes.push('heuristic-public-api')
  } else if (CROSS_RE.test(text)) {
    affectedScope = 'cross-module'
    reasonCodes.push('heuristic-cross-module')
  }

  const mode: WorkflowMode = kind === 'bug' && (affectedScope === 'single-file' || affectedScope === 'small-local')
    ? 'bug-fix-path'
    : kind === 'unknown'
      ? 'clarify-required'
      : 'full-go-path'

  return {
    kind,
    mode,
    affectedScope,
    confidence,
    reasonCodes,
    summary: text.trim().slice(0, 500),
    openspecRequired: mode === 'full-go-path',
    confidenceSource,
    recommendedMode,
  }
}

/** The public-API / cross-module scope probes (ASCII word-ish boundaries). */
const PUBLIC_API_RE = /\b(public\s+api|abi|header\s+api|breaking)\b/i
const CROSS_RE = /\b(cross[- ]?module|integration)\b/i

/**
 * Rule-engine review of a candidate against baseline policy and scope facts.
 * @param candidate - suggest() output.
 * @param baseline - optional baseline (missing blocks fast path).
 * @returns reviewed decision fields.
 */
export function reviewIntake(
  candidate: IntakeCandidate,
  baseline: BaselineManifest | undefined,
): IntakeReview {
  const reasonCodes = [...candidate.reasonCodes]
  const kind = candidate.kind
  const affectedScope = candidate.affectedScope
  let { mode, confidence, openspecRequired } = candidate

  const forceFullGoPathScopes: AffectedScope[] = ['cross-module', 'public-api']
  if (forceFullGoPathScopes.includes(affectedScope)) {
    mode = 'full-go-path'
    openspecRequired = true
    reasonCodes.push(`scope-forces-full-go-path:${affectedScope}`)
  }

  if (kind === 'new-requirement') {
    mode = 'full-go-path'
    openspecRequired = true
    reasonCodes.push('new-requirement-full-go-path')
  }

  if (mode === 'bug-fix-path') {
    if (baseline === undefined) {
      mode = 'full-go-path'
      openspecRequired = true
      reasonCodes.push('baseline_unavailable')
      confidence = Math.min(confidence, 0.5)
    } else if (!baseline.workflow.bugFixPath.allowed) {
      mode = 'full-go-path'
      openspecRequired = true
      reasonCodes.push('fast-path-disallowed')
    } else {
      const max = baseline.workflow.bugFixPath.maxScope
      const order = ['single-file', 'small-local', 'cross-module', 'public-api', 'unknown'] as const
      if (order.indexOf(affectedScope) > order.indexOf(max) || affectedScope === 'unknown') {
        mode = 'full-go-path'
        openspecRequired = true
        reasonCodes.push('scope-exceeds-fast-path')
      } else {
        openspecRequired = false
        reasonCodes.push('fast-path-allowed')
      }
    }
  }

  // 【变更】2026-10-29 (批次三十七 · 用户问题 4): the low-confidence guard now
  // reads the model's own percentage — a requirement the model is unsure
  // about still goes to the clarification branch instead of guessing.
  // 【变更】2026-10-30 (用户问题 8): an UNSETTLED scope alone no longer sends
  // the change into the clarification branch: the scope is settled by the
  // plan's frozen file list, and a new requirement's PATH is already decided
  // by its kind (完整流程). Only a DEFECT depends on the scope — the fast path
  // is only legal for a small blast radius — so an unsettled scope still asks
  // the customer which path to take there.
  const scopeUndecided = affectedScope === 'unknown'
  if (kind === 'unknown' || confidence < 0.55 || (scopeUndecided && kind === 'bug')) {
    mode = 'clarify-required'
    reasonCodes.push('clarify-required')
  }

  if (baseline?.workflow.requireOpenSpec === true && mode === 'full-go-path') {
    openspecRequired = true
  }

  // The recommended path follows the SCOPE rules even when the mode fell back
  // to `clarify-required`: the gate still points at the better guess.
  const recommendedMode: WorkflowMode = mode === 'bug-fix-path'
    ? 'bug-fix-path'
    : mode === 'full-go-path'
      ? 'full-go-path'
      : candidate.recommendedMode

  return {
    kind,
    mode,
    affectedScope,
    confidence,
    reasonCodes: Object.freeze(reasonCodes),
    openspecRequired,
    requiresUserConfirmation: true,
    confidenceSource: candidate.confidenceSource,
    recommendedMode,
  }
}

/**
 * Synthesize a durable ChangeIntake from input + review.
 * @param input - intake input.
 * @param review - rule review.
 * @param changeId - optional pre-minted id.
 * @returns ChangeIntake pending confirmation.
 */
export function decideIntake(
  input: IntakeInput,
  review: IntakeReview,
  changeId: string = generateChangeId(input.description),
  pathConfidence?: IntakePathConfidence,
): ChangeIntake {
  return {
    changeId,
    kind: review.kind,
    mode: review.mode,
    affectedScope: review.affectedScope,
    confidence: review.confidence,
    confidenceSource: review.confidenceSource,
    recommendedMode: review.recommendedMode,
    ...(pathConfidence === undefined ? {} : { pathConfidence }),
    reasonCodes: review.reasonCodes,
    openspecRequired: review.openspecRequired,
    requiresUserConfirmation: review.requiresUserConfirmation,
    confirmation: 'pending',
    summary: input.description.trim().slice(0, 500),
  }
}

/**
 * Run suggest → review → decide for one intake request (no model).
 * @param input - intake input.
 * @returns pending ChangeIntake.
 */
export function classifyIntake(input: IntakeInput): ChangeIntake {
  const candidate = suggestIntake(input)
  const review = reviewIntake(candidate, input.baseline)
  return decideIntake(input, review)
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): classify with the model's own
 * evaluation.
 *
 * The model is asked ONLY when the keyword layer could not decide (no
 * keyword, or an ambiguous requirement). A direct keyword hit stays at 100%
 * without a model round-trip — the requirement named its own kind.
 * @param input - intake input.
 * @param evaluator - the host plane's model hook (optional).
 * @returns pending ChangeIntake.
 */
export async function classifyIntakeWithConfidence(
  input: IntakeInput,
  evaluator?: IntakeConfidenceEvaluator,
): Promise<ChangeIntake> {
  const candidate = suggestIntake(input)
  const ambiguous = candidate.confidenceSource === 'default'
  if (evaluator === undefined || !ambiguous) {
    const review = reviewIntake(candidate, input.baseline)
    return decideIntake(input, review)
  }

  let verdict: IntakeConfidenceVerdict | undefined
  try {
    verdict = await evaluator({
      description: input.description,
      kind: candidate.kind,
      affectedScope: candidate.affectedScope,
    })
  } catch {
    verdict = undefined
  }
  if (verdict === undefined) {
    const review = reviewIntake(candidate, input.baseline)
    return decideIntake(input, review)
  }

  const full = clampPercent(verdict.pathConfidence['full-go-path'])
  const bug = clampPercent(verdict.pathConfidence['bug-fix-path'])
  const recommendedMode: WorkflowMode = bug > full ? 'bug-fix-path' : 'full-go-path'
  const confidence = Math.max(full, bug) / 100
  const kind: ChangeKind = verdict.kind === 'unknown' ? candidate.kind : verdict.kind
  // 【变更】2026-10-30 (用户问题 8): the model's SCOPE guess is NOT taken as
  // the change's scope. The model reads a requirement text, not the code
  // base — it cannot know which modules the change will touch, and a guess
  // froze the card on 「跨模块」 before a single file existed. The scope is
  // settled by the plan's frozen file list instead (deriveScopeFromAllowlist).
  const affectedScope: AffectedScope = candidate.affectedScope

  const reviewed = reviewIntake({
    ...candidate,
    kind,
    affectedScope,
    confidence,
    confidenceSource: 'llm',
    recommendedMode,
    mode: recommendedMode,
    openspecRequired: recommendedMode === 'full-go-path',
    reasonCodes: [...candidate.reasonCodes, 'model-evaluated'],
  }, input.baseline)

  return decideIntake(input, reviewed, undefined, { 'full-go-path': full, 'bug-fix-path': bug })
}

/**
 * Clamp one percentage into 0..100.
 * @param value - the raw score.
 * @returns the clamped percentage.
 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * The workspace roots that hold the workflow's OWN documents and state — the
 * change's OpenSpec directory and the BAF state directory. A file under one of
 * them is process output, never product code.
 */
const PROCESS_ROOTS: readonly string[] = [OPENSPEC_ROOT, '.baf']

/**
 * Whether one allowlist entry is a process artifact rather than product code.
 * @param file - workspace-relative path.
 * @returns true when the path lives under a process root.
 */
function isProcessArtifact(file: string): boolean {
  const root = file.split(/[\\/]/)[0]
  return root !== undefined && PROCESS_ROOTS.includes(root)
}

/**
 * The module a file belongs to — its FIRST path segment. A file at the
 * workspace root is its own module (the build file is not part of `ecum/`).
 * @param file - workspace-relative path.
 * @returns the module root.
 */
function moduleRootOf(file: string): string {
  const [root] = file.split(/[\\/]/)
  return root ?? file
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 3): derive the 影响范围 from the
 * plan's frozen file allowlist.
 *
 * 【变更】2026-10-30 (用户问题 8b): the rule follows the CUSTOMER's words —
 * 「如果都在一个目录下，则显示为模块内，如果出现不同目录下的则为跨模块」:
 *
 * - no product file yet → 待确定 (unknown);
 * - every product file under ONE module root → 模块内 (small-local);
 * - product files under SEVERAL module roots → 跨模块 (cross-module).
 *
 * The rule counts MODULE ROOTS — the first path segment of every PRODUCT file
 * in the list. The workflow's own documents (the OpenSpec change directory,
 * the BAF state directory) are process output and never form a module root.
 *
 * The old rule counted FILES (one file → 单文件, up to three → 局部小改, more
 * → 跨模块) — 「跨模块」 names a change that reaches MODULES, so a
 * single-module rework of fourteen files read as 「跨模块」 although it touched
 * one module.
 * @param allowlist - the plan's frozen file list.
 * @returns the derived scope.
 */
export function deriveScopeFromAllowlist(
  allowlist: readonly string[],
): AffectedScope {
  return deriveScopeFromFiles(allowlist)
}

/**
 * 【变更】2026-10-30 (用户问题 8b): the same derivation over ANY file list —
 * the plan's allowlist, the ledger's touched set, or their union.
 * @param files - workspace-relative file paths.
 * @returns the derived scope ('unknown' while no product file is known).
 */
export function deriveScopeFromFiles(
  files: readonly string[],
): AffectedScope {
  const productFiles = files.filter(file => !isProcessArtifact(file))
  if (productFiles.length === 0) return 'unknown'
  const roots = new Set(productFiles.map(moduleRootOf))
  return roots.size > 1 ? 'cross-module' : 'small-local'
}
