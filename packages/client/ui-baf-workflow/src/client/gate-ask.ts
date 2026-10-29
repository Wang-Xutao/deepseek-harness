/**
 * 【变更】2026-09-25 (用户需求 工作流 1/2): the BAF workflow ask-channel contract.
 *
 * Every workflow decision the host pops on the session (§22 gate dialogs via
 * `askGateDialog`, the auto-pop pre-question, the `baf_gate_ask` bootstrap)
 * rides the platform `userQuestions` waterfall with `header: 'BAF 工作流'`
 * and exactly ONE question whose options are the registered gate options.
 * Business questions (`baf_question_ask`) carry `header: 'BAF 选择卡'` and
 * must keep the generic composer flow — the header is the discriminator.
 *
 * This module is deliberately duck-typed (no import from
 * ui-user-questions): the composer chain selector runs at render time in
 * this package, and a structural read keeps the two client packages
 * decoupled while still matching the PendingQuestion carrier exactly.
 *
 * 【变更】2026-09-28 (用户问题 1.1/1.2/1.5/1.7): the dialog `detail` now
 * carries a wire protocol on top of the plain-paragraph contract —
 *
 * - optional first line `{{change:<changeId>}}` → the 变更 chip (top-right,
 *   NEVER inside the body copy — 用户问题 1.2);
 * - 【…】-titled sections whose lines are `- ` list items (用户问题 1.1 —
 *   segmented lists/tables, not one prose dump);
 * - `- {{art:<workspace-relative path>}} <label>` list lines → clickable
 *   artifact chips (用户问题 1.5 — open the produced document directly).
 *
 * `gateAskViewOf` projects all three; renderers decide layout.
 * @module ui-baf-workflow/gate-ask
 */

/** The header every BAF workflow dialog carries (askGateDialog / auto-pop). */
export const BAF_GATE_HEADER = 'BAF 工作流'

/**
 * One clickable option as this package renders it. `hint` is the option's
 * description MINUS the technical lines — `将执行 /baf-… change=…` dispatch
 * detail is model-facing copy, not customer copy (用户需求 工作流 2: 无技术细节).
 *
 * 【变更】2026-10-28 (用户问题 1.3): the /baf-go hint lines (「需要继续时再敲
 * 一次 /baf-go」) are CUSTOMER copy and must survive the filter — only the
 * `将执行`-prefixed dispatch lines are dropped now.
 *
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): `recommended` marks the option
 * the classifier recommends (the higher-confidence path) — the composer
 * renders it with a 「推荐」 badge.
 */
export interface GateAskOptionView {
  readonly label: string
  readonly hint?: string
  readonly recommended?: boolean
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the marker the host puts in
 * front of the recommended option's description. The host side is
 * `RECOMMENDED_OPTION_MARKER` in baf-workflow/gate-dialog.ts; the two strings
 * are kept in step by this constant's comment (the client package does not
 * import the host bundle).
 */
export const RECOMMENDED_OPTION_MARKER = '【推荐】'

/** One openable artifact chip (用户问题 1.5 — the 【产物】 section's rows). */
export interface GateAskArtifact {
  /** Workspace-relative path (`openspec/changes/<id>/<file>`). */
  readonly path: string
  /** Customer-facing label (the text after the token). */
  readonly label: string
}

/** One `- ` list item; an artifact row carries its chip alongside the text. */
export interface GateAskItem {
  readonly text: string
  readonly artifact?: GateAskArtifact
}

/** Body block: a plain paragraph or a bulleted list (用户问题 1.1 分段). */
export type GateAskBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly GateAskItem[] }

/** One 【…】-titled section of the dialog body (untitled = the lead-in). */
export interface GateAskSection {
  /** Section title without the 【】 brackets (状态变化 / 完成情况 / …). */
  readonly title?: string
  readonly blocks: readonly GateAskBlock[]
}

/** One BAF workflow ask projected for rendering (title / body / options). */
export interface GateAskView {
  readonly id: string
  readonly title: string
  /** 变更 id from the `{{change:…}}` first line, when present (用户问题 1.2). */
  readonly changeId?: string
  /** Segmented body: untitled lead-in + one section per 【…】 heading. */
  readonly sections: readonly GateAskSection[]
  /** Every artifact chip the body carries, in order (用户问题 1.5). */
  readonly artifacts: readonly GateAskArtifact[]
  /**
   * Whether the dialog offers the revision input (用户问题 1.7): true whenever
   * the host attached artifacts — those are exactly the gates whose revision
   * loop the host can dispatch (`gateRevisionTarget`).
   */
  readonly allowsRevise: boolean
  readonly options: readonly GateAskOptionView[]
}

