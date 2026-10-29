/**
 * Synchronous workflow-state reader for the tool guard. The ToolGuard
 * contract is a monotonic synchronous callback, so the guard re-reads the
 * durable projection (index + change log + change ledger) on every call —
 * fail-closed re-adjudication rather than trusting a cached snapshot
 * (enterprise-workflow §8.6: "在每次 tool body 执行前重新裁决").
 * @module @deepseek-ai/dsh-baf-guard/projection-state
 */

import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import {
  BAF_VERSION,
  PROJECTION_INDEX_PATH,
  parseBaselineManifest,
  type BaselineManifest,
} from '@deepseek-ai/dsh-baf-core'
// 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document lifecycle the
// guard locks — the same rule the workflow rail shows.
import { ARTIFACT_FLOW, lockedArtifactDocuments, type ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import {
  BUG_FIX_PATH_LEDGER_FILE,
  focusFor,
  parseProjectionLog,
  replay,
  type ProjectionIndex,
  type ProjectionIndexEntry,
} from '@deepseek-ai/dsh-baf-workflow'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { DEFAULT_GUARD_CONFIG, type GuardPolicyConfig, type GuardWorkflowState } from './policy.ts'
import { stageOfDocument, upstreamDocuments } from './policy.ts'

/** Workspace convention for the governing baseline (guard-side, sync load). */
export const GUARD_BASELINE_PATH = '.baf/baseline.yml'

const TERMINAL = new Set(['completed', 'abandoned'])

function readTextIfPossible(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Load the workspace baseline's guard section synchronously.
 * Missing/corrupt baseline falls back to fail-closed defaults — never to
 * invented enterprise values (§15).
 * @param workspaceRoot - absolute workspace root.
 * @returns guard config.
 */
export function loadGuardConfig(workspaceRoot: string): GuardPolicyConfig {
  const text = readTextIfPossible(join(workspaceRoot, GUARD_BASELINE_PATH))
  if (text === undefined) return DEFAULT_GUARD_CONFIG
  try {
    const manifest: BaselineManifest = parseBaselineManifest(loadYaml(text), BAF_VERSION)
    return {
      secretScan: manifest.guard.secretScan,
      protectedPaths: [...manifest.guard.protectedPaths],
    }
  } catch {
    return DEFAULT_GUARD_CONFIG
  }
}

function readAllowlist(workspaceRoot: string, changeId: string): readonly string[] {
  const changeDir = join(workspaceRoot, 'openspec', 'changes', changeId)
  const plan = readTextIfPossible(join(changeDir, ARTIFACT_FILES.planJson))
  if (plan !== undefined) {
    try {
      const parsed = JSON.parse(plan) as { readonly allowlist?: unknown }
      if (Array.isArray(parsed.allowlist)) return parsed.allowlist.filter((e): e is string => typeof e === 'string')
    } catch {
      // fall through to the fast-path ledger
    }
  }
  const fast = readTextIfPossible(join(changeDir, BUG_FIX_PATH_LEDGER_FILE))
  if (fast !== undefined) {
    try {
      const parsed = JSON.parse(fast) as { readonly allowlist?: unknown }
      if (Array.isArray(parsed.allowlist)) return parsed.allowlist.filter((e): e is string => typeof e === 'string')
    } catch {
      // unreadable ledger → empty allowlist (fail closed)
    }
  }
  return []
}

/**
 * Is `targetPath` inside one change's artifact directory
 * (`openspec/changes/<changeId>/`)? Absolute or workspace-relative input both
 * resolve; separators normalize for Windows.
 */
function pathTargetsChange(workspaceRoot: string, targetPath: string, changeId: string): boolean {
  const changeDir = join(workspaceRoot, 'openspec', 'changes', changeId)
  const absolute = isAbsolute(targetPath) ? targetPath : join(workspaceRoot, targetPath)
  const rel = relative(changeDir, absolute)
  return rel === ''
    || (!isAbsolute(rel) && !rel.split(sep).includes('..'))
}

/**
 * §22.19 — one ranking for every surface. Session 7.jsonl R3: the guard
 * picked by freshest `updatedAt` while the model wrote a different change's
 * artifacts, so confirmed work was refused as 「先确认那条更新的」。 The
 * unified order:
 *
 * 1. **Write path** — the guarded write lands inside some active change's
 *    `openspec/changes/<id>/` directory; that change is what the write is
 *    FOR, regardless of which row is fresher.
 * 2. **Session focus** — the harness focus cache (`focusFor`) names the
 *    change this conversation is driving (best-effort: process-local).
 * 3. **pickActiveChange** — highest `seq`, tie lexical changeId; identical
 *    to the Tab / drives / coordinator ranking, replacing the old
 *    updatedAt-freshest sort.
 */
function pickGuardActive(
  workspaceRoot: string,
  changes: readonly ProjectionIndexEntry[],
  targetPath: string | undefined,
): ProjectionIndexEntry | undefined {
  const actives = changes.filter(entry => !TERMINAL.has(entry.current))
  if (targetPath !== undefined) {
    const byPath = actives.find(entry => pathTargetsChange(workspaceRoot, targetPath, entry.changeId))
    if (byPath !== undefined) return byPath
  }
  const focused = focusFor(workspaceRoot).get()
  if (focused !== undefined) {
    const byFocus = actives.find(entry => entry.changeId === focused)
    if (byFocus !== undefined) return byFocus
  }
  return [...actives].sort((a, b) =>
    a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId),
  )[0]
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 8): the change's documents that a
 * customer-authorized 「同步」 may rewrite — a document whose upstream document
 * is newer than it is.
 *
 * The workflow's own drift detector (`detectArtifactDrift` in
 * `@deepseek-ai/dsh-baf-workflow`) judges the same relation, but it is async
 * and it only judges a COMPLETED stage. The guard needs a synchronous, local
 * answer for one question — "may this document be re-authored?" — so this
 * reads the chain's documents directly. A pure mtime bump therefore unlocks a
 * document here even when its content did not change; the lock this guards is
 * about WHICH document the model may touch, not about content.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - the active change id.
 * @returns workspace-relative paths of the stale documents.
 */
