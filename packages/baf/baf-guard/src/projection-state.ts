/**
 * Synchronous workflow-state reader for the tool guard. The ToolGuard
 * contract is a monotonic synchronous callback, so the guard re-reads the
 * durable projection (index + change log + change ledger) on every call —
 * fail-closed re-adjudication rather than trusting a cached snapshot
 * (enterprise-workflow §8.6: "在每次 tool body 执行前重新裁决").
 * @module @deepseek-ai/dsh-baf-guard/projection-state
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import {
  BAF_VERSION,
  PROJECTION_INDEX_PATH,
  parseBaselineManifest,
  type BaselineManifest,
} from '@deepseek-ai/dsh-baf-core'
import {
  BUG_FIX_PATH_LEDGER_FILE,
  parseProjectionLog,
  replay,
  type ProjectionIndex,
} from '@deepseek-ai/dsh-baf-workflow'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { DEFAULT_GUARD_CONFIG, type GuardPolicyConfig, type GuardWorkflowState } from './policy.ts'

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
 * Read the active change's workflow state synchronously. "Active" = a
 * non-terminal entry in the projection index with the freshest updatedAt;
 * no index / no active entry / unreadable log ⇒ `{ active: false }` — the
 * guard then denies source writes until a change is confirmed.
 * @param workspaceRoot - absolute workspace root.
 * @returns workflow snapshot for adjudication.
 */
export function readGuardWorkflowState(workspaceRoot: string): GuardWorkflowState {
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
  const active = (index.changes ?? [])
    .filter(entry => !TERMINAL.has(entry.current))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.seq - a.seq))[0]
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
    }
  } catch {
    // Corrupted tail: fail closed rather than guessing the stage.
    return { active: true, changeId: active.changeId, intakeConfirmed: false, allowlist: [], gatePending: true }
  }
}