/**
 * Structural (duck-typed) view of ui-user-questions' `PendingQuestion`
 * carrier — only the fields this package reads or calls. `custom` is the
 * platform's free-text answer field (AskUserQuestionAnswerItem), which the
 * revision input (用户问题 1.7) answers through.
 */
export interface GateAskCarrier {
  readonly sessionId: string
  readonly questions: readonly unknown[]
  answer(answer: { answers: { id: string; selected: string[]; custom?: string }[] }): unknown
}

/** Raw option row as it arrives on the wire (AskUserQuestionOption). */
interface RawOption {
  readonly label?: unknown
  readonly description?: unknown
}

/** Raw question row as it arrives on the wire (AskUserQuestionItem). */
interface RawQuestion {
  readonly id?: unknown
  readonly question?: unknown
  readonly detail?: unknown
  readonly header?: unknown
  readonly options?: unknown
}

/**
 * 暂不推进-style options render as the quiet secondary (用户问题 1.6) — the
 * confirm button takes the emphasis; the FIRST non-secondary option is the
 * primary. Shared by the session card and the Tab's live-gate card so both
 * surfaces emphasize the same button.
 */
export function isSecondaryOptionLabel(label: string): boolean {
  return label.startsWith('暂不') || label.startsWith('只是')
}

/**
 * 【变更】2026-10-07 (九点批 问题 2): the node whose work order a gate card's
 * confirm dispatches — the closed-set mirror of `advanceGateIdForNode` +
 * `GATE_REGISTRY` (the question id on the wire IS the gate id). Stage-advance
 * gates dispatch the stage they advance INTO (the landed rest takes the work
 * order); the classify confirm installs the open-stage template; gates that
 * archive/init/escalate/replay dispatch nothing model-authored — null, no
 * preview line. Locked by the gates-overview projection test.
 */
const DISPATCH_NODE_OF_GATE: Readonly<Record<string, import('./tab-types.ts').WorkflowNodeId>> = {
  'intake-classify': 'open',
  'open-advance': 'clarify',
  'bugfix-open-advance': 'implement',
  'clarify-advance': 'design',
  'design-advance': 'plan',
  'plan-advance': 'implement',
  'verify-advance': 'verify',
  // The design park gate rides the wire as its REGISTRY confirm id
  // (go-coordinator maps design-to-plan → design-confirm), not the park name.
  'design-confirm': 'plan',
}

/**
 * The dispatch node for one gate id (see {@link DISPATCH_NODE_OF_GATE}).
 * @param gateId - the ask's question id (the GATE_REGISTRY id).
 * @returns the node the confirm's work order authors, or null.
 */
export function dispatchNodeOfGate(gateId: string | undefined): import('./tab-types.ts').WorkflowNodeId | null {
  if (gateId === undefined) return null
  return DISPATCH_NODE_OF_GATE[gateId] ?? null
}

/** Whole-line `{{change:<id>}}` marker (用户问题 1.2 wire protocol). */
const CHANGE_LINE = /^\{\{change:([^}]+)\}\}$/
/** List-line artifact token: `- {{art:<path>}} <label>` (用户问题 1.5). */
const ART_TOKEN = /^\s*\{\{art:([^}]+)\}\}\s*(.*)$/
/** 【…】 section heading — own line or leading a text line (用户问题 1.1). */
const SECTION_HEADING = /^【([^】]+)】\s*(.*)$/

/**
 * 【变更】2026-10-23 (批次十六 2.2): peel the optional `{{change:<id>}}` marker
 * off a body's first NON-EMPTY paragraph — shared by `gateAskViewOf` (dialog
 * detail) and the 门禁明细 GateCard (registry question), so both surfaces
 * parse the body without the raw token ever printing.
 */
export function peelChangeMarker(text: string): { body: string; changeId?: string } {
  const paragraphs = text.split('\n\n')
  const firstNonEmpty = paragraphs.findIndex(p => p.trim() !== '')
  if (paragraphs[firstNonEmpty] === undefined) return { body: text }
  const change = CHANGE_LINE.exec(paragraphs[firstNonEmpty].trim())
  if (change === null) return { body: text }
  return {
    body: [...paragraphs.slice(0, firstNonEmpty), ...paragraphs.slice(firstNonEmpty + 1)].join('\n\n'),
    // exactOptionalPropertyTypes: the key exists only when the wire sent it.
    ...(change[1] === undefined ? {} : { changeId: change[1] }),
  }
}