function readStaleDocuments(workspaceRoot: string, changeId: string): readonly string[] {
  const changeDir = join(workspaceRoot, 'openspec', 'changes', changeId)
  const mtimeOf = (fileName: string): number | undefined => {
    try {
      return Math.floor(statSync(join(changeDir, fileName)).mtimeMs)
    } catch {
      return undefined
    }
  }
  const documents = [
    'proposal.md', 'clarify.md', 'design.md', 'plan.md', 'tasks.md',
    'plan.json', 'bug-fix-path-ledger.json', 'checklist.md', 'verify.md', 'verify-report.json',
  ]
  const stale: string[] = []
  for (const fileName of documents) {
    const own = mtimeOf(fileName)
    if (own === undefined) continue
    const stage = stageOfDocument(fileName)
    if (stage === undefined) continue
    const behind = upstreamDocuments(stage).some((upstream) => {
      const upstreamMtime = mtimeOf(upstream)
      return upstreamMtime !== undefined && upstreamMtime > own
    })
    if (behind) stale.push(`openspec/changes/${changeId}/${fileName}`)
  }
  return stale
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the documents the customer
 * CONFIRMED — the ones whose gate was passed (已完成). They are the
 * customer's own word: the model may not rewrite them, and only the customer
 * (by editing the file, or by pressing 同步) may.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - the active change id.
 * @param events - the change's projection events.
 * @returns workspace-relative paths of the confirmed documents.
 */
function readLockedDocuments(
  workspaceRoot: string,
  changeId: string,
  events: readonly ProjectionEvent[],
): readonly string[] {
  const changeDir = join(workspaceRoot, 'openspec', 'changes', changeId)
  const mtimes: Record<string, number> = {}
  for (const fileName of Object.keys(ARTIFACT_FLOW)) {
    try {
      mtimes[fileName] = Math.floor(statSync(join(changeDir, fileName)).mtimeMs)
    } catch {
      // The document does not exist yet — nothing to lock.
    }
  }
  return lockedArtifactDocuments(events, mtimes)
    .map(fileName => `openspec/changes/${changeId}/${fileName}`)
}

/**
 * Read the active change's workflow state synchronously. "Active" = a
 * non-terminal entry in the projection index selected by the §22.19 ranking
 * (write path → session focus → highest seq); no index / no active entry /
 * unreadable log ⇒ `{ active: false }` — the guard then denies source writes
 * until a change is confirmed.
 * @param workspaceRoot - absolute workspace root.
 * @param targetPath - the guarded write's path, when the call is an fs-write
 *   (drives ranking rule 1; omitted for shell/ask adjudications).
 * @returns workflow snapshot for adjudication.
 */
export function readGuardWorkflowState(workspaceRoot: string, targetPath?: string): GuardWorkflowState {
  const indexText = readTextIfPossible(join(workspaceRoot, PROJECTION_INDEX_PATH))
  if (indexText === undefined) {
    return { active: false, intakeConfirmed: false, allowlist: [] }
  }
  let index: ProjectionIndex
  try {
    index = JSON.parse(indexText) as ProjectionIndex
  } catch {
    return { active: false, intakeConfirmed: false, allowlist: [] }
  }
  const active = pickGuardActive(workspaceRoot, index.changes ?? [], targetPath)
  if (active === undefined) {
    return { active: false, intakeConfirmed: false, allowlist: [] }
  }
  const logText = readTextIfPossible(join(workspaceRoot, '.baf', 'projection', `${active.changeId}.jsonl`))
  if (logText === undefined) {
    return { active: false, intakeConfirmed: false, allowlist: [] }
  }
  try {
    const { events } = parseProjectionLog(logText, active.changeId)
    const status = replay(active.changeId, events)
    return {
      active: true,
      changeId: active.changeId,
      stage: status.current,
      mode: status.mode,
      intakeConfirmed: status.intake?.confirmation === 'confirmed',
      allowlist: readAllowlist(workspaceRoot, active.changeId),
      changeDirRel: `openspec/changes/${active.changeId}`,
      // §22.17 J — a gate is pending when the classification is still
      // unconfirmed, or when the log tail is an unresolved awaiting-confirm
      // park (any resolving dispatch appends stage events after it, so the
      // tail stops being awaiting-confirm).
      gatePending: status.intake?.confirmation !== 'confirmed'
        || events.at(-1)?.type === 'awaiting-confirm',
      // 【变更】2026-10-29 (批次三十六 · 用户问题 8): the documents a
      // customer-authorized 「同步」 may rewrite.
      staleDocuments: readStaleDocuments(workspaceRoot, active.changeId),
      // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the documents the
      // customer CONFIRMED (已完成) — the model may no longer rewrite them.
      lockedDocuments: readLockedDocuments(workspaceRoot, active.changeId, events),
    }
  } catch {
    // Corrupted tail: fail closed rather than guessing the stage.
    return { active: true, changeId: active.changeId, intakeConfirmed: false, allowlist: [], gatePending: true }
  }
}
