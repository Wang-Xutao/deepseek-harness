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
 * The rule is deliberately mechanical: a document is STALE when an upstream
 * stage's document has a STRICTLY NEWER mtime. No content diffing, no git —
 * the same `stat` primitive the orchestrator's gate fingerprint uses
 * (`artifactFingerprintOf` in `orchestrator.ts`).
 *
 * @module @deepseek-ai/dsh-baf-workflow/stages/artifact-drift
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkflowNode } from '@deepseek-ai/dsh-baf-core'
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
  /** The stale artifact's modification time, epoch ms. */
  readonly mtimeMs: number
}

/**
 * 【变更】2026-10-27: the artifact each document stage owns — the file the
 * stage's work order names and its gate judges.
 *
 * This mirrors `gates.ts`'s `DOC_ARTIFACT_ORDER` / `BUG_FIX_ARTIFACT_ORDER`
 * (the rail's file order) KEYED BY STAGE: the rail lists files, the drift
 * needs the owning stage, and every file in the chain belongs to exactly one
 * stage — `plan.md` is the plan stage's document, `plan.json` the implement
 * stage's ledger (the plan stage writes both; only the ledger keeps moving
 * while the implementation runs).
 */
function artifactCandidates(
  node: DriftStage,
  mode: 'full-go-path' | 'bug-fix-path',
): readonly string[] {
  switch (node) {
    case 'open': return [ARTIFACT_FILES.proposal]
    case 'clarify': return [ARTIFACT_FILES.clarify]
    case 'design': return [ARTIFACT_FILES.design]
    case 'plan': return [ARTIFACT_FILES.plan]
    // The implement stage's ledger is mode-named (the fast-path ledger lives
    // at its own file name); the second candidate is the other mode's ledger.
    case 'implement': return mode === 'bug-fix-path'
      ? [BUG_FIX_PATH_LEDGER_FILE, ARTIFACT_FILES.planJson]
      : [ARTIFACT_FILES.planJson, BUG_FIX_PATH_LEDGER_FILE]
    case 'verify': return [CHECKLIST_FILE]
  }
}

/**
 * The mtime of one stage's artifact — the first candidate that exists.
 *
 * A missing or unreadable file is simply absent: it contributes no mtime and
 * is never reported as stale. The read never throws.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param candidates - the stage's candidate file names, in priority order.
 * @returns the artifact's file name + mtime, or undefined when none exists.
 */
async function artifactMtimeOf(
  workspaceRoot: string,
  changeId: string,
  candidates: readonly string[],
): Promise<{ readonly file: string; readonly mtimeMs: number } | undefined> {
  for (const file of candidates) {
    try {
      const s = await stat(join(workspaceRoot, 'openspec', 'changes', changeId, file))
      return { file, mtimeMs: Math.floor(s.mtimeMs) }
    } catch {
      // Absent or unreadable — the next candidate may be this change's file.
    }
  }
  return undefined
}

/**
 * The stale documents of one change — a LATER stage's document that predates
 * an EARLIER stage's document.
 *
 * The stage chain is the document chain only (`open → clarify → design →
 * plan → implement → verify`; the bug-fix path clips clarify/design/plan). A
 * stage is stale when some upstream stage's artifact has a STRICTLY NEWER
 * mtime; the row pairs it with the NEWEST such upstream artifact. A missing
 * artifact is absent, never stale.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param mode - the change's mode (the bug-fix path clips the doc stages).
 * @returns one row per stale document, in stage order.
 */
export async function detectArtifactDrift(
  workspaceRoot: string,
  changeId: string,
  mode: 'full-go-path' | 'bug-fix-path',
): Promise<readonly ArtifactDriftRow[]> {
  const stages: readonly DriftStage[] = mode === 'bug-fix-path' ? BUG_FIX_DRIFT_STAGES : DRIFT_STAGES
  const observed: { node: DriftStage; file: string; mtimeMs: number }[] = []
  for (const node of stages) {
    const artifact = await artifactMtimeOf(workspaceRoot, changeId, artifactCandidates(node, mode))
    if (artifact !== undefined) observed.push({ node, file: artifact.file, mtimeMs: artifact.mtimeMs })
  }
  const rows: ArtifactDriftRow[] = []
  for (const [index, target] of observed.entries()) {
    let newest: (typeof observed)[number] | undefined
    for (const upstream of observed.slice(0, index)) {
      if (upstream.mtimeMs > target.mtimeMs && (newest === undefined || upstream.mtimeMs > newest.mtimeMs)) {
        newest = upstream
      }
    }
    if (newest !== undefined) {
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
