/**
 * Artifact drift — the stage documents that were written BEFORE an upstream
 * document changed.
 *
 * The problem this solves (2026-10-27): the customer edits `proposal.md` (or
 * any upstream document) AFTER `design.md` was written. Nothing in the
 * workflow noticed — every gate judges a document on its OWN shape, so the
 * change still walked to archive while the shipped documents contradicted each
 * other. This module names the stale documents, so the Tab can show them and
 * one sync work order can re-author them.
 *
 * 【变更】2026-10-28 (批次三十三 · 用户问题 1): a stage's time is the write of
 * the document its GATE judges, and stages are compared against each other.
 *
 * The old rule compared one file per stage against one file per other stage by
 * raw mtime, so the order the model happened to write two files of the SAME
 * stage decided the verdict. The plan stage is the case the customer filed:
 * `plan.md` and `tasks.md` are RENDERED from the ledger, so ticking a task
 * re-writes them and their mtime jumped past the documents that came after
 * them — the change was reported as 「产物不同步」 although nobody had edited
 * anything.
 *
 * The rule now: a stage's time is the mtime of its own artifact (the document
 * its gate judges), and a stage is stale when an upstream stage's artifact has
 * a STRICTLY NEWER mtime. The plan stage's artifact is the ledger, so the
 * renderings that follow it need no separate signal — and the plan stage and
 * the implement stage (which share that ledger) can never disagree with each
 * other.
 *
 * 【变更】2026-10-28 (批次三十四 · 用户问题 1): the ledger is NOT evidence.
 *
 * The rule above still reported 「plan.json 在 checklist.md 之后被修改」 on a
 * change nobody had touched, and the customer filed it. The evidence was the
 * implementation ledger `plan.json`: the model authors `checklist.md` while the
 * implementation is still running, then ticks the last task, so the ledger's
 * mtime lands AFTER the checklist's. The two files are not out of sync — the
 * ledger is the implementation's own progress tracker and it moves by design.
 *
 * So only an AUTHORED document can create drift: the proposal, the
 * clarification, the design — the documents a customer can edit by hand. The
 * ledger and its renderings (`plan.md` / `tasks.md`) are bookkeeping: they are
 * rewritten whenever the ledger changes, and a customer's edit to them does not
 * survive the next render. They stay TARGETS (the plan and the implementation
 * are stale when the design moved under them), but they are never EVIDENCE.
 *
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1): an IN-PROGRESS stage is the
 * model's authoring domain — the detector judges only SETTLED stages, and it
 * judges them against COMPLETION time, not file order.
 *
 * The rule above still mis-fired on the customer's case: the model authored
 * `clarify.md` and `proposal.md` in the SAME turn (a revision during the
 * clarify stage), and whichever file it happened to write SECOND read as
 * evidence that the other was 「文档不同步」 — the change was held for a
 * desync nobody had caused, and the 同步 click then collided with the very
 * turn that was still writing. The write order inside one authoring turn says
 * nothing about the documents' agreement.
 *
 * So a stage participates only once its `stage-completed` event has landed,
 * and the comparison reads the event's completion time: a row fires only when
 * an upstream AUTHORED document was written after the target stage COMPLETED
 * and after the target document's own last write. The first condition skips
 * everything the model may still be re-authoring; the second is what a sync
 * clears — the sync rewrites the downstream documents AFTER the upstream
 * edit, so their mtimes pass and the row drops.
 *
 * @module @deepseek-ai/dsh-baf-workflow/stages/artifact-drift
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectionEvent, WorkflowNode } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { BUG_FIX_PATH_LEDGER_FILE } from './bug-fix-path.ts'
import { CHECKLIST_FILE } from './gates.ts'

/**
 * The workflow stage ids — baf-core's `WorkflowNode`, spelled the way the
 * client mirror spells it (`WorkflowNodeId` in the Tab's `tab-types.ts`).
 */
export type WorkflowNodeId = WorkflowNode

/**
 * 【变更】2026-10-27: the DOCUMENT stage chain the drift walks — intake
 * writes nothing and archive moves everything, so neither can be stale.
 */