/**
 * Whether a pending interaction is a BAF workflow dialog: one question,
 * `header: 'BAF 工作流'`, and an `answer` verb. Everything else (business
 * 选择卡, generic questions, other plugins' carriers) returns false so the
 * composer chain falls through to the generic flow.
 */
export function isBafGatePending(pending: unknown): pending is GateAskCarrier {
  if (typeof pending !== 'object' || pending === null) return false
  const carrier = pending as { questions?: unknown; answer?: unknown; sessionId?: unknown }
  if (!Array.isArray(carrier.questions) || carrier.questions.length !== 1) return false
  if (typeof carrier.answer !== 'function') return false
  const question = carrier.questions[0] as RawQuestion | undefined
  return question?.header === BAF_GATE_HEADER
}

/**
 * Keep a description only when it is customer copy. `optionDescription`
 * (gate-dialog.ts) prefixes command dispatch lines with 将执行 — those are
 * dropped; the /baf-go resume hints and the auto-pop one-liners survive
 * (用户问题 1.3 puts 「再敲一次 /baf-go」 in the 暂不推进 hint on purpose).
 */
function optionHint(description: unknown): string | undefined {
  if (typeof description !== 'string') return undefined
  if (description.startsWith('将执行')) return undefined
  return description
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): split the recommendation
 * marker off an option's description. The marker rides the description (the
 * wire's option shape has no field for it); the badge is a separate element,
 * so the hint that remains is plain copy again.
 * @param description - the raw option description.
 * @returns the hint and whether the option is the recommended one.
 */
export function splitRecommendedOption(description: string | undefined): {
  readonly hint?: string
  readonly recommended: boolean
} {
  if (description === undefined) return { recommended: false }
  if (!description.startsWith(RECOMMENDED_OPTION_MARKER)) return { hint: description, recommended: false }
  const rest = description.slice(RECOMMENDED_OPTION_MARKER.length).trim()
  return rest === '' ? { recommended: true } : { hint: rest, recommended: true }
}

/**
 * One `- ` item line → a {@link GateAskItem}; an `{{art:…}}`-led line becomes
 * an artifact chip whose label is the trailing text (falling back to the file
 * name when the host sends a bare token).
 */
function parseItem(line: string): GateAskItem {
  const body = line.replace(/^-\s+/, '')
  const art = ART_TOKEN.exec(body)
  if (art === null) return { text: body }
  // noUncheckedIndexedAccess: group reads land as string via ?? '' (the
  // token regex has both groups mandatory, so the fallback is unreachable).
  const label = (art[2] ?? '').trim()
  const path = (art[1] ?? '').trim()
  const fallback = path.split('/').pop() ?? path
  const artifact = { path, label: label === '' ? fallback : label }
  return { text: artifact.label, artifact }
}

/**
 * Project a detected carrier into renderable copy.
 *
 * The `detail` field joins its paragraphs with blank lines (`\n\n` —
 * askGateDialog's contract). The optional `{{change:…}}` first line is peeled
 * off into {@link GateAskView.changeId}; the rest splits into 【…】 sections,
 * each holding `- ` list blocks and plain text blocks (用户问题 1.1).
 */
export function gateAskViewOf(pending: GateAskCarrier): GateAskView {
  const question = pending.questions[0] as RawQuestion | undefined
  const rawOptions = Array.isArray(question?.options) ? question.options as readonly RawOption[] : []
  const detail = typeof question?.detail === 'string' ? question.detail : ''

  // The `{{change:…}}` marker peels only when it is the FIRST non-empty
  // paragraph — leading blank paragraphs never block the peel (peelChangeMarker).
  const { body, changeId } = peelChangeMarker(detail)
  const sections = parseGateSections(body)

  const artifacts = sections.flatMap(section =>
    section.blocks.flatMap(block => block.kind === 'list' ? block.items : []).filter(item => item.artifact !== undefined))
    .map(item => item.artifact as GateAskArtifact)

  return {
    id: typeof question?.id === 'string' ? question.id : 'baf-gate',
    title: typeof question?.question === 'string' ? question.question : BAF_GATE_HEADER,
    // exactOptionalPropertyTypes: changeId exists only when the wire sent it.
    ...(changeId === undefined ? {} : { changeId }),
    sections,
    artifacts,
    allowsRevise: artifacts.length > 0,
    options: rawOptions
      .map((opt): GateAskOptionView => {
        const label = typeof opt.label === 'string' ? opt.label : ''
        // 【变更】2026-10-29 (批次三十七 · 用户问题 4): the recommendation
        // marker is split off the description first, so the hint stays plain
        // copy and the badge is its own element.
        const { hint, recommended } = splitRecommendedOption(optionHint(opt.description))
        // exactOptionalPropertyTypes: the hint key exists only with a value.
        return {
          label,
          ...(hint === undefined ? {} : { hint }),
          ...(recommended ? { recommended: true } : {}),
        }
      })
      .filter(opt => opt.label !== ''),
  }
}