export const DRIFT_STAGES = ['open', 'clarify', 'design', 'plan', 'implement', 'verify'] as const

/** One drift row's stage id — the document stages only. */
export type DriftStage = (typeof DRIFT_STAGES)[number]

/**
 * 【变更】2026-10-27: the bug-fix path CLIPS clarify/design/plan (it never
 * writes them), so its chain is open → implement → verify.
 */
const BUG_FIX_DRIFT_STAGES = ['open', 'implement', 'verify'] as const

/** One stage whose artifact predates an upstream stage's artifact. */
export interface ArtifactDriftRow {
  /** The stale stage — the stage whose document must be re-authored. */
  readonly node: WorkflowNodeId
  /** The stale artifact's file name (e.g. 'design.md'). */
  readonly file: string
  /** The upstream stage whose artifact is newer. */
  readonly sourceNode: WorkflowNodeId
  /** The upstream artifact's file name (e.g. 'proposal.md'). */
  readonly sourceFile: string
  /** The upstream artifact's modification time, epoch ms. */
  readonly sourceMtimeMs: number
  /** The stale stage's last write, epoch ms. */
  readonly mtimeMs: number
}

/** One stage of the chain as the detector sees it. */
interface ObservedStage {
  /** The stage id. */
  readonly node: DriftStage
  /** The stage's tracked artifact — the document a stale row names. */
  readonly file: string
  /** The tracked artifact's modification time, epoch ms. */
  readonly mtimeMs: number
  /** The stage's authored document — the only document that can be evidence. */
  readonly authored?: { readonly file: string; readonly mtimeMs: number }
}
/**
 * 【变更】2026-10-28 (批次三十三 · 用户问题 1): the document each stage's GATE
 * judges — the stage's authoring time.
 *
 * The plan stage is the case the customer filed. `plan.md` and `tasks.md` are
 * RENDERED from the ledger (`plan.ts` re-renders both whenever the ledger
 * changes — ticking one task re-writes them), so their mtime says "when the
 * ledger was last rendered", never "when the plan was authored". Reading the
 * stage's time from them made the verdict depend on the order the model
 * happened to write two files in, and the change was reported as 「产物不同
 * 步」 although nobody had edited anything.
 *
 * The plan stage's artifact is the LEDGER — its gate requirement names
 * `plan.json`, and plan.md / tasks.md are rendered from it — so that is the
 * time the drift reads. The renderings follow the ledger, so they need no
 * separate signal.
 *
 * @param node - the stage whose artifact is wanted.
 * @param mode - the change's mode (the bug-fix path clips the doc stages).
 * @returns the stage's artifact file names, in priority order.
 */
function stageArtifact(
  node: DriftStage,
  mode: 'full-go-path' | 'bug-fix-path',
): readonly string[] {
  switch (node) {
    case 'open': return [ARTIFACT_FILES.proposal]
    case 'clarify': return [ARTIFACT_FILES.clarify]
    case 'design': return [ARTIFACT_FILES.design]
    // The plan stage's gate judges the ledger. The bug-fix path never reaches
    // the plan stage (it is clipped), so it has no artifact there.
    case 'plan': return mode === 'bug-fix-path' ? [] : [ARTIFACT_FILES.planJson]
    // The implement stage's artifact is the LEDGER too — the plan stage
    // created it and the implementation ticks it. It is mode-named (the
    // fast-path ledger lives at its own file name); the second candidate is
    // the other mode's ledger, for a change that switched modes.
    case 'implement': return mode === 'bug-fix-path'
      ? [BUG_FIX_PATH_LEDGER_FILE, ARTIFACT_FILES.planJson]
      : [ARTIFACT_FILES.planJson, BUG_FIX_PATH_LEDGER_FILE]
    case 'verify': return [CHECKLIST_FILE]
  }
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 1): the document each stage
 * AUTHORED — the only document whose later write can make a downstream
 * document stale.
 *
 * The ledger (`plan.json` / `bug-fix-path-ledger.json`) and the documents
 * rendered from it (`plan.md` / `tasks.md`) are bookkeeping, not evidence: the
 * implementation ticks the ledger while it runs, the plan stage re-renders the
 * two documents whenever the ledger changes, and a customer's edit to either
 * does not survive the next render. Reading the ledger as evidence made the
 * detector report 「plan.json 在 checklist.md 之后被修改」 on a change nobody
 * had touched — the model authors the checklist while the implementation is
 * still running and ticks the last task afterwards, so the two files' write
 * order says nothing about their agreement.
 *
 * The proposal, the clarification and the design are the documents a customer
 * edits by hand: when one of them changes after a downstream document was
 * written, that downstream document really can be out of date.
 *
 * @param node - the stage whose authored document is wanted.
 * @returns the stage's authored document, or an empty list when it has none.
 */
function authoredDocument(node: DriftStage): readonly string[] {
  switch (node) {
    case 'open': return [ARTIFACT_FILES.proposal]
    case 'clarify': return [ARTIFACT_FILES.clarify]
    case 'design': return [ARTIFACT_FILES.design]
    // The plan stage renders its documents from the ledger, and the implement
    // stage's only artifact IS the ledger — neither authors a document a
    // customer can edit.
    case 'plan':
    case 'implement': return []
    case 'verify': return [CHECKLIST_FILE]
  }
}

/**
 * The existing documents of one stage, with their mtimes.
 *
 * A missing or unreadable file is simply absent: it contributes no mtime and
 * is never reported as stale. The read never throws.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param candidates - the stage's artifact file names, in priority order.
 * @returns the documents that exist, in the candidate order.
 */
async function existingArtifacts(
  workspaceRoot: string,
  changeId: string,
  candidates: readonly string[],
): Promise<readonly { readonly file: string; readonly mtimeMs: number }[]> {
  const found: { file: string; mtimeMs: number }[] = []
  for (const file of candidates) {
    try {
      const s = await stat(join(workspaceRoot, 'openspec', 'changes', changeId, file))
      found.push({ file, mtimeMs: Math.floor(s.mtimeMs) })
    } catch {
      // Absent or unreadable — the next candidate may be this change's file.
    }
  }
  return found
}

/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1): each stage's LAST completion
 * time, folded from the change's event log.
 *
 * Completion — not a file's mtime — is what settles a stage. The model authors
 * a stage's documents across a whole turn (a revision may touch `proposal.md`
 * and `clarify.md` in one go), so the files' write order inside that turn says
 * nothing; only once the `stage-completed` event lands is the document settled
 * enough to be judged against upstream edits. A stage with NO completion event
 * does not participate at all: it is either not reached or still being
 * authored, and the model's authoring domain is not the customer's desync.
 *
 * @param events - the change's projection events.
 * @returns the last `stage-completed` time (epoch ms) per drift stage.
 */
function completedAtByStage(events: readonly ProjectionEvent[]): ReadonlyMap<DriftStage, number> {
  const completed = new Map<DriftStage, number>()
  for (const event of events) {
    if (event.type !== 'stage-completed') continue
    if (!isDriftStage(event.node)) continue
    const at = Date.parse(event.at)
    if (Number.isNaN(at)) continue
    const previous = completed.get(event.node)
    if (previous === undefined || at > previous) completed.set(event.node, at)
  }
  return completed
}

/**
 * The stale documents of one change — a SETTLED stage's artifact that predates
 * an EARLIER stage's AUTHORED document.
 *
 * The stage chain is the document chain only (`open → clarify → design →
 * plan → implement → verify`; the bug-fix path clips clarify/design/plan). A
 * stage is stale when some upstream stage's authored document was written
 * AFTER the target stage completed AND after the target artifact's own last
 * write; the row pairs it with the NEWEST such upstream document. A missing
 * artifact is absent — never stale, and never evidence for a downstream
 * stage.
 *
 * 【变更】2026-10-28 (批次三十四 · 用户问题 1): only an authored document is
 * evidence (see {@link authoredDocument}).
 *
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1): only a COMPLETED stage is
 * judged, against its completion time (see {@link completedAtByStage}) — the
 * model's in-progress authoring turn is not a desync.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param mode - the change's mode (the bug-fix path clips the doc stages).
 * @param events - the change's projection events (the completion times).
 * @returns one row per stale document, in stage order.
 */