/**
 * 【变更】2026-10-23 (批次十六 2.2): the standalone 【…】-section parser —
 * the same wire protocol `gateAskViewOf` speaks (paragraphs joined by blank
 * lines; 【…】 lines open sections, `- ` lines fold into list blocks), lifted
 * out so EVERY surface that holds a raw gate `question` string (the Tab's
 * pendingGate card, the workflow-top gate banner, the 门禁明细 GateCard) can
 * render the segmented body instead of one run-on paragraph.
 *
 * @param text - the body copy (a registry `question` or a dialog `detail`).
 * @returns the untitled lead-in plus one section per 【…】 heading.
 */
export function parseGateSections(text: string): readonly GateAskSection[] {
  const sections: GateAskSection[] = []
  // Parse state: consecutive `- ` lines fold into one list block; a 【…】 line
  // opens a new section; everything else is a text block.
  let currentBlocks: GateAskBlock[] = []
  let currentTitle: string | undefined
  const flushSection = (): void => {
    if (currentBlocks.length === 0) return
    // exactOptionalPropertyTypes: the title key exists only with a value.
    sections.push(currentTitle === undefined ? { blocks: currentBlocks } : { title: currentTitle, blocks: currentBlocks })
    currentBlocks = []
  }
  const pushItems = (items: GateAskItem[]): void => {
    if (items.length === 0) return
    currentBlocks.push({ kind: 'list', items })
  }

  for (const paragraph of text.split('\n\n')) {
    const trimmed = paragraph.trim()
    if (trimmed === '') continue
    const lines = trimmed.split('\n').map(line => line.trim()).filter(line => line !== '')
    let items: GateAskItem[] = []
    for (const line of lines) {
      const heading = SECTION_HEADING.exec(line)
      if (heading !== null) {
        pushItems(items); items = []
        flushSection()
        currentTitle = heading[1]
        // 【状态变化】提案（已完成）→ 澄清（待开始） — the heading shares its
        // line with the section's lead text; split, don't swallow.
        const rest = (heading[2] ?? '').trim()
        if (rest !== '') currentBlocks.push({ kind: 'text', text: rest })
        continue
      }
      if (line.startsWith('- ')) {
        items.push(parseItem(line))
        continue
      }
      pushItems(items); items = []
      currentBlocks.push({ kind: 'text', text: line })
    }
    pushItems(items)
  }
  flushSection()
  return sections
}

/**
 * Answer one option click through the carrier — the same channel the session
 * dialog click resolves through, so the host-side gate dispatch (slash
 * re-dispatch + work order) is identical for both surfaces.
 */
export function answerGateOption(pending: GateAskCarrier, view: GateAskView, label: string): void {
  void Promise.resolve(
    pending.answer({ answers: [{ id: view.id, selected: [label] }] }),
  ).catch(() => undefined)
}

/**
 * 【变更】2026-09-28 (用户问题 1.7): submit the revision input. The free-text
 * `custom` field is the platform's own extension point
 * (AskUserQuestionAnswerItem.custom) — the host's `askGateDialog` reads it
 * BEFORE any option, so an empty `selected` plus the text resolves the gate
 * into the revise outcome (work-order dispatch against the artifact).
 * @param pending - the detected carrier.
 * @param view - its projection.
 * @param text - the customer's modification request (non-empty).
 */
export function answerGateRevision(pending: GateAskCarrier, view: GateAskView, text: string): void {
  const trimmed = text.trim()
  if (trimmed === '') return
  void Promise.resolve(
    pending.answer({ answers: [{ id: view.id, selected: [], custom: trimmed }] }),
  ).catch(() => undefined)
}