export async function detectArtifactDrift(
  workspaceRoot: string,
  changeId: string,
  mode: 'full-go-path' | 'bug-fix-path',
  events: readonly ProjectionEvent[],
): Promise<readonly ArtifactDriftRow[]> {
  const completedAt = completedAtByStage(events)
  const stages: readonly DriftStage[] = mode === 'bug-fix-path' ? BUG_FIX_DRIFT_STAGES : DRIFT_STAGES
  const observed: ObservedStage[] = []
  for (const node of stages) {
    // 【变更】2026-10-28 (批次三十五 · 用户问题 1): a stage with no completion
    // event is the model's authoring domain (not reached, or being authored
    // right now) — its files' write order carries no desync signal, so the
    // stage is neither a target nor evidence until it settles.
    const settledAt = completedAt.get(node)
    if (settledAt === undefined) continue
    const artifacts = await existingArtifacts(workspaceRoot, changeId, stageArtifact(node, mode))
    const judged = artifacts[0]
    if (judged === undefined) continue
    const authored = await existingArtifacts(workspaceRoot, changeId, authoredDocument(node))
    observed.push({
      node,
      file: judged.file,
      mtimeMs: judged.mtimeMs,
      ...(authored[0] === undefined ? {} : { authored: authored[0] }),
    })
  }
  const rows: ArtifactDriftRow[] = []
  const reported = new Set<string>()
  for (const [index, target] of observed.entries()) {
    // The plan stage and the implement stage share the ledger: the plan
    // created it, the implementation ticks it. The artifact is reported once,
    // at the EARLIEST stage that owns it — the plan is the stage that has to
    // re-author it, and the sync order re-authors everything after it anyway.
    if (reported.has(target.file)) continue
    // 【变更】2026-10-28 (批次三十五 · 用户问题 1): the stage's COMPLETION time —
    // an upstream write that lands before it happened inside the stage's own
    // authoring turn and carries no desync signal. Only a write AFTER it (and
    // after the target artifact's own last write, so a sync rewrite clears
    // the row) is a real desync.
    const settledAt = completedAt.get(target.node)
    if (settledAt === undefined) continue
    let newest: { node: DriftStage; file: string; mtimeMs: number } | undefined
    for (const upstream of observed.slice(0, index)) {
      const evidence = upstream.authored
      if (evidence === undefined) continue
      if (
        evidence.mtimeMs > settledAt
        && evidence.mtimeMs > target.mtimeMs
        && (newest === undefined || evidence.mtimeMs > newest.mtimeMs)
      ) {
        newest = { node: upstream.node, file: evidence.file, mtimeMs: evidence.mtimeMs }
      }
    }
    if (newest !== undefined) {
      reported.add(target.file)
      rows.push({
        node: target.node,
        file: target.file,
        sourceNode: newest.node,
        sourceFile: newest.file,
        sourceMtimeMs: newest.mtimeMs,
        mtimeMs: target.mtimeMs,
      })
    }
  }
  return rows
}

/**
 * Whether one stage id is one of the document stages the drift chain runs
 * through — the narrowing a dispatch site needs before it can name the stage.
 * @param node - the stage id to test.
 * @returns true when the stage participates in the drift chain.
 */
export function isDriftStage(node: WorkflowNodeId): node is DriftStage {
  return (DRIFT_STAGES as readonly string[]).includes(node)
}

/**
 * The sync work order's per-document lines (model-facing copy): which
 * document is stale, and which upstream document it must follow.
 * @param rows - the stale documents.
 * @returns one line per stale document.
 */
export function driftWorkLines(rows: readonly ArtifactDriftRow[]): readonly string[] {
  return rows.map(row =>
    `- ${row.file}：上游 ${row.sourceFile} 在本文件之后被修改——按 ${row.sourceFile} 的最新内容重写 ${row.file}`,
  )
}

/**
 * The workspace-relative path of one stale document.
 * @param changeId - change id.
 * @param file - the artifact's file name.
 * @returns the workspace-relative path.
 */
export function driftArtifactPath(changeId: string, file: string): string {
  return `openspec/changes/${changeId}/${file}`
}
